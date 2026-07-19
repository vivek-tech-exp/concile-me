import { z } from "zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HISTORY_WARNING_PREVIEW } from "@/features/imports/contracts";
import { createClient } from "@/lib/supabase/server";

const importBatchSchema = z.object({
  id: z.uuid(),
  orders_filename: z.string().min(1),
  payments_filename: z.string().min(1),
  created_at: z.string().min(1),
  orders_row_count: z.number().int().nonnegative(),
  payments_row_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
});

const warningSchema = z.object({
  id: z.uuid(),
  import_batch_id: z.uuid(),
  code: z.string().min(1),
  message: z.string().min(1),
  sort_key: z.string().min(1),
  reconciliation_id: z.string().uuid().nullable(),
});

export type ImportListItem = z.infer<typeof importBatchSchema> & {
  warnings: Array<z.infer<typeof warningSchema>>;
};

async function loadWarningPreviewForBatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  warningCount: number,
): Promise<
  | { ok: true; warnings: Array<z.infer<typeof warningSchema>> }
  | { ok: false; message: string }
> {
  if (warningCount === 0) {
    return { ok: true, warnings: [] };
  }

  const { data: findings, error: findingError } = await supabase
    .from("findings")
    .select("id, import_batch_id, code, message, sort_key, reconciliation_id")
    .eq("import_batch_id", batchId)
    .is("reconciliation_id", null)
    .order("sort_key", { ascending: true })
    .limit(HISTORY_WARNING_PREVIEW);

  if (findingError) {
    return {
      ok: false,
      message: "Could not load import warnings. Please refresh and try again.",
    };
  }

  const parsedWarnings = z.array(warningSchema).safeParse(findings ?? []);
  if (!parsedWarnings.success) {
    return {
      ok: false,
      message: "Import warnings returned unexpected data.",
    };
  }

  return { ok: true, warnings: parsedWarnings.data };
}

export async function loadOwnedImports(): Promise<
  | { ok: true; imports: ImportListItem[] }
  | { ok: false; message: string }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, message: "Sign in to view imports." };
    }

    const { data: batches, error: batchError } = await supabase
      .from("import_batches")
      .select(
        "id, orders_filename, payments_filename, created_at, orders_row_count, payments_row_count, warning_count",
      )
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (batchError) {
      return {
        ok: false,
        message: "Could not load import history. Please refresh and try again.",
      };
    }

    const parsedBatches = z.array(importBatchSchema).safeParse(batches ?? []);
    if (!parsedBatches.success) {
      return {
        ok: false,
        message: "Import history returned unexpected data.",
      };
    }

    const imports: ImportListItem[] = [];
    for (const batch of parsedBatches.data) {
      const preview = await loadWarningPreviewForBatch(
        supabase,
        batch.id,
        batch.warning_count,
      );
      if (!preview.ok) {
        return preview;
      }
      imports.push({
        ...batch,
        warnings: preview.warnings,
      });
    }

    return { ok: true, imports };
  } catch {
    return {
      ok: false,
      message: "Could not load import history. Please refresh and try again.",
    };
  }
}

export function ImportHistory({
  result,
}: {
  result: Awaited<ReturnType<typeof loadOwnedImports>>;
}) {
  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Your completed CSV imports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-destructive" role="alert">
            {result.message}
          </p>
          <a className="underline underline-offset-4" href="/app">
            Retry
          </a>
        </CardContent>
      </Card>
    );
  }

  if (result.imports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Your completed CSV imports</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No imports yet. Upload a paired orders and payments CSV to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import history</CardTitle>
        <CardDescription>Your completed CSV imports</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {result.imports.map((item) => {
            const created = new Date(item.created_at);
            const createdLabel = Number.isNaN(created.getTime())
              ? item.created_at
              : created.toLocaleString();
            const previewTruncated =
              item.warning_count > item.warnings.length &&
              item.warnings.length > 0;

            return (
              <li
                key={item.id}
                className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {item.orders_filename} + {item.payments_filename}
                  </p>
                  <p className="text-xs text-muted-foreground">{createdLabel}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.orders_row_count} orders · {item.payments_row_count}{" "}
                  payments · {item.warning_count} warning
                  {item.warning_count === 1 ? "" : "s"}
                </p>
                {item.warnings.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {item.warnings.map((warning) => (
                      <li key={warning.id}>
                        {warning.code}: {warning.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {previewTruncated ? (
                  <p className="text-xs text-muted-foreground">
                    Showing first {item.warnings.length} of {item.warning_count}{" "}
                    warnings.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
