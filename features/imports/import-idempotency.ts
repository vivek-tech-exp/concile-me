export type ImportIdempotencyState = {
  key: string;
  /** True after a submit that used `key` (success, failure, or uncertain). */
  usedForAttempt: boolean;
};

export function createImportIdempotencyState(
  createKey: () => string,
): ImportIdempotencyState {
  return {
    key: createKey(),
    usedForAttempt: false,
  };
}

/** Mark that the current key was sent in an import attempt. */
export function markImportAttemptStarted(
  state: ImportIdempotencyState,
): ImportIdempotencyState {
  return {
    ...state,
    usedForAttempt: true,
  };
}

/**
 * After success, always mint a new key for the next import.
 * After file selection changes following an attempt, rotate so a lost
 * successful response cannot bind new files to the prior completed batch.
 * Retry with unchanged files keeps the same key.
 */
export function onImportFilesChanged(
  state: ImportIdempotencyState,
  createKey: () => string,
): ImportIdempotencyState {
  if (!state.usedForAttempt) {
    return state;
  }
  return {
    key: createKey(),
    usedForAttempt: false,
  };
}

export function onImportSucceeded(
  state: ImportIdempotencyState,
  createKey: () => string,
): ImportIdempotencyState {
  return {
    key: createKey(),
    usedForAttempt: false,
  };
}
