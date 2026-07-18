import { describe, expect, it } from "vitest";

import { parseOrderTimestamp, parsePaymentTimestamp } from "@/features/imports/dates";
import { parseMoneyToMinor } from "@/features/imports/money";
import {
  normalizeCurrency,
  normalizeEnumToken,
  normalizeIdentifier,
} from "@/features/imports/normalize";
import {
  currencySchema,
  orderStatusSchema,
  paymentStatusSchema,
  paymentTypeSchema,
} from "@/features/imports/contracts";

describe("parseMoneyToMinor", () => {
  it("parses zero, one, and two fractional digits", () => {
    expect(parseMoneyToMinor("210")).toEqual({ ok: true, minor: 21000 });
    expect(parseMoneyToMinor("210.0")).toEqual({ ok: true, minor: 21000 });
    expect(parseMoneyToMinor("325.12")).toEqual({ ok: true, minor: 32512 });
    expect(parseMoneyToMinor("0")).toEqual({ ok: true, minor: 0 });
    expect(parseMoneyToMinor("0.00")).toEqual({ ok: true, minor: 0 });
  });

  it("leaves optional discount empty to the caller", () => {
    expect(parseMoneyToMinor("")).toMatchObject({ ok: false, code: "MONEY_EMPTY" });
  });

  it("rejects malformed, negative, comma, exponent, and excessive precision", () => {
    expect(parseMoneyToMinor("-1.00").ok).toBe(false);
    expect(parseMoneyToMinor("1,00").ok).toBe(false);
    expect(parseMoneyToMinor("1e2").ok).toBe(false);
    expect(parseMoneyToMinor("1.234").ok).toBe(false);
    expect(parseMoneyToMinor("abc").ok).toBe(false);
    expect(parseMoneyToMinor("+10").ok).toBe(false);
  });

  it("rejects unsafe overflow amounts", () => {
    expect(parseMoneyToMinor("90071992547410.00").ok).toBe(false);
  });

  it("does not use floating-point conversion", () => {
    const source = parseMoneyToMinor.toString();
    expect(source).not.toMatch(/\bparseFloat\b/);
    expect(source).not.toMatch(/\bNumber\s*\(/);
    expect(source).not.toMatch(/\bparseInt\b/);
  });
});

describe("date parsers", () => {
  it("accepts valid order and payment timestamps", () => {
    expect(parseOrderTimestamp("2025-04-13 00:00:00")).toEqual({
      ok: true,
      isoTimestamp: "2025-04-13 00:00:00",
    });
    expect(parsePaymentTimestamp("02/04/2025 18:39")).toEqual({
      ok: true,
      isoTimestamp: "2025-04-02 18:39:00",
    });
  });

  it("rejects invalid formats and calendar dates", () => {
    expect(parseOrderTimestamp("13/04/2025 00:00:00").ok).toBe(false);
    expect(parseOrderTimestamp("2025-02-30 00:00:00").ok).toBe(false);
    expect(parsePaymentTimestamp("2025-04-02 18:39").ok).toBe(false);
    expect(parsePaymentTimestamp("31/02/2025 10:00").ok).toBe(false);
  });
});

describe("normalization and enums", () => {
  it("preserves originals while normalizing identifiers", () => {
    expect(normalizeIdentifier(" ord-1801 ")).toEqual({
      original: " ord-1801 ",
      normalized: "ORD-1801",
      changed: true,
    });
    expect(normalizeIdentifier("ORD-1001")).toEqual({
      original: "ORD-1001",
      normalized: "ORD-1001",
      changed: false,
    });
  });

  it("normalizes currency and enum tokens", () => {
    expect(normalizeCurrency(" usd ")).toEqual({
      original: " usd ",
      normalized: "USD",
      changed: true,
    });
    expect(normalizeEnumToken(" Completed ")).toEqual({
      original: " Completed ",
      normalized: "completed",
      changed: true,
    });
  });

  it("accepts supported statuses and types and rejects others", () => {
    expect(orderStatusSchema.safeParse("completed").success).toBe(true);
    expect(orderStatusSchema.safeParse("paid").success).toBe(false);
    expect(paymentTypeSchema.safeParse("charge").success).toBe(true);
    expect(paymentTypeSchema.safeParse("capture").success).toBe(false);
    expect(paymentStatusSchema.safeParse("settled").success).toBe(true);
    expect(paymentStatusSchema.safeParse("succeeded").success).toBe(false);
    expect(currencySchema.safeParse("USD").success).toBe(true);
    expect(currencySchema.safeParse("US").success).toBe(false);
    expect(currencySchema.safeParse("usd").success).toBe(false);
  });
});
