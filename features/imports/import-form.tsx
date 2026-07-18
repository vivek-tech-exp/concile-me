"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_FILE_BYTES,
  type ImportIssue,
  type ImportResponse,
  type ImportWarning,
} from "@/features/imports/contracts";

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function ImportForm() {
  const router = useRouter();
  const ordersId = useId();
  const paymentsId = useId();
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [paymentsFile, setPaymentsFile] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{
    orderCount: number;
    paymentCount: number;
    warnings: ImportWarning[];
  } | null>(null);
  const [error, setError] = useState<{
    message: string;
    retryable: boolean;
    issues?: ImportIssue[];
    totalIssueCount?: number;
  } | null>(null);

  const bothSelected = ordersFile !== null && paymentsFile !== null;
  const canSubmit = bothSelected && !isPending;

  function submit() {
    if (!ordersFile || !paymentsFile) {
      return;
    }

    startTransition(async () => {
      setError(null);
      setSuccess(null);

      const body = new FormData();
      body.set("idempotencyKey", idempotencyKey);
      body.set("orders", ordersFile);
      body.set("payments", paymentsFile);

      try {
        const response = await fetch("/api/imports", {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as ImportResponse;

        if (!payload.ok) {
          setError({
            message: payload.error.message,
            retryable: payload.error.retryable,
            issues: payload.error.issues,
            totalIssueCount: payload.error.totalIssueCount,
          });
          return;
        }

        setSuccess({
          orderCount: payload.orderCount,
          paymentCount: payload.paymentCount,
          warnings: payload.warnings,
        });
        setIdempotencyKey(newIdempotencyKey());
        setOrdersFile(null);
        setPaymentsFile(null);
        router.refresh();
      } catch {
        setError({
          message: "Network error while importing. Please retry.",
          retryable: true,
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import CSV files</CardTitle>
        <CardDescription>
          Upload one orders CSV and one payments CSV (UTF-8, comma-separated, max
          1 MiB and 5,000 data rows each).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ordersId}>Orders CSV</Label>
            <Input
              id={ordersId}
              type="file"
              accept=".csv,text/csv"
              disabled={isPending}
              aria-describedby={`${ordersId}-hint`}
              onChange={(event) => {
                setOrdersFile(event.target.files?.[0] ?? null);
                setSuccess(null);
                setError(null);
              }}
            />
            <p id={`${ordersId}-hint`} className="text-xs text-muted-foreground">
              Required headers: order_id, order_date, customer_email, currency,
              gross_amount, discount, net_amount, status. Client size hint only:
              under {MAX_FILE_BYTES.toLocaleString()} bytes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={paymentsId}>Payments CSV</Label>
            <Input
              id={paymentsId}
              type="file"
              accept=".csv,text/csv"
              disabled={isPending}
              aria-describedby={`${paymentsId}-hint`}
              onChange={(event) => {
                setPaymentsFile(event.target.files?.[0] ?? null);
                setSuccess(null);
                setError(null);
              }}
            />
            <p
              id={`${paymentsId}-hint`}
              className="text-xs text-muted-foreground"
            >
              Required headers: transaction_ref, processed_at, order_reference,
              currency, amount, fee, net_settled, type, status. Client size hint
              only: under {MAX_FILE_BYTES.toLocaleString()} bytes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            aria-busy={isPending}
          >
            {isPending ? "Importing…" : "Import files"}
          </Button>
          {error?.retryable ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending || !bothSelected}
              onClick={submit}
            >
              Retry
            </Button>
          ) : null}
        </div>

        {isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Validating and saving your import…
          </p>
        ) : null}

        {success ? (
          <div
            className="space-y-2 rounded-lg border border-border p-4 text-sm"
            role="status"
          >
            <p>
              Imported {success.orderCount} orders and {success.paymentCount}{" "}
              payments with {success.warnings.length} warning
              {success.warnings.length === 1 ? "" : "s"}.
            </p>
            {success.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {success.warnings.map((warning) => (
                  <li key={warning.sort_key}>
                    {warning.source} row {warning.source_row_number}:{" "}
                    {warning.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div
            className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            <p>{error.message}</p>
            {typeof error.totalIssueCount === "number" ? (
              <p>
                {error.totalIssueCount} issue
                {error.totalIssueCount === 1 ? "" : "s"} found
                {error.issues && error.issues.length < error.totalIssueCount
                  ? ` (showing first ${error.issues.length})`
                  : ""}
                .
              </p>
            ) : null}
            {error.issues && error.issues.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {error.issues.map((issue, index) => (
                  <li key={`${issue.code}-${issue.row ?? "x"}-${index}`}>
                    {issue.source}
                    {issue.row ? ` row ${issue.row}` : ""}
                    {issue.field ? ` (${issue.field})` : ""}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
