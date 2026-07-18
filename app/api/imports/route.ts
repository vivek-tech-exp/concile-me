import {
  idempotencyKeySchema,
  type ImportResponse,
  type ImportWarning,
  type CsvSource,
} from "@/features/imports/contracts";
import { prepareImportFromFiles } from "@/features/imports/prepare-import";
import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/validation/env";
import { z } from "zod";

export const runtime = "nodejs";

function jsonResponse(body: ImportResponse, status = 200): Response {
  return Response.json(body, { status });
}

function warningToRpcPayload(warning: ImportWarning) {
  return {
    code: warning.code,
    severity: warning.severity,
    message: warning.message,
    sort_key: warning.sort_key,
    ...(warning.currency ? { currency: warning.currency } : {}),
    ...(warning.financial_impact_minor !== undefined
      ? { financial_impact_minor: warning.financial_impact_minor }
      : {}),
    ...(warning.order_record_source_rows
      ? { order_record_source_rows: warning.order_record_source_rows }
      : {}),
    ...(warning.payment_record_source_rows
      ? { payment_record_source_rows: warning.payment_record_source_rows }
      : {}),
  };
}

const persistedBatchSchema = z.object({
  id: z.uuid(),
  orders_row_count: z.number().int().nonnegative(),
  payments_row_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
});

const persistedFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.string().min(1),
  message: z.string().min(1),
  sort_key: z.string().min(1),
  currency: z.string().nullable(),
  financial_impact_minor: z.number().nullable(),
});

function warningFromPersistedFinding(
  finding: z.infer<typeof persistedFindingSchema>,
): ImportWarning {
  const match = /^(orders|payments):(\d+):/.exec(finding.sort_key);
  const source: CsvSource =
    match?.[1] === "payments" ? "payments" : "orders";
  const sourceRowNumber = match ? Number(match[2]) : 0;
  const warning: ImportWarning = {
    code: finding.code,
    severity: "low",
    message: finding.message,
    sort_key: finding.sort_key,
    source,
    source_row_number: sourceRowNumber,
  };

  if (finding.currency) {
    warning.currency = finding.currency;
  }
  if (finding.financial_impact_minor !== null) {
    warning.financial_impact_minor = finding.financial_impact_minor;
  }
  if (source === "orders" && sourceRowNumber > 0) {
    warning.order_record_source_rows = [sourceRowNumber];
  }
  if (source === "payments" && sourceRowNumber > 0) {
    warning.payment_record_source_rows = [sourceRowNumber];
  }

  return warning;
}

async function loadPersistedImportResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
): Promise<ImportResponse | null> {
  const { data: batchRow, error: batchError } = await supabase
    .from("import_batches")
    .select("id, orders_row_count, payments_row_count, warning_count")
    .eq("id", batchId)
    .eq("status", "completed")
    .maybeSingle();

  if (batchError || !batchRow) {
    return null;
  }

  const batch = persistedBatchSchema.safeParse(batchRow);
  if (!batch.success) {
    return null;
  }

  const { data: findings, error: findingsError } = await supabase
    .from("findings")
    .select(
      "code, severity, message, sort_key, currency, financial_impact_minor",
    )
    .eq("import_batch_id", batchId)
    .is("reconciliation_id", null)
    .order("sort_key", { ascending: true });

  if (findingsError) {
    return null;
  }

  const parsedFindings = z.array(persistedFindingSchema).safeParse(findings ?? []);
  if (!parsedFindings.success) {
    return null;
  }

  return {
    ok: true,
    batchId: batch.data.id,
    orderCount: batch.data.orders_row_count,
    paymentCount: batch.data.payments_row_count,
    warnings: parsedFindings.data.map(warningFromPersistedFinding),
  };
}

function getSingleFile(
  formData: FormData,
  key: string,
): File | { error: string } {
  const values = formData.getAll(key);
  if (values.length === 0) {
    return { error: `Missing ${key} file` };
  }
  if (values.length > 1) {
    return { error: `Duplicate ${key} file` };
  }
  const value = values[0];
  if (!(value instanceof File)) {
    return { error: `${key} must be a file` };
  }
  return value;
}

export async function POST(request: Request): Promise<Response> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "CONFIG",
            message: "Service configuration is incomplete",
            retryable: false,
          },
        },
        503,
      );
    }
    throw error;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Sign in to import CSV files",
          retryable: false,
        },
      },
      401,
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Request must be multipart/form-data",
          retryable: false,
        },
      },
      415,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Could not read the upload body",
          retryable: true,
        },
      },
      400,
    );
  }

  const idempotencyRaw = formData.get("idempotencyKey");
  if (typeof idempotencyRaw !== "string") {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "IDEMPOTENCY_KEY",
          message: "idempotencyKey is required",
          issues: [
            {
              source: "request",
              field: "idempotencyKey",
              code: "REQUIRED",
              message: "idempotencyKey is required",
            },
          ],
          totalIssueCount: 1,
          retryable: false,
        },
      },
      400,
    );
  }

  const idempotencyParsed = idempotencyKeySchema.safeParse(idempotencyRaw);
  if (!idempotencyParsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "IDEMPOTENCY_KEY",
          message: "idempotencyKey must be a UUID",
          issues: [
            {
              source: "request",
              field: "idempotencyKey",
              code: "INVALID",
              message: "idempotencyKey must be a UUID",
            },
          ],
          totalIssueCount: 1,
          retryable: false,
        },
      },
      400,
    );
  }

  const ordersFile = getSingleFile(formData, "orders");
  const paymentsFile = getSingleFile(formData, "payments");
  if (!("name" in ordersFile) || !("name" in paymentsFile)) {
    const issues = [];
    if (!("name" in ordersFile)) {
      issues.push({
        source: "request" as const,
        field: "orders",
        code: "FILE",
        message: ordersFile.error,
      });
    }
    if (!("name" in paymentsFile)) {
      issues.push({
        source: "request" as const,
        field: "payments",
        code: "FILE",
        message: paymentsFile.error,
      });
    }
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "FILES",
          message: "Exactly one orders file and one payments file are required",
          issues,
          totalIssueCount: issues.length,
          retryable: false,
        },
      },
      400,
    );
  }

  const prepared = await prepareImportFromFiles(ordersFile, paymentsFile);
  if (!prepared.ok) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "CSV validation failed",
          issues: prepared.issues,
          totalIssueCount: prepared.totalIssueCount,
          retryable: false,
        },
      },
      400,
    );
  }

  const { data: batchId, error } = await supabase.rpc("create_import_batch", {
    p_idempotency_key: idempotencyParsed.data,
    p_orders_filename: prepared.data.ordersFilename,
    p_payments_filename: prepared.data.paymentsFilename,
    p_orders: prepared.data.orders,
    p_payments: prepared.data.payments,
    p_warnings: prepared.data.warnings.map(warningToRpcPayload),
  });

  if (error || typeof batchId !== "string") {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "PERSISTENCE",
          message: "Import could not be saved. Please retry.",
          retryable: true,
        },
      },
      503,
    );
  }

  // Always return persisted counts/warnings so idempotent retries cannot
  // report a different upload that was not written.
  const persisted = await loadPersistedImportResponse(supabase, batchId);
  if (!persisted) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "PERSISTENCE",
          message: "Import could not be saved. Please retry.",
          retryable: true,
        },
      },
      503,
    );
  }

  return jsonResponse(persisted);
}
