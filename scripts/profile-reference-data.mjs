#!/usr/bin/env node
/**
 * Deterministic profiler for sample/orders.csv + sample/payments.csv.
 *
 * Reports raw structural and arithmetic facts only.
 * Does not classify business discrepancies, severity, or financial risk.
 *
 * Identifier and money rules mirror Stage 4
 * (features/imports/normalize.ts, features/imports/money.ts).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ORDERS_PATH = join(ROOT, "sample", "orders.csv");
const PAYMENTS_PATH = join(ROOT, "sample", "payments.csv");

const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;
const MAX_SAFE_MINOR = 9007199254740991n;

function normalizeIdentifier(original) {
  return original.trim().toUpperCase();
}

function parseMoneyToMinor(raw) {
  if (raw.length === 0) {
    return { ok: false, message: "Amount is required" };
  }
  if (/[+\-eE,]/.test(raw) || raw.includes(" ")) {
    return {
      ok: false,
      message:
        "Amount must be a non-negative decimal without signs, commas, or exponents",
    };
  }
  const match = MONEY_PATTERN.exec(raw);
  if (!match) {
    return {
      ok: false,
      message: "Amount must have zero, one, or two fractional digits",
    };
  }
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100n + fraction;
  if (minor > MAX_SAFE_MINOR) {
    return { ok: false, message: "Amount exceeds the safe integer range" };
  }
  return { ok: true, minor: Number(minor) };
}

function requireMoney(raw, field, source, row) {
  const parsed = parseMoneyToMinor(raw);
  if (!parsed.ok) {
    throw new Error(`${source} row ${row}: ${field}: ${parsed.message}`);
  }
  return parsed.minor;
}

function parseCsv(path) {
  const text = readFileSync(path, "utf8");
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `PapaParse errors in ${path}: ${JSON.stringify(parsed.errors)}`,
    );
  }
  return parsed.data.map((row, index) => ({
    source_row_number: index + 2,
    cells: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? value : value == null ? "" : String(value),
      ]),
    ),
  }));
}

function rowFingerprint(cells) {
  const keys = Object.keys(cells).sort();
  const payload = keys.map((key) => `${key}=${cells[key]}`).join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

function compareByKeyThenRow(left, right) {
  const keyCmp = left.normalized_key.localeCompare(right.normalized_key);
  if (keyCmp !== 0) return keyCmp;
  return left.source_row_number - right.source_row_number;
}

function loadOrders(rows) {
  return rows.map(({ source_row_number, cells }) => {
    const original_order_id = cells.order_id ?? "";
    const normalized_order_id = normalizeIdentifier(original_order_id);
    const original_currency = cells.currency ?? "";
    const normalized_currency = original_currency.trim().toUpperCase();
    const original_status = cells.status ?? "";
    const normalized_status = original_status.trim().toLowerCase();
    const original_gross = cells.gross_amount ?? "";
    const original_discount = cells.discount ?? "";
    const original_net = cells.net_amount ?? "";
    const gross_amount_minor = requireMoney(
      original_gross,
      "gross_amount",
      "orders",
      source_row_number,
    );
    const discount_blank = original_discount.trim() === "";
    const discount_minor = discount_blank
      ? null
      : requireMoney(
          original_discount,
          "discount",
          "orders",
          source_row_number,
        );
    const net_amount_minor = requireMoney(
      original_net,
      "net_amount",
      "orders",
      source_row_number,
    );

    let order_arithmetic_ok = true;
    if (discount_minor === null) {
      order_arithmetic_ok = gross_amount_minor === net_amount_minor;
    } else {
      order_arithmetic_ok =
        gross_amount_minor - discount_minor === net_amount_minor;
    }

    return {
      source_row_number,
      original_order_id,
      normalized_order_id,
      normalized_key: normalized_order_id,
      original_currency,
      normalized_currency,
      original_status,
      normalized_status,
      original_gross_amount: original_gross,
      gross_amount_minor,
      original_discount,
      discount_minor,
      original_net_amount: original_net,
      net_amount_minor,
      order_arithmetic_ok,
      fingerprint: rowFingerprint(cells),
      cells,
    };
  });
}

function loadPayments(rows) {
  return rows.map(({ source_row_number, cells }) => {
    const original_payment_id = cells.transaction_ref ?? "";
    const normalized_payment_id = normalizeIdentifier(original_payment_id);
    const original_order_reference = cells.order_reference ?? "";
    const normalized_order_reference = normalizeIdentifier(
      original_order_reference,
    );
    const original_currency = cells.currency ?? "";
    const normalized_currency = original_currency.trim().toUpperCase();
    const original_type = cells.type ?? "";
    const normalized_type = original_type.trim().toLowerCase();
    const original_status = cells.status ?? "";
    const normalized_status = original_status.trim().toLowerCase();
    const original_amount = cells.amount ?? "";
    const original_fee = cells.fee ?? "";
    const original_net_settled = cells.net_settled ?? "";
    const amount_minor = requireMoney(
      original_amount,
      "amount",
      "payments",
      source_row_number,
    );
    const fee_minor = requireMoney(
      original_fee,
      "fee",
      "payments",
      source_row_number,
    );
    const net_settled_minor = requireMoney(
      original_net_settled,
      "net_settled",
      "payments",
      source_row_number,
    );
    const settlement_arithmetic_ok =
      amount_minor - fee_minor === net_settled_minor;

    return {
      source_row_number,
      original_payment_id,
      normalized_payment_id,
      original_order_reference,
      normalized_order_reference,
      normalized_key: normalized_order_reference,
      original_currency,
      normalized_currency,
      original_type,
      normalized_type,
      original_status,
      normalized_status,
      original_amount,
      amount_minor,
      original_fee,
      fee_minor,
      original_net_settled,
      net_settled_minor,
      settlement_arithmetic_ok,
      fingerprint: rowFingerprint(cells),
      cells,
    };
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function profile(orders, payments) {
  const orderKeys = orders.map((row) => row.normalized_order_id);
  const uniqueOrderKeys = uniqueSorted(orderKeys);
  const paymentIds = payments.map((row) => row.normalized_payment_id);
  const uniquePaymentIds = uniqueSorted(paymentIds);
  const paymentOrderRefs = payments.map((row) => row.normalized_order_reference);
  const uniquePaymentOrderRefs = uniqueSorted(paymentOrderRefs);

  const orderKeySet = new Set(uniqueOrderKeys);
  const paymentRefSet = new Set(uniquePaymentOrderRefs);
  const matchedKeys = uniqueSorted(
    uniqueOrderKeys.filter((key) => paymentRefSet.has(key)),
  );
  const unionKeys = uniqueSorted([...orderKeySet, ...paymentRefSet]);
  const orderKeysWithoutPayments = uniqueSorted(
    uniqueOrderKeys.filter((key) => !paymentRefSet.has(key)),
  );
  const paymentRefsWithoutOrders = uniqueSorted(
    uniquePaymentOrderRefs.filter((key) => !orderKeySet.has(key)),
  );

  const ordersByKey = new Map();
  for (const order of orders) {
    const list = ordersByKey.get(order.normalized_order_id) ?? [];
    list.push(order);
    ordersByKey.set(order.normalized_order_id, list);
  }

  const paymentsByKey = new Map();
  for (const payment of payments) {
    const list = paymentsByKey.get(payment.normalized_order_reference) ?? [];
    list.push(payment);
    paymentsByKey.set(payment.normalized_order_reference, list);
  }

  const duplicatedOrderGroups = [];
  for (const key of uniqueOrderKeys) {
    const group = ordersByKey.get(key) ?? [];
    if (group.length < 2) continue;
    const fingerprints = uniqueSorted(group.map((row) => row.fingerprint));
    duplicatedOrderGroups.push({
      normalized_order_id: key,
      row_count: group.length,
      identical_rows: fingerprints.length === 1,
      fingerprints,
      rows: group
        .slice()
        .sort((a, b) => a.source_row_number - b.source_row_number)
        .map((row) => ({
          source_row_number: row.source_row_number,
          original_order_id: row.original_order_id,
          normalized_order_id: row.normalized_order_id,
          fingerprint: row.fingerprint,
        })),
    });
  }

  const multipleSettledChargeGroups = [];
  for (const key of matchedKeys) {
    const groupPayments = paymentsByKey.get(key) ?? [];
    const settledCharges = groupPayments.filter(
      (payment) =>
        payment.normalized_type === "charge" &&
        payment.normalized_status === "settled",
    );
    if (settledCharges.length > 1) {
      multipleSettledChargeGroups.push({
        normalized_key: key,
        settled_charge_count: settledCharges.length,
        payments: settledCharges
          .slice()
          .sort((a, b) => a.source_row_number - b.source_row_number)
          .map((payment) => ({
            source_row_number: payment.source_row_number,
            original_payment_id: payment.original_payment_id,
            normalized_payment_id: payment.normalized_payment_id,
            original_order_reference: payment.original_order_reference,
            amount_minor: payment.amount_minor,
            currency: payment.normalized_currency,
          })),
      });
    }
  }

  const currencyConflicts = [];
  for (const key of matchedKeys) {
    const groupOrders = ordersByKey.get(key) ?? [];
    const groupPayments = paymentsByKey.get(key) ?? [];
    const orderCurrencies = uniqueSorted(
      groupOrders.map((row) => row.normalized_currency),
    );
    const paymentCurrencies = uniqueSorted(
      groupPayments.map((row) => row.normalized_currency),
    );
    const allCurrencies = uniqueSorted([
      ...orderCurrencies,
      ...paymentCurrencies,
    ]);
    if (allCurrencies.length > 1) {
      currencyConflicts.push({
        normalized_key: key,
        order_currencies: orderCurrencies,
        payment_currencies: paymentCurrencies,
        orders: groupOrders
          .slice()
          .sort((a, b) => a.source_row_number - b.source_row_number)
          .map((row) => ({
            source_row_number: row.source_row_number,
            original_order_id: row.original_order_id,
            original_currency: row.original_currency,
            normalized_currency: row.normalized_currency,
          })),
        payments: groupPayments
          .slice()
          .sort((a, b) => a.source_row_number - b.source_row_number)
          .map((row) => ({
            source_row_number: row.source_row_number,
            original_payment_id: row.original_payment_id,
            original_currency: row.original_currency,
            normalized_currency: row.normalized_currency,
          })),
      });
    }
  }

  const amountDifferences = [];
  for (const key of matchedKeys) {
    const groupOrders = ordersByKey.get(key) ?? [];
    const groupPayments = paymentsByKey.get(key) ?? [];
    const orderCurrencies = uniqueSorted(
      groupOrders.map((row) => row.normalized_currency),
    );
    const paymentCurrencies = uniqueSorted(
      groupPayments.map((row) => row.normalized_currency),
    );
    if (
      orderCurrencies.length !== 1 ||
      paymentCurrencies.length !== 1 ||
      orderCurrencies[0] !== paymentCurrencies[0]
    ) {
      continue;
    }
    if (groupOrders.length !== 1) {
      continue;
    }
    const order = groupOrders[0];
    const settledCharges = groupPayments.filter(
      (payment) =>
        payment.normalized_type === "charge" &&
        payment.normalized_status === "settled",
    );
    // Amount-difference facts are reported only for single settled-charge
    // matches. Multiple settled charges are a separate structural observation.
    if (settledCharges.length !== 1) {
      continue;
    }
    const settledChargeSum = settledCharges.reduce(
      (sum, payment) => sum + payment.amount_minor,
      0,
    );
    const absolute_difference_minor = Math.abs(
      order.net_amount_minor - settledChargeSum,
    );
    if (absolute_difference_minor === 0) {
      continue;
    }
    amountDifferences.push({
      normalized_key: key,
      currency: order.normalized_currency,
      order_net_amount_minor: order.net_amount_minor,
      settled_charge_sum_minor: settledChargeSum,
      absolute_difference_minor,
      order: {
        source_row_number: order.source_row_number,
        original_order_id: order.original_order_id,
        normalized_order_id: order.normalized_order_id,
      },
      settled_charges: settledCharges
        .slice()
        .sort((a, b) => a.source_row_number - b.source_row_number)
        .map((payment) => ({
          source_row_number: payment.source_row_number,
          original_payment_id: payment.original_payment_id,
          amount_minor: payment.amount_minor,
        })),
    });
  }

  amountDifferences.sort((a, b) => {
    const keyCmp = a.normalized_key.localeCompare(b.normalized_key);
    if (keyCmp !== 0) return keyCmp;
    return a.absolute_difference_minor - b.absolute_difference_minor;
  });

  const failedCharges = payments
    .filter(
      (payment) =>
        payment.normalized_type === "charge" &&
        payment.normalized_status === "failed",
    )
    .sort(compareByKeyThenRow)
    .map((payment) => ({
      source_row_number: payment.source_row_number,
      original_payment_id: payment.original_payment_id,
      normalized_payment_id: payment.normalized_payment_id,
      original_order_reference: payment.original_order_reference,
      normalized_order_reference: payment.normalized_order_reference,
      amount_minor: payment.amount_minor,
      currency: payment.normalized_currency,
    }));

  const pendingCharges = payments
    .filter(
      (payment) =>
        payment.normalized_type === "charge" &&
        payment.normalized_status === "pending",
    )
    .sort(compareByKeyThenRow)
    .map((payment) => ({
      source_row_number: payment.source_row_number,
      original_payment_id: payment.original_payment_id,
      normalized_payment_id: payment.normalized_payment_id,
      original_order_reference: payment.original_order_reference,
      normalized_order_reference: payment.normalized_order_reference,
      amount_minor: payment.amount_minor,
      currency: payment.normalized_currency,
    }));

  const cancelledWithSettledCharge = [];
  const refundedWithPartialRefund = [];
  const completedWithFullRefund = [];

  for (const key of matchedKeys) {
    const groupOrders = ordersByKey.get(key) ?? [];
    const groupPayments = paymentsByKey.get(key) ?? [];
    if (groupOrders.length !== 1) continue;
    const order = groupOrders[0];
    const settledCharges = groupPayments.filter(
      (payment) =>
        payment.normalized_type === "charge" &&
        payment.normalized_status === "settled",
    );
    const settledRefunds = groupPayments.filter(
      (payment) =>
        payment.normalized_type === "refund" &&
        payment.normalized_status === "settled",
    );
    const refundSum = settledRefunds.reduce(
      (sum, payment) => sum + payment.amount_minor,
      0,
    );

    if (
      order.normalized_status === "cancelled" &&
      settledCharges.length > 0
    ) {
      cancelledWithSettledCharge.push({
        normalized_key: key,
        order: {
          source_row_number: order.source_row_number,
          original_order_id: order.original_order_id,
          normalized_order_id: order.normalized_order_id,
          status: order.normalized_status,
          net_amount_minor: order.net_amount_minor,
          currency: order.normalized_currency,
        },
        settled_charge_count: settledCharges.length,
      });
    }

    if (order.normalized_status === "refunded" && refundSum > 0) {
      if (refundSum < order.net_amount_minor) {
        refundedWithPartialRefund.push({
          normalized_key: key,
          order_net_amount_minor: order.net_amount_minor,
          settled_refund_sum_minor: refundSum,
          order: {
            source_row_number: order.source_row_number,
            original_order_id: order.original_order_id,
            normalized_order_id: order.normalized_order_id,
            status: order.normalized_status,
            currency: order.normalized_currency,
          },
        });
      }
    }

    if (order.normalized_status === "completed" && refundSum > 0) {
      if (refundSum === order.net_amount_minor) {
        completedWithFullRefund.push({
          normalized_key: key,
          order_net_amount_minor: order.net_amount_minor,
          settled_refund_sum_minor: refundSum,
          order: {
            source_row_number: order.source_row_number,
            original_order_id: order.original_order_id,
            normalized_order_id: order.normalized_order_id,
            status: order.normalized_status,
            currency: order.normalized_currency,
          },
        });
      }
    }
  }

  const orderArithmeticFailures = orders
    .filter((order) => !order.order_arithmetic_ok)
    .sort((a, b) => a.source_row_number - b.source_row_number)
    .map((order) => ({
      source_row_number: order.source_row_number,
      original_order_id: order.original_order_id,
      normalized_order_id: order.normalized_order_id,
      gross_amount_minor: order.gross_amount_minor,
      discount_minor: order.discount_minor,
      net_amount_minor: order.net_amount_minor,
    }));

  const paymentSettlementArithmeticFailures = payments
    .filter((payment) => !payment.settlement_arithmetic_ok)
    .sort((a, b) => a.source_row_number - b.source_row_number)
    .map((payment) => ({
      source_row_number: payment.source_row_number,
      original_payment_id: payment.original_payment_id,
      normalized_payment_id: payment.normalized_payment_id,
      amount_minor: payment.amount_minor,
      fee_minor: payment.fee_minor,
      net_settled_minor: payment.net_settled_minor,
    }));

  return {
    generated_at_note:
      "Facts only. No finding classification, severity, tolerance bands, or risk formulas.",
    sources: {
      orders_path: "sample/orders.csv",
      payments_path: "sample/payments.csv",
    },
    counts: {
      order_rows: orders.length,
      unique_normalized_order_ids: uniqueOrderKeys.length,
      payment_rows: payments.length,
      unique_transaction_references: uniquePaymentIds.length,
      unique_normalized_payment_order_references: uniquePaymentOrderRefs.length,
      matched_normalized_keys: matchedKeys.length,
      union_normalized_keys: unionKeys.length,
      order_keys_without_payment_activity: orderKeysWithoutPayments.length,
      payment_references_without_orders: paymentRefsWithoutOrders.length,
      duplicated_order_groups: duplicatedOrderGroups.length,
      identical_duplicated_order_groups: duplicatedOrderGroups.filter(
        (group) => group.identical_rows,
      ).length,
      multiple_settled_charge_groups: multipleSettledChargeGroups.length,
      currency_conflicts: currencyConflicts.length,
      non_zero_amount_differences: amountDifferences.length,
      failed_charges: failedCharges.length,
      pending_charges: pendingCharges.length,
      cancelled_orders_with_settled_charge: cancelledWithSettledCharge.length,
      refunded_orders_with_partial_refund: refundedWithPartialRefund.length,
      completed_orders_with_full_refund: completedWithFullRefund.length,
      order_arithmetic_failures: orderArithmeticFailures.length,
      payment_settlement_arithmetic_failures:
        paymentSettlementArithmeticFailures.length,
    },
    sets: {
      matched_normalized_keys: matchedKeys,
      union_normalized_keys: unionKeys,
      order_keys_without_payment_activity: orderKeysWithoutPayments,
      payment_references_without_orders: paymentRefsWithoutOrders,
    },
    duplicated_order_groups: duplicatedOrderGroups.sort((a, b) =>
      a.normalized_order_id.localeCompare(b.normalized_order_id),
    ),
    multiple_settled_charge_groups: multipleSettledChargeGroups.sort((a, b) =>
      a.normalized_key.localeCompare(b.normalized_key),
    ),
    currency_conflicts: currencyConflicts.sort((a, b) =>
      a.normalized_key.localeCompare(b.normalized_key),
    ),
    amount_differences: amountDifferences,
    failed_charges: failedCharges,
    pending_charges: pendingCharges,
    cancelled_orders_with_settled_charge: cancelledWithSettledCharge.sort(
      (a, b) => a.normalized_key.localeCompare(b.normalized_key),
    ),
    refunded_orders_with_partial_refund: refundedWithPartialRefund.sort(
      (a, b) => a.normalized_key.localeCompare(b.normalized_key),
    ),
    completed_orders_with_full_refund: completedWithFullRefund.sort((a, b) =>
      a.normalized_key.localeCompare(b.normalized_key),
    ),
    order_arithmetic_failures: orderArithmeticFailures,
    payment_settlement_arithmetic_failures:
      paymentSettlementArithmeticFailures,
    stage_4_warnings_note:
      "Stage 4’s five ingestion warnings remain data-quality observations, not business discrepancies.",
  };
}

function printSummary(profileResult) {
  const { counts } = profileResult;
  const lines = [
    "Reference dataset profile (facts only)",
    "======================================",
    `Order rows: ${counts.order_rows}`,
    `Unique normalized order IDs: ${counts.unique_normalized_order_ids}`,
    `Payment rows: ${counts.payment_rows}`,
    `Unique transaction references: ${counts.unique_transaction_references}`,
    `Unique normalized payment order references: ${counts.unique_normalized_payment_order_references}`,
    `Matched normalized keys: ${counts.matched_normalized_keys}`,
    `Union normalized keys: ${counts.union_normalized_keys}`,
    `Duplicated order groups: ${counts.duplicated_order_groups} (identical: ${counts.identical_duplicated_order_groups})`,
    `Order keys without payment activity: ${counts.order_keys_without_payment_activity}`,
    `Payment references without orders: ${counts.payment_references_without_orders}`,
    `Multiple settled charge groups: ${counts.multiple_settled_charge_groups}`,
    `Currency conflicts: ${counts.currency_conflicts}`,
    `Non-zero amount differences: ${counts.non_zero_amount_differences}`,
    `Failed charges: ${counts.failed_charges}`,
    `Pending charges: ${counts.pending_charges}`,
    `Cancelled orders with settled charge: ${counts.cancelled_orders_with_settled_charge}`,
    `Refunded orders with partial refund: ${counts.refunded_orders_with_partial_refund}`,
    `Completed orders with full refund: ${counts.completed_orders_with_full_refund}`,
    `Order arithmetic failures: ${counts.order_arithmetic_failures}`,
    `Payment settlement arithmetic failures: ${counts.payment_settlement_arithmetic_failures}`,
  ];
  console.error(lines.join("\n"));
}

function shuffle(array, seed) {
  const copy = array.slice();
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function main() {
  const orderRows = parseCsv(ORDERS_PATH);
  const paymentRows = parseCsv(PAYMENTS_PATH);
  const orders = loadOrders(orderRows);
  const payments = loadPayments(paymentRows);

  const primary = profile(orders, payments);
  const shuffled = profile(
    shuffle(orders, 0xc0ffee),
    shuffle(payments, 0xbadc0de),
  );

  if (stableStringify(primary) !== stableStringify(shuffled)) {
    throw new Error(
      "Profiler output changed after shuffling input rows; results must be order-independent.",
    );
  }

  printSummary(primary);
  process.stdout.write(`${stableStringify(primary)}\n`);
}

main();
