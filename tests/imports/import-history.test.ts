import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { HISTORY_WARNING_PREVIEW } from "@/features/imports/contracts";
import { loadOwnedImports } from "@/features/imports/import-history";

describe("loadOwnedImports warning previews", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("loads warning previews per batch with an explicit limit", async () => {
    const findingsLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          import_batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          code: "MISSING_OR_INVALID_EMAIL",
          message: "customer_email is missing or invalid",
          sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
          reconciliation_id: null,
        },
      ],
      error: null,
    });
    const findingsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: findingsLimit,
    };
    const batchesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    // Final order resolves batches
    batchesQuery.order = vi
      .fn()
      .mockReturnValueOnce(batchesQuery)
      .mockResolvedValueOnce({
        data: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            orders_filename: "orders.csv",
            payments_filename: "payments.csv",
            created_at: "2026-01-01T00:00:00.000Z",
            orders_row_count: 10,
            payments_row_count: 10,
            warning_count: 40,
          },
        ],
        error: null,
      });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "import_batches") {
          return batchesQuery;
        }
        if (table === "findings") {
          return findingsQuery;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const result = await loadOwnedImports();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(findingsQuery.eq).toHaveBeenCalledWith(
      "import_batch_id",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(findingsLimit).toHaveBeenCalledWith(HISTORY_WARNING_PREVIEW);
    expect(result.imports[0]?.warning_count).toBe(40);
    expect(result.imports[0]?.warnings).toHaveLength(1);
  });
});
