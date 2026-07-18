import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, prepareImportFromFilesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  prepareImportFromFilesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/features/imports/prepare-import", () => ({
  prepareImportFromFiles: prepareImportFromFilesMock,
}));

import { POST } from "@/app/api/imports/route";

const ORDER_PAYLOAD = [
  {
    source_row_number: 2,
    original_order_id: "ORD-1",
    normalized_order_id: "ORD-1",
    original_customer_email: "a@example.com",
    original_status: "completed",
    normalized_status: "completed",
    original_currency: "USD",
    normalized_currency: "USD",
    original_gross_amount: "10.00",
    gross_amount_minor: 1000,
    original_discount: "0.00",
    discount_minor: 0,
    original_net_amount: "10.00",
    net_amount_minor: 1000,
    original_order_date: "2025-04-13 00:00:00",
    order_timestamp: "2025-04-13 00:00:00",
  },
];

const PAYMENT_PAYLOAD = [
  {
    source_row_number: 2,
    original_payment_id: "TXN1",
    normalized_payment_id: "TXN1",
    original_order_reference: "ORD-1",
    normalized_order_reference: "ORD-1",
    original_type: "charge",
    normalized_type: "charge",
    original_status: "settled",
    normalized_status: "settled",
    original_currency: "USD",
    normalized_currency: "USD",
    original_amount: "10.00",
    amount_minor: 1000,
    original_fee: "0.30",
    fee_minor: 30,
    original_net_settled: "9.70",
    net_settled_minor: 970,
    original_transaction_date: "02/04/2025 18:39",
    processed_at: "2025-04-02 18:39:00",
  },
];

function multipartRequest(fields: {
  idempotencyKey?: string;
  orders?: File | string;
  payments?: File | string;
  duplicateOrders?: boolean;
}): Request {
  const body = new FormData();
  if (fields.idempotencyKey !== undefined) {
    body.set("idempotencyKey", fields.idempotencyKey);
  }
  if (fields.orders !== undefined) {
    body.set("orders", fields.orders);
  }
  if (fields.duplicateOrders && fields.orders instanceof File) {
    body.append("orders", fields.orders);
  }
  if (fields.payments !== undefined) {
    body.set("payments", fields.payments);
  }
  return new Request("http://localhost/api/imports", {
    method: "POST",
    body,
  });
}

function mockAuthenticatedClient(options: {
  rpc: ReturnType<typeof vi.fn>;
  batch?: {
    id: string;
    orders_row_count: number;
    payments_row_count: number;
    warning_count: number;
  } | null;
  findings?: Array<{
    code: string;
    severity: string;
    message: string;
    sort_key: string;
    currency: string | null;
    financial_impact_minor: number | null;
  }>;
}) {
  const findingsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: options.findings ?? [],
      error: null,
    }),
  };

  const batchQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.batch ?? null,
      error: null,
    }),
  };

  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    rpc: options.rpc,
    from: vi.fn((table: string) => {
      if (table === "import_batches") {
        return batchQuery;
      }
      if (table === "findings") {
        return findingsQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  });
}

describe("POST /api/imports", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    prepareImportFromFilesMock.mockReset();
  });

  it("rejects unauthenticated requests before file parsing", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    const rpc = vi.fn();
    createClientMock.mockResolvedValue({
      auth: { getUser },
      rpc,
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(prepareImportFromFilesMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-multipart requests", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      rpc: vi.fn(),
    });

    const response = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(415);
    expect(prepareImportFromFilesMock).not.toHaveBeenCalled();
  });

  it("rejects missing or duplicate files and invalid idempotency keys", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      rpc: vi.fn(),
    });

    const invalidKey = await POST(
      multipartRequest({
        idempotencyKey: "not-a-uuid",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );
    expect(invalidKey.status).toBe(400);
    expect(prepareImportFromFilesMock).not.toHaveBeenCalled();

    const missing = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
      }),
    );
    expect(missing.status).toBe(400);

    const duplicate = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
        duplicateOrders: true,
      }),
    );
    expect(duplicate.status).toBe(400);
  });

  it("does not invoke the RPC when validation fails", async () => {
    const rpc = vi.fn();
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      rpc,
    });
    prepareImportFromFilesMock.mockResolvedValue({
      ok: false,
      issues: [
        {
          source: "orders",
          code: "HEADERS_MISSING",
          message: "CSV header row is missing",
        },
      ],
      totalIssueCount: 1,
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists a valid payload and returns persisted counts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      error: null,
    });
    mockAuthenticatedClient({
      rpc,
      batch: {
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        orders_row_count: 1,
        payments_row_count: 1,
        warning_count: 1,
      },
      findings: [
        {
          code: "MISSING_OR_INVALID_EMAIL",
          severity: "low",
          message: "customer_email is missing or invalid",
          sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
          currency: null,
          financial_impact_minor: null,
        },
      ],
    });
    prepareImportFromFilesMock.mockResolvedValue({
      ok: true,
      data: {
        ordersFilename: "orders.csv",
        paymentsFilename: "payments.csv",
        orders: ORDER_PAYLOAD,
        payments: PAYMENT_PAYLOAD,
        warnings: [
          {
            code: "MISSING_OR_INVALID_EMAIL",
            severity: "low",
            message: "customer_email is missing or invalid",
            sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
            source: "orders",
            source_row_number: 2,
            order_record_source_rows: [2],
          },
        ],
      },
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      batchId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      orderCount: 1,
      paymentCount: 1,
      warningCount: 1,
      warnings: [
        {
          code: "MISSING_OR_INVALID_EMAIL",
          source: "orders",
          source_row_number: 2,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("create_import_batch", {
      p_idempotency_key: "11111111-1111-4111-8111-111111111111",
      p_orders_filename: "orders.csv",
      p_payments_filename: "payments.csv",
      p_orders: ORDER_PAYLOAD,
      p_payments: PAYMENT_PAYLOAD,
      p_warnings: [
        {
          code: "MISSING_OR_INVALID_EMAIL",
          severity: "low",
          message: "customer_email is missing or invalid",
          sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
          order_record_source_rows: [2],
        },
      ],
    });
  });

  it("returns persisted metadata for idempotent retries with different uploads", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      error: null,
    });
    mockAuthenticatedClient({
      rpc,
      batch: {
        id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        orders_row_count: 185,
        payments_row_count: 187,
        warning_count: 5,
      },
      findings: [
        {
          code: "MISSING_PAYMENT_TIMESTAMP",
          severity: "low",
          message: "processed_at is missing",
          sort_key: "payments:000059:MISSING_PAYMENT_TIMESTAMP",
          currency: null,
          financial_impact_minor: null,
        },
      ],
    });
    prepareImportFromFilesMock.mockResolvedValue({
      ok: true,
      data: {
        ordersFilename: "other-orders.csv",
        paymentsFilename: "other-payments.csv",
        orders: ORDER_PAYLOAD,
        payments: PAYMENT_PAYLOAD,
        warnings: [],
      },
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "other-orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "other-payments.csv", { type: "text/csv" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      batchId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      orderCount: 185,
      paymentCount: 187,
      warningCount: 5,
      warnings: [
        {
          code: "MISSING_PAYMENT_TIMESTAMP",
          severity: "low",
          message: "processed_at is missing",
          sort_key: "payments:000059:MISSING_PAYMENT_TIMESTAMP",
          source: "payments",
          source_row_number: 59,
          payment_record_source_rows: [59],
        },
      ],
    });
  });

  it("reports persisted warningCount when warning details are capped", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "cccccccc-dddd-4eee-8fff-000000000000",
      error: null,
    });
    mockAuthenticatedClient({
      rpc,
      batch: {
        id: "cccccccc-dddd-4eee-8fff-000000000000",
        orders_row_count: 5000,
        payments_row_count: 5000,
        warning_count: 250,
      },
      findings: [
        {
          code: "MISSING_OR_INVALID_EMAIL",
          severity: "low",
          message: "customer_email is missing or invalid",
          sort_key: "orders:000002:MISSING_OR_INVALID_EMAIL",
          currency: null,
          financial_impact_minor: null,
        },
      ],
    });
    prepareImportFromFilesMock.mockResolvedValue({
      ok: true,
      data: {
        ordersFilename: "orders.csv",
        paymentsFilename: "payments.csv",
        orders: ORDER_PAYLOAD,
        payments: PAYMENT_PAYLOAD,
        warnings: [],
      },
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warningCount).toBe(250);
    expect(body.warnings).toHaveLength(1);
    expect(body.warningCount).toBeGreaterThan(body.warnings.length);
  });

  it("maps persistence failures to a safe retryable error", async () => {
    mockAuthenticatedClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "relation does not exist", code: "42P01" },
      }),
    });
    prepareImportFromFilesMock.mockResolvedValue({
      ok: true,
      data: {
        ordersFilename: "orders.csv",
        paymentsFilename: "payments.csv",
        orders: ORDER_PAYLOAD,
        payments: PAYMENT_PAYLOAD,
        warnings: [],
      },
    });

    const response = await POST(
      multipartRequest({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        orders: new File(["x"], "orders.csv", { type: "text/csv" }),
        payments: new File(["y"], "payments.csv", { type: "text/csv" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
  });
});
