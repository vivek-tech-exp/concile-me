import Papa from "papaparse";

import {
  MAX_DATA_ROWS,
  MAX_FILE_BYTES,
  MAX_ISSUE_DETAILS,
  ORDER_HEADERS,
  PAYMENT_HEADERS,
  type CsvSource,
  type ImportIssue,
  type ImportWarning,
  type OrderRecordPayload,
  type PaymentRecordPayload,
  currencySchema,
  orderStatusSchema,
  paymentStatusSchema,
  paymentTypeSchema,
} from "@/features/imports/contracts";
import { parseOrderTimestamp, parsePaymentTimestamp } from "@/features/imports/dates";
import { parseMoneyToMinor } from "@/features/imports/money";
import {
  normalizeCurrency,
  normalizeEnumToken,
  normalizeIdentifier,
} from "@/features/imports/normalize";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RawRow = Record<string, string>;

export type PreparedImport = {
  ordersFilename: string;
  paymentsFilename: string;
  orders: OrderRecordPayload[];
  payments: PaymentRecordPayload[];
  warnings: ImportWarning[];
};

export type PrepareImportResult =
  | { ok: true; data: PreparedImport }
  | {
      ok: false;
      issues: ImportIssue[];
      totalIssueCount: number;
    };

type IssueCollector = {
  issues: ImportIssue[];
  totalIssueCount: number;
};

function createCollector(): IssueCollector {
  return { issues: [], totalIssueCount: 0 };
}

function pushIssue(collector: IssueCollector, issue: ImportIssue): void {
  collector.totalIssueCount += 1;
  if (collector.issues.length < MAX_ISSUE_DETAILS) {
    collector.issues.push(issue);
  }
}

function decodeUtf8(buffer: ArrayBuffer): { ok: true; text: string } | { ok: false; message: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.some((byte) => byte === 0)) {
    return { ok: false, message: "File contains NUL bytes" };
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return { ok: true, text: decoder.decode(bytes) };
  } catch {
    return { ok: false, message: "File must be valid UTF-8" };
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function headerSetEquals(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  const left = sortedUnique(actual);
  const right = sortedUnique(expected);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function validateFileMeta(
  file: File,
  source: CsvSource,
  collector: IssueCollector,
): void {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    pushIssue(collector, {
      source,
      code: "FILE_EXTENSION",
      message: `${source} file must use a .csv extension`,
    });
  }

  if (file.size <= 0) {
    pushIssue(collector, {
      source,
      code: "FILE_EMPTY",
      message: `${source} file is empty`,
    });
  }

  if (file.size > MAX_FILE_BYTES) {
    pushIssue(collector, {
      source,
      code: "FILE_TOO_LARGE",
      message: `${source} file exceeds the 1 MiB limit`,
    });
  }

  if (file.type && !/(csv|text\/plain|application\/vnd\.ms-excel)/i.test(file.type)) {
    pushIssue(collector, {
      source,
      code: "FILE_MIME",
      field: "type",
      message: `${source} file type must be CSV or plain text`,
    });
  }
}

function papaErrorSourceRow(error: Papa.ParseError): number | undefined {
  if (typeof error.row !== "number") {
    return undefined;
  }

  // FieldMismatch `row` is a 0-based data-row index (header excluded).
  // Quotes `row` is a 0-based file-line index that already includes the header.
  // CSV lineage counts the header as row 1.
  if (error.type === "Quotes") {
    return error.row + 1;
  }

  return error.row + 2;
}

function mapPapaErrors(
  source: CsvSource,
  errors: Papa.ParseError[],
  collector: IssueCollector,
): void {
  for (const error of errors) {
    const row = papaErrorSourceRow(error);
    if (error.type === "FieldMismatch") {
      pushIssue(collector, {
        source,
        row,
        code: "FIELD_COUNT",
        message: "Row has the wrong number of fields",
      });
      continue;
    }
    if (error.code === "UndetectableDelimiter") {
      pushIssue(collector, {
        source,
        code: "DELIMITER",
        message: "CSV must use a comma delimiter",
      });
      continue;
    }
    if (error.type === "Quotes") {
      pushIssue(collector, {
        source,
        row,
        code: "MALFORMED_QUOTES",
        message: "CSV has malformed quotes",
      });
      continue;
    }
    pushIssue(collector, {
      source,
      row,
      code: "CSV_PARSE",
      message: "CSV could not be parsed",
    });
  }
}

function validateHeaders(
  source: CsvSource,
  fields: string[] | undefined,
  expected: readonly string[],
  otherExpected: readonly string[],
  otherLabel: CsvSource,
  collector: IssueCollector,
): boolean {
  if (!fields || fields.length === 0) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_MISSING",
      message: "CSV header row is missing",
    });
    return false;
  }

  if (fields.some((field) => field === "" || field.trim() === "")) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_BLANK",
      message: "CSV header contains a blank column name",
    });
  }

  const duplicates = fields.filter(
    (field, index) => fields.indexOf(field) !== index,
  );
  if (duplicates.length > 0) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_DUPLICATE",
      message: `Duplicate header(s): ${sortedUnique(duplicates).join(", ")}`,
    });
  }

  if (headerSetEquals(fields, otherExpected) && !headerSetEquals(fields, expected)) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_SWAPPED",
      message: `This looks like a ${otherLabel} file, not a ${source} file`,
    });
    return false;
  }

  const actual = sortedUnique(fields);
  const required = sortedUnique(expected);
  const missing = required.filter((header) => !actual.includes(header));
  const unexpected = actual.filter((header) => !required.includes(header));

  if (missing.length > 0) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_MISSING_COLUMNS",
      message: `Missing header(s): ${missing.join(", ")}`,
    });
  }
  if (unexpected.length > 0) {
    pushIssue(collector, {
      source,
      row: 1,
      code: "HEADERS_UNEXPECTED",
      message: `Unexpected header(s): ${unexpected.join(", ")}`,
    });
  }

  return missing.length === 0 && unexpected.length === 0 && duplicates.length === 0;
}

function cell(row: RawRow, field: string): string {
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function warningSortKey(
  source: CsvSource,
  row: number,
  code: string,
): string {
  return `${source}:${String(row).padStart(6, "0")}:${code}`;
}

function addIdentifierWarning(
  warnings: ImportWarning[],
  source: CsvSource,
  row: number,
  field: string,
  original: string,
  normalized: string,
): void {
  warnings.push({
    code: "IDENTIFIER_NORMALIZED",
    severity: "low",
    message: `${field} normalized from "${original}" to "${normalized}"`,
    sort_key: warningSortKey(source, row, `IDENTIFIER_NORMALIZED:${field}`),
    source,
    source_row_number: row,
    ...(source === "orders"
      ? { order_record_source_rows: [row] }
      : { payment_record_source_rows: [row] }),
  });
}

function validateOrderRow(
  row: RawRow,
  sourceRowNumber: number,
  collector: IssueCollector,
  warnings: ImportWarning[],
): OrderRecordPayload | null {
  const originalOrderId = cell(row, "order_id");
  const orderId = normalizeIdentifier(originalOrderId);
  if (!orderId.normalized) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "order_id",
      code: "REQUIRED",
      message: "order_id is required",
    });
  } else if (orderId.changed) {
    addIdentifierWarning(
      warnings,
      "orders",
      sourceRowNumber,
      "order_id",
      orderId.original,
      orderId.normalized,
    );
  }

  const originalEmail = cell(row, "customer_email");
  if (!EMAIL_PATTERN.test(originalEmail.trim())) {
    warnings.push({
      code: "MISSING_OR_INVALID_EMAIL",
      severity: "low",
      message: "customer_email is missing or invalid",
      sort_key: warningSortKey("orders", sourceRowNumber, "MISSING_OR_INVALID_EMAIL"),
      source: "orders",
      source_row_number: sourceRowNumber,
      order_record_source_rows: [sourceRowNumber],
    });
  }

  const statusToken = normalizeEnumToken(cell(row, "status"));
  const statusParsed = orderStatusSchema.safeParse(statusToken.normalized);
  if (!statusParsed.success) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "status",
      code: "UNSUPPORTED_STATUS",
      message: "Order status must be completed, cancelled, or refunded",
    });
  }

  const currencyToken = normalizeCurrency(cell(row, "currency"));
  const currencyParsed = currencySchema.safeParse(currencyToken.normalized);
  if (!currencyParsed.success) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "currency",
      code: "CURRENCY",
      message: "Currency must be a three-letter code",
    });
  }

  const originalGross = cell(row, "gross_amount");
  const gross = parseMoneyToMinor(originalGross);
  if (!gross.ok) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "gross_amount",
      code: gross.code,
      message: gross.message,
    });
  }

  const originalDiscount = cell(row, "discount");
  let discountMinor: number | null = null;
  if (originalDiscount.trim() === "") {
    warnings.push({
      code: "MISSING_ORDER_DISCOUNT",
      severity: "low",
      message: "discount is missing",
      sort_key: warningSortKey("orders", sourceRowNumber, "MISSING_ORDER_DISCOUNT"),
      source: "orders",
      source_row_number: sourceRowNumber,
      order_record_source_rows: [sourceRowNumber],
    });
  } else {
    const discount = parseMoneyToMinor(originalDiscount);
    if (!discount.ok) {
      pushIssue(collector, {
        source: "orders",
        row: sourceRowNumber,
        field: "discount",
        code: discount.code,
        message: discount.message,
      });
    } else {
      discountMinor = discount.minor;
    }
  }

  const originalNet = cell(row, "net_amount");
  const net = parseMoneyToMinor(originalNet);
  if (!net.ok) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "net_amount",
      code: net.code,
      message: net.message,
    });
  }

  const originalOrderDate = cell(row, "order_date");
  const orderTimestamp = parseOrderTimestamp(originalOrderDate);
  if (!orderTimestamp.ok) {
    pushIssue(collector, {
      source: "orders",
      row: sourceRowNumber,
      field: "order_date",
      code: orderTimestamp.code,
      message: orderTimestamp.message,
    });
  }

  if (
    !orderId.normalized ||
    !statusParsed.success ||
    !currencyParsed.success ||
    !gross.ok ||
    (originalDiscount.trim() !== "" && discountMinor === null) ||
    !net.ok ||
    !orderTimestamp.ok
  ) {
    return null;
  }

  return {
    source_row_number: sourceRowNumber,
    original_order_id: orderId.original,
    normalized_order_id: orderId.normalized,
    original_customer_email: originalEmail,
    original_status: statusToken.original,
    normalized_status: statusParsed.data,
    original_currency: currencyToken.original,
    normalized_currency: currencyParsed.data,
    original_gross_amount: originalGross,
    gross_amount_minor: gross.minor,
    original_discount: originalDiscount,
    discount_minor: discountMinor,
    original_net_amount: originalNet,
    net_amount_minor: net.minor,
    original_order_date: originalOrderDate,
    order_timestamp: orderTimestamp.isoTimestamp,
  };
}

function validatePaymentRow(
  row: RawRow,
  sourceRowNumber: number,
  collector: IssueCollector,
  warnings: ImportWarning[],
): PaymentRecordPayload | null {
  const paymentId = normalizeIdentifier(cell(row, "transaction_ref"));
  if (!paymentId.normalized) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "transaction_ref",
      code: "REQUIRED",
      message: "transaction_ref is required",
    });
  } else if (paymentId.changed) {
    addIdentifierWarning(
      warnings,
      "payments",
      sourceRowNumber,
      "transaction_ref",
      paymentId.original,
      paymentId.normalized,
    );
  }

  const orderRef = normalizeIdentifier(cell(row, "order_reference"));
  if (!orderRef.normalized) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "order_reference",
      code: "REQUIRED",
      message: "order_reference is required",
    });
  } else if (orderRef.changed) {
    addIdentifierWarning(
      warnings,
      "payments",
      sourceRowNumber,
      "order_reference",
      orderRef.original,
      orderRef.normalized,
    );
  }

  const typeToken = normalizeEnumToken(cell(row, "type"));
  const typeParsed = paymentTypeSchema.safeParse(typeToken.normalized);
  if (!typeParsed.success) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "type",
      code: "UNSUPPORTED_TYPE",
      message: "Payment type must be charge or refund",
    });
  }

  const statusToken = normalizeEnumToken(cell(row, "status"));
  const statusParsed = paymentStatusSchema.safeParse(statusToken.normalized);
  if (!statusParsed.success) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "status",
      code: "UNSUPPORTED_STATUS",
      message: "Payment status must be settled, pending, or failed",
    });
  }

  const currencyToken = normalizeCurrency(cell(row, "currency"));
  const currencyParsed = currencySchema.safeParse(currencyToken.normalized);
  if (!currencyParsed.success) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "currency",
      code: "CURRENCY",
      message: "Currency must be a three-letter code",
    });
  }

  const originalAmount = cell(row, "amount");
  const amount = parseMoneyToMinor(originalAmount);
  if (!amount.ok) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "amount",
      code: amount.code,
      message: amount.message,
    });
  }

  const originalFee = cell(row, "fee");
  const fee = parseMoneyToMinor(originalFee);
  if (!fee.ok) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "fee",
      code: fee.code,
      message: fee.message,
    });
  }

  const originalNetSettled = cell(row, "net_settled");
  const netSettled = parseMoneyToMinor(originalNetSettled);
  if (!netSettled.ok) {
    pushIssue(collector, {
      source: "payments",
      row: sourceRowNumber,
      field: "net_settled",
      code: netSettled.code,
      message: netSettled.message,
    });
  }

  const originalProcessedAt = cell(row, "processed_at");
  let processedAt: string | null = null;
  if (originalProcessedAt.trim() === "") {
    warnings.push({
      code: "MISSING_PAYMENT_TIMESTAMP",
      severity: "low",
      message: "processed_at is missing",
      sort_key: warningSortKey("payments", sourceRowNumber, "MISSING_PAYMENT_TIMESTAMP"),
      source: "payments",
      source_row_number: sourceRowNumber,
      payment_record_source_rows: [sourceRowNumber],
    });
  } else {
    const parsed = parsePaymentTimestamp(originalProcessedAt);
    if (!parsed.ok) {
      pushIssue(collector, {
        source: "payments",
        row: sourceRowNumber,
        field: "processed_at",
        code: parsed.code,
        message: parsed.message,
      });
    } else {
      processedAt = parsed.isoTimestamp;
    }
  }

  if (
    !paymentId.normalized ||
    !orderRef.normalized ||
    !typeParsed.success ||
    !statusParsed.success ||
    !currencyParsed.success ||
    !amount.ok ||
    !fee.ok ||
    !netSettled.ok ||
    (originalProcessedAt.trim() !== "" && processedAt === null)
  ) {
    return null;
  }

  return {
    source_row_number: sourceRowNumber,
    original_payment_id: paymentId.original,
    normalized_payment_id: paymentId.normalized,
    original_order_reference: orderRef.original,
    normalized_order_reference: orderRef.normalized,
    original_type: typeToken.original,
    normalized_type: typeParsed.data,
    original_status: statusToken.original,
    normalized_status: statusParsed.data,
    original_currency: currencyToken.original,
    normalized_currency: currencyParsed.data,
    original_amount: originalAmount,
    amount_minor: amount.minor,
    original_fee: originalFee,
    fee_minor: fee.minor,
    original_net_settled: originalNetSettled,
    net_settled_minor: netSettled.minor,
    original_transaction_date: originalProcessedAt,
    processed_at: processedAt,
  };
}

function readRawHeaderFields(text: string): string[] | undefined {
  const withoutBom = stripBom(text);
  const firstLine = withoutBom.split(/\r?\n/).find((line) => line.trim() !== "");
  if (firstLine === undefined) {
    return undefined;
  }
  const parsed = Papa.parse<string[]>(firstLine, {
    header: false,
    delimiter: ",",
    dynamicTyping: false,
  });
  const row = parsed.data[0];
  if (!row) {
    return undefined;
  }
  return row;
}

function parseCsvFile(
  source: CsvSource,
  text: string,
  expectedHeaders: readonly string[],
  otherHeaders: readonly string[],
  otherLabel: CsvSource,
  collector: IssueCollector,
): { rows: RawRow[]; fields: string[] | undefined } {
  const rawFields = readRawHeaderFields(text);
  validateHeaders(source, rawFields, expectedHeaders, otherHeaders, otherLabel, collector);

  const parsed = Papa.parse<RawRow>(stripBom(text), {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  mapPapaErrors(source, parsed.errors, collector);
  const fields = rawFields ?? parsed.meta.fields;

  if (parsed.data.length > MAX_DATA_ROWS) {
    pushIssue(collector, {
      source,
      code: "TOO_MANY_ROWS",
      message: `${source} file exceeds ${MAX_DATA_ROWS} data rows`,
    });
  }

  const rows = parsed.data.map((row) => {
    const normalized: RawRow = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = typeof value === "string" ? value : "";
    }
    return normalized;
  });

  return { rows, fields };
}

export async function prepareImportFromFiles(
  ordersFile: File,
  paymentsFile: File,
): Promise<PrepareImportResult> {
  const collector = createCollector();
  validateFileMeta(ordersFile, "orders", collector);
  validateFileMeta(paymentsFile, "payments", collector);

  if (collector.totalIssueCount > 0) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  const [ordersBuffer, paymentsBuffer] = await Promise.all([
    ordersFile.arrayBuffer(),
    paymentsFile.arrayBuffer(),
  ]);

  const ordersDecoded = decodeUtf8(ordersBuffer);
  const paymentsDecoded = decodeUtf8(paymentsBuffer);

  if (!ordersDecoded.ok) {
    pushIssue(collector, {
      source: "orders",
      code: "ENCODING",
      message: ordersDecoded.message,
    });
  }
  if (!paymentsDecoded.ok) {
    pushIssue(collector, {
      source: "payments",
      code: "ENCODING",
      message: paymentsDecoded.message,
    });
  }

  if (!ordersDecoded.ok || !paymentsDecoded.ok) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  const ordersParsed = parseCsvFile(
    "orders",
    ordersDecoded.text,
    ORDER_HEADERS,
    PAYMENT_HEADERS,
    "payments",
    collector,
  );
  const paymentsParsed = parseCsvFile(
    "payments",
    paymentsDecoded.text,
    PAYMENT_HEADERS,
    ORDER_HEADERS,
    "orders",
    collector,
  );

  const warnings: ImportWarning[] = [];
  const orders: OrderRecordPayload[] = [];
  const payments: PaymentRecordPayload[] = [];

  ordersParsed.rows.forEach((row, index) => {
    const sourceRowNumber = index + 2;
    const validated = validateOrderRow(row, sourceRowNumber, collector, warnings);
    if (validated) {
      orders.push(validated);
    }
  });

  paymentsParsed.rows.forEach((row, index) => {
    const sourceRowNumber = index + 2;
    const validated = validatePaymentRow(row, sourceRowNumber, collector, warnings);
    if (validated) {
      payments.push(validated);
    }
  });

  if (collector.totalIssueCount > 0) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  if (orders.length === 0) {
    pushIssue(collector, {
      source: "orders",
      code: "NO_DATA_ROWS",
      message: "Orders file has no data rows",
    });
  }
  if (payments.length === 0) {
    pushIssue(collector, {
      source: "payments",
      code: "NO_DATA_ROWS",
      message: "Payments file has no data rows",
    });
  }

  if (collector.totalIssueCount > 0) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  warnings.sort((left, right) => left.sort_key.localeCompare(right.sort_key));

  return {
    ok: true,
    data: {
      ordersFilename: ordersFile.name,
      paymentsFilename: paymentsFile.name,
      orders,
      payments,
      warnings,
    },
  };
}

export function prepareImportFromCsvText(input: {
  ordersFilename: string;
  paymentsFilename: string;
  ordersText: string;
  paymentsText: string;
}): PrepareImportResult {
  const collector = createCollector();
  const ordersFile = new File([input.ordersText], input.ordersFilename, {
    type: "text/csv",
  });
  const paymentsFile = new File([input.paymentsText], input.paymentsFilename, {
    type: "text/csv",
  });

  // Synchronous path for unit tests that already hold UTF-8 text.
  validateFileMeta(ordersFile, "orders", collector);
  validateFileMeta(paymentsFile, "payments", collector);
  if (collector.totalIssueCount > 0) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  const ordersParsed = parseCsvFile(
    "orders",
    input.ordersText,
    ORDER_HEADERS,
    PAYMENT_HEADERS,
    "payments",
    collector,
  );
  const paymentsParsed = parseCsvFile(
    "payments",
    input.paymentsText,
    PAYMENT_HEADERS,
    ORDER_HEADERS,
    "orders",
    collector,
  );

  const warnings: ImportWarning[] = [];
  const orders: OrderRecordPayload[] = [];
  const payments: PaymentRecordPayload[] = [];

  ordersParsed.rows.forEach((row, index) => {
    const validated = validateOrderRow(row, index + 2, collector, warnings);
    if (validated) {
      orders.push(validated);
    }
  });
  paymentsParsed.rows.forEach((row, index) => {
    const validated = validatePaymentRow(row, index + 2, collector, warnings);
    if (validated) {
      payments.push(validated);
    }
  });

  if (collector.totalIssueCount > 0) {
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  if (orders.length === 0 || payments.length === 0) {
    if (orders.length === 0) {
      pushIssue(collector, {
        source: "orders",
        code: "NO_DATA_ROWS",
        message: "Orders file has no data rows",
      });
    }
    if (payments.length === 0) {
      pushIssue(collector, {
        source: "payments",
        code: "NO_DATA_ROWS",
        message: "Payments file has no data rows",
      });
    }
    return {
      ok: false,
      issues: collector.issues,
      totalIssueCount: collector.totalIssueCount,
    };
  }

  warnings.sort((left, right) => left.sort_key.localeCompare(right.sort_key));

  return {
    ok: true,
    data: {
      ordersFilename: input.ordersFilename,
      paymentsFilename: input.paymentsFilename,
      orders,
      payments,
      warnings,
    },
  };
}
