import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_FILE_BYTES,
  ORDER_HEADERS,
  PAYMENT_HEADERS,
} from "@/features/imports/contracts";
import { prepareImportFromCsvText } from "@/features/imports/prepare-import";

const ORDER_HEADER = ORDER_HEADERS.join(",");
const PAYMENT_HEADER = PAYMENT_HEADERS.join(",");

const validOrderRow =
  "ORD-1,2025-04-13 00:00:00,a@example.com,USD,10.00,0.00,10.00,completed";
const validPaymentRow =
  "TXN1,02/04/2025 18:39,ORD-1,USD,10.00,0.30,9.70,charge,settled";

function pair(ordersBody: string, paymentsBody: string) {
  return prepareImportFromCsvText({
    ordersFilename: "orders.csv",
    paymentsFilename: "payments.csv",
    ordersText: ordersBody,
    paymentsText: paymentsBody,
  });
}

describe("prepareImportFromCsvText", () => {
  it("accepts a minimal valid pair", () => {
    const result = pair(
      `${ORDER_HEADER}\n${validOrderRow}\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.orders).toHaveLength(1);
    expect(result.data.payments).toHaveLength(1);
    expect(result.data.warnings).toHaveLength(0);
  });

  it("rejects missing, extra, duplicate, and whitespace-padded headers", () => {
    const missing = pair(
      "order_id,order_date,currency,gross_amount,discount,net_amount,status\n",
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.issues.some((issue) => issue.code === "HEADERS_MISSING_COLUMNS")).toBe(
      true,
    );

    const extra = pair(
      `${ORDER_HEADER},extra\n${validOrderRow},x\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(extra.ok).toBe(false);

    const duplicate = pair(
      `${ORDER_HEADER},order_id\n${validOrderRow},ORD-2\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.issues.some((issue) => issue.code === "HEADERS_DUPLICATE")).toBe(
        true,
      );
    }

    const padded = pair(
      ` order_id,order_date,customer_email,currency,gross_amount,discount,net_amount,status\n${validOrderRow}\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(padded.ok).toBe(false);
    if (!padded.ok) {
      expect(
        padded.issues.some((issue) => issue.code === "HEADERS_MISSING_COLUMNS"),
      ).toBe(true);
      expect(
        padded.issues.some((issue) => issue.code === "HEADERS_UNEXPECTED"),
      ).toBe(true);
    }
  });

  it("detects swapped files through headers", () => {
    const result = pair(
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
      `${ORDER_HEADER}\n${validOrderRow}\n`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "HEADERS_SWAPPED")).toBe(true);
    }
  });

  it("rejects empty data files", () => {
    const result = pair(`${ORDER_HEADER}\n`, `${PAYMENT_HEADER}\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "NO_DATA_ROWS")).toBe(true);
    }
  });

  it("rejects too many fields and malformed quotes", () => {
    const tooMany = pair(
      `${ORDER_HEADER}\n${validOrderRow},extra\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      const fieldCount = tooMany.issues.find((issue) => issue.code === "FIELD_COUNT");
      expect(fieldCount?.row).toBe(2);
    }

    const quotesFirstDataRow = pair(
      `${ORDER_HEADER}\n"ORD-1,2025-04-13 00:00:00,a@example.com,USD,10.00,0.00,10.00,completed\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(quotesFirstDataRow.ok).toBe(false);
    if (!quotesFirstDataRow.ok) {
      const malformed = quotesFirstDataRow.issues.find(
        (issue) => issue.code === "MALFORMED_QUOTES",
      );
      expect(malformed?.row).toBe(2);
    }

    const quotesSecondDataRow = pair(
      `${ORDER_HEADER}\n${validOrderRow}\n"ORD-2,2025-04-13 00:00:00,a@example.com,USD,10.00,0.00,10.00,completed\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(quotesSecondDataRow.ok).toBe(false);
    if (!quotesSecondDataRow.ok) {
      const malformed = quotesSecondDataRow.issues.find(
        (issue) => issue.code === "MALFORMED_QUOTES",
      );
      expect(malformed?.row).toBe(3);
    }
  });

  it("ignores blank lines and accepts a UTF-8 BOM", () => {
    const result = pair(
      `\uFEFF${ORDER_HEADER}\n\n${validOrderRow}\n\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.orders).toHaveLength(1);
    }
  });

  it("rejects oversized files", () => {
    const huge = `${ORDER_HEADER}\n${"x".repeat(MAX_FILE_BYTES)}\n`;
    const result = pair(huge, `${PAYMENT_HEADER}\n${validPaymentRow}\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "FILE_TOO_LARGE")).toBe(true);
    }
  });

  it("accumulates mixed valid and invalid rows and caps issue details", () => {
    const badRows = Array.from({ length: 120 }, (_, index) => {
      if (index === 0) {
        return validOrderRow;
      }
      return `ORD-${index},bad-date,a@example.com,USD,10.00,0.00,10.00,completed`;
    }).join("\n");

    const result = pair(
      `${ORDER_HEADER}\n${badRows}\n`,
      `${PAYMENT_HEADER}\n${validPaymentRow}\n`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.totalIssueCount).toBeGreaterThan(100);
      expect(result.issues.length).toBeLessThanOrEqual(100);
    }
  });

  it("sorts warnings deterministically regardless of discovery order", () => {
    const orders = [
      ORDER_HEADER,
      "ORD-2,2025-04-13 00:00:00,,USD,10.00,,10.00,completed",
      "ORD-1,2025-04-13 00:00:00,bad,USD,10.00,0.00,10.00,completed",
    ].join("\n");
    const payments = [
      PAYMENT_HEADER,
      "TXN2,,ord-2,USD,10.00,0.30,9.70,charge,settled",
      validPaymentRow,
    ].join("\n");

    const result = pair(`${orders}\n`, `${payments}\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const keys = result.data.warnings.map((warning) => warning.sort_key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  it("imports the reference sample pair with expected counts and warnings", () => {
    const ordersText = readFileSync(resolve("sample/orders.csv"), "utf8");
    const paymentsText = readFileSync(resolve("sample/payments.csv"), "utf8");
    const result = prepareImportFromCsvText({
      ordersFilename: "orders.csv",
      paymentsFilename: "payments.csv",
      ordersText,
      paymentsText,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.orders).toHaveLength(185);
    expect(result.data.payments).toHaveLength(187);
    expect(result.data.warnings).toHaveLength(5);
    expect(
      result.data.orders.every(
        (row) => Number.isInteger(row.net_amount_minor) && Number.isInteger(row.gross_amount_minor),
      ),
    ).toBe(true);
    expect(
      result.data.payments.every(
        (row) =>
          Number.isInteger(row.amount_minor) &&
          Number.isInteger(row.fee_minor) &&
          Number.isInteger(row.net_settled_minor),
      ),
    ).toBe(true);

    const normalizedPayment = result.data.payments.find(
      (row) => row.original_order_reference === " ord-1801 ",
    );
    expect(normalizedPayment?.normalized_order_reference).toBe("ORD-1801");
  });
});
