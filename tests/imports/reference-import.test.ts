import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareImportFromCsvText } from "@/features/imports/prepare-import";

describe("reference CSV import workflow", () => {
  it("prepares the sample pair for atomic persistence", () => {
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
      result.data.warnings.map((warning) => warning.code).sort(),
    ).toEqual([
      "IDENTIFIER_NORMALIZED",
      "IDENTIFIER_NORMALIZED",
      "MISSING_ORDER_DISCOUNT",
      "MISSING_OR_INVALID_EMAIL",
      "MISSING_PAYMENT_TIMESTAMP",
    ]);

    for (const order of result.data.orders) {
      expect(Number.isInteger(order.gross_amount_minor)).toBe(true);
      expect(Number.isInteger(order.net_amount_minor)).toBe(true);
      if (order.discount_minor !== null) {
        expect(Number.isInteger(order.discount_minor)).toBe(true);
      }
      expect(order.original_order_date).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      expect(order.order_timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      expect(order).toEqual(
        expect.objectContaining({
          original_order_id: expect.any(String),
          normalized_order_id: expect.any(String),
          original_gross_amount: expect.any(String),
          original_net_amount: expect.any(String),
        }),
      );
    }

    for (const payment of result.data.payments) {
      expect(Number.isInteger(payment.amount_minor)).toBe(true);
      expect(Number.isInteger(payment.fee_minor)).toBe(true);
      expect(Number.isInteger(payment.net_settled_minor)).toBe(true);
      expect(payment).toEqual(
        expect.objectContaining({
          original_payment_id: expect.any(String),
          normalized_payment_id: expect.any(String),
          original_fee: expect.any(String),
          original_net_settled: expect.any(String),
          original_transaction_date: expect.any(String),
        }),
      );
    }

    const spaced = result.data.payments.find(
      (row) => row.original_order_reference === " ord-1801 ",
    );
    expect(spaced).toBeDefined();
    expect(spaced?.normalized_order_reference).toBe("ORD-1801");

    const lower = result.data.payments.find(
      (row) => row.original_order_reference === "ord-1802",
    );
    expect(lower).toBeDefined();
    expect(lower?.normalized_order_reference).toBe("ORD-1802");
  });
});
