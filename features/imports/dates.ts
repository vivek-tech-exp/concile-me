const ORDER_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const PAYMENT_TIMESTAMP_PATTERN =
  /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

export type DateParseResult =
  | { ok: true; isoTimestamp: string }
  | { ok: false; code: string; message: string };

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function isValidTime(
  hour: number,
  minute: number,
  second: number,
): boolean {
  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Parse order_date as exact YYYY-MM-DD HH:mm:ss into a timestamp string
 * suitable for Postgres timestamp without time zone.
 */
export function parseOrderTimestamp(raw: string): DateParseResult {
  const match = ORDER_TIMESTAMP_PATTERN.exec(raw);
  if (!match) {
    return {
      ok: false,
      code: "DATE_FORMAT",
      message: "Order date must be YYYY-MM-DD HH:mm:ss",
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (!isValidCalendarDate(year, month, day) || !isValidTime(hour, minute, second)) {
    return {
      ok: false,
      code: "DATE_INVALID",
      message: "Order date is not a valid calendar timestamp",
    };
  }

  return {
    ok: true,
    isoTimestamp: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
  };
}

/**
 * Parse processed_at as exact DD/MM/YYYY HH:mm into a timestamp string.
 */
export function parsePaymentTimestamp(raw: string): DateParseResult {
  const match = PAYMENT_TIMESTAMP_PATTERN.exec(raw);
  if (!match) {
    return {
      ok: false,
      code: "DATE_FORMAT",
      message: "Payment timestamp must be DD/MM/YYYY HH:mm",
    };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (!isValidCalendarDate(year, month, day) || !isValidTime(hour, minute, 0)) {
    return {
      ok: false,
      code: "DATE_INVALID",
      message: "Payment timestamp is not a valid calendar timestamp",
    };
  }

  return {
    ok: true,
    isoTimestamp: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:00`,
  };
}
