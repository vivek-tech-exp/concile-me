import { describe, expect, it } from "vitest";

import { importResponseSchema } from "@/features/imports/contracts";

describe("importResponseSchema", () => {
  it("accepts a valid success payload", () => {
    const parsed = importResponseSchema.safeParse({
      ok: true,
      batchId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      orderCount: 1,
      paymentCount: 1,
      warningCount: 1,
      warnings: [
        {
          code: "MISSING_OR_INVALID_EMAIL",
          severity: "low",
          message: "customer_email is missing or invalid",
          sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
          source: "orders",
          source_row_number: 2,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a valid error payload", () => {
    const parsed = importResponseSchema.safeParse({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "CSV validation failed",
        retryable: false,
        totalIssueCount: 1,
        issues: [
          {
            source: "orders",
            code: "HEADERS_MISSING",
            message: "CSV header row is missing",
          },
        ],
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects malformed success and error payloads", () => {
    expect(
      importResponseSchema.safeParse({
        ok: true,
        batchId: "not-a-uuid",
        orderCount: 1,
        paymentCount: 1,
        warningCount: 0,
        warnings: [],
      }).success,
    ).toBe(false);

    expect(
      importResponseSchema.safeParse({
        ok: false,
        error: {
          code: "VALIDATION",
          message: "CSV validation failed",
        },
      }).success,
    ).toBe(false);

    expect(importResponseSchema.safeParse({ ok: true }).success).toBe(false);
    expect(importResponseSchema.safeParse(null).success).toBe(false);
  });
});
