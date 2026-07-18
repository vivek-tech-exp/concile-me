import { z } from "zod";

export const MAX_FILE_BYTES = 1_048_576;
export const MAX_DATA_ROWS = 5_000;
export const MAX_ISSUE_DETAILS = 100;
/** Cap warning detail payloads returned by import success responses. */
export const MAX_WARNING_DETAILS = 100;
/** Cap warning previews shown per batch in import history. */
export const HISTORY_WARNING_PREVIEW = 5;

export const ORDER_HEADERS = [
  "order_id",
  "order_date",
  "customer_email",
  "currency",
  "gross_amount",
  "discount",
  "net_amount",
  "status",
] as const;

export const PAYMENT_HEADERS = [
  "transaction_ref",
  "processed_at",
  "order_reference",
  "currency",
  "amount",
  "fee",
  "net_settled",
  "type",
  "status",
] as const;

export const ORDER_STATUSES = ["completed", "cancelled", "refunded"] as const;
export const PAYMENT_TYPES = ["charge", "refund"] as const;
export const PAYMENT_STATUSES = ["settled", "pending", "failed"] as const;

export type OrderHeader = (typeof ORDER_HEADERS)[number];
export type PaymentHeader = (typeof PAYMENT_HEADERS)[number];
export type CsvSource = "orders" | "payments";

export type ImportIssue = {
  source: CsvSource | "request";
  row?: number;
  field?: string;
  code: string;
  message: string;
};

export type ImportWarning = {
  code: string;
  severity: "low";
  message: string;
  sort_key: string;
  currency?: string;
  financial_impact_minor?: number;
  order_record_source_rows?: number[];
  payment_record_source_rows?: number[];
  source: CsvSource;
  source_row_number: number;
};

export type OrderRecordPayload = {
  source_row_number: number;
  original_order_id: string;
  normalized_order_id: string;
  original_customer_email: string;
  original_status: string;
  normalized_status: string;
  original_currency: string;
  normalized_currency: string;
  original_gross_amount: string;
  gross_amount_minor: number;
  original_discount: string;
  discount_minor: number | null;
  original_net_amount: string;
  net_amount_minor: number;
  original_order_date: string;
  order_timestamp: string;
};

export type PaymentRecordPayload = {
  source_row_number: number;
  original_payment_id: string;
  normalized_payment_id: string;
  original_order_reference: string;
  normalized_order_reference: string;
  original_type: string;
  normalized_type: string;
  original_status: string;
  normalized_status: string;
  original_currency: string;
  normalized_currency: string;
  original_amount: string;
  amount_minor: number;
  original_fee: string;
  fee_minor: number;
  original_net_settled: string;
  net_settled_minor: number;
  original_transaction_date: string;
  processed_at: string | null;
};

export type ImportSuccessResponse = {
  ok: true;
  batchId: string;
  orderCount: number;
  paymentCount: number;
  /** Persisted total; may exceed `warnings.length` when details are capped. */
  warningCount: number;
  warnings: ImportWarning[];
};

export type ImportErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: ImportIssue[];
    totalIssueCount?: number;
    retryable: boolean;
  };
};

export type ImportResponse = ImportSuccessResponse | ImportErrorResponse;

export const idempotencyKeySchema = z.uuid();

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentTypeSchema = z.enum(PAYMENT_TYPES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a three-letter uppercase code");
