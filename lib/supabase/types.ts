import type { Database } from "@/lib/supabase/database.types";

export type { Database };

export type ImportBatch = Database["public"]["Tables"]["import_batches"]["Row"];
export type OrderRecord = Database["public"]["Tables"]["order_records"]["Row"];
export type PaymentRecord =
  Database["public"]["Tables"]["payment_records"]["Row"];
export type Reconciliation =
  Database["public"]["Tables"]["reconciliations"]["Row"];
export type ReconciliationCurrencyMetric =
  Database["public"]["Tables"]["reconciliation_currency_metrics"]["Row"];
export type Finding = Database["public"]["Tables"]["findings"]["Row"];

export type CreateImportBatchArgs =
  Database["public"]["Functions"]["create_import_batch"]["Args"];
export type ReplaceCurrentReconciliationArgs =
  Database["public"]["Functions"]["replace_current_reconciliation"]["Args"];
