import { describe, expect, it, vi } from "vitest";

import {
  createImportIdempotencyState,
  markImportAttemptStarted,
  onImportFilesChanged,
  onImportSucceeded,
} from "@/features/imports/import-idempotency";

describe("import idempotency state", () => {
  it("keeps the key when files change before any attempt", () => {
    const createKey = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");

    const initial = createImportIdempotencyState(createKey);
    const next = onImportFilesChanged(initial, createKey);

    expect(next.key).toBe("key-1");
    expect(next.usedForAttempt).toBe(false);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("preserves the key across retries without a file change", () => {
    const createKey = vi.fn().mockReturnValue("key-1");
    let state = createImportIdempotencyState(createKey);
    state = markImportAttemptStarted(state);

    expect(state.key).toBe("key-1");
    expect(state.usedForAttempt).toBe(true);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("rotates the key when files change after an attempt", () => {
    const createKey = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");

    let state = createImportIdempotencyState(createKey);
    state = markImportAttemptStarted(state);
    state = onImportFilesChanged(state, createKey);

    expect(state.key).toBe("key-2");
    expect(state.usedForAttempt).toBe(false);
  });

  it("rotates the key after a successful import", () => {
    const createKey = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2");

    let state = createImportIdempotencyState(createKey);
    state = markImportAttemptStarted(state);
    state = onImportSucceeded(state, createKey);

    expect(state.key).toBe("key-2");
    expect(state.usedForAttempt).toBe(false);
  });
});
