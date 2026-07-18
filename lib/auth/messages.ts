export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "validation",
  "provider",
  "confirmation_expired",
  "config",
] as const;

export const AUTH_MESSAGE_CODES = ["check_email"] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
export type AuthMessageCode = (typeof AUTH_MESSAGE_CODES)[number];

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "Invalid email or password.",
  validation: "Enter a valid email and password.",
  provider: "Unable to complete authentication. Try again.",
  confirmation_expired:
    "This confirmation link is invalid or has expired. Request a new one by signing up again.",
  config:
    "Authentication is unavailable because Supabase is not configured. Check your environment variables.",
};

const SUCCESS_MESSAGES: Record<AuthMessageCode, string> = {
  check_email:
    "Check your email for a confirmation link before logging in.",
};

export function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

export function isAuthMessageCode(value: string): value is AuthMessageCode {
  return (AUTH_MESSAGE_CODES as readonly string[]).includes(value);
}

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code || !isAuthErrorCode(code)) {
    return null;
  }
  return ERROR_MESSAGES[code];
}

export function authSuccessMessage(
  code: string | null | undefined,
): string | null {
  if (!code || !isAuthMessageCode(code)) {
    return null;
  }
  return SUCCESS_MESSAGES[code];
}
