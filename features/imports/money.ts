const MAX_SAFE_MINOR = BigInt("9007199254740991");
const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export type MoneyParseResult =
  | { ok: true; minor: number }
  | { ok: false; code: string; message: string };

function bigintToSafeInteger(value: bigint): number {
  let result = 0;
  const digits = value.toString();
  for (let index = 0; index < digits.length; index += 1) {
    result = result * 10 + (digits.charCodeAt(index) - 48);
  }
  return result;
}

/**
 * Parse a non-negative decimal money string into integer minor units.
 * Does not use Number, parseFloat, or floating-point arithmetic.
 */
export function parseMoneyToMinor(raw: string): MoneyParseResult {
  if (raw.length === 0) {
    return {
      ok: false,
      code: "MONEY_EMPTY",
      message: "Amount is required",
    };
  }

  if (/[+\-eE,]/.test(raw) || raw.includes(" ")) {
    return {
      ok: false,
      code: "MONEY_MALFORMED",
      message:
        "Amount must be a non-negative decimal without signs, commas, or exponents",
    };
  }

  const match = MONEY_PATTERN.exec(raw);
  if (!match) {
    return {
      ok: false,
      code: "MONEY_MALFORMED",
      message: "Amount must have zero, one, or two fractional digits",
    };
  }

  const wholeDigits = match[1] ?? "0";
  const fractionDigits = (match[2] ?? "").padEnd(2, "0");
  const whole = BigInt(wholeDigits);
  const fraction = BigInt(fractionDigits);
  const minor = whole * BigInt(100) + fraction;

  if (minor > MAX_SAFE_MINOR) {
    return {
      ok: false,
      code: "MONEY_OVERFLOW",
      message: "Amount exceeds the safe integer range",
    };
  }

  return { ok: true, minor: bigintToSafeInteger(minor) };
}
