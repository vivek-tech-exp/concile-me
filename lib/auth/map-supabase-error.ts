import type { AuthErrorCode } from "@/lib/auth/messages";

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

function includesMessage(error: AuthErrorLike, fragment: string): boolean {
  return (error.message ?? "").toLowerCase().includes(fragment.toLowerCase());
}

/**
 * Map Supabase Auth errors to safe UI codes without exposing provider text.
 */
export function mapSupabaseAuthError(
  error: AuthErrorLike,
  context: "login" | "signup",
): AuthErrorCode {
  const code = (error.code ?? "").toLowerCase();

  if (
    code === "invalid_credentials" ||
    includesMessage(error, "invalid login credentials") ||
    includesMessage(error, "invalid email or password")
  ) {
    return "invalid_credentials";
  }

  if (
    code === "email_not_confirmed" ||
    includesMessage(error, "email not confirmed")
  ) {
    return "email_not_confirmed";
  }

  if (
    code === "user_already_exists" ||
    code === "user_already_registered" ||
    includesMessage(error, "already registered") ||
    includesMessage(error, "already been registered") ||
    includesMessage(error, "user already exists")
  ) {
    return "account_exists";
  }

  if (
    code === "weak_password" ||
    (includesMessage(error, "password") && includesMessage(error, "weak"))
  ) {
    return "weak_password";
  }

  if (context === "login") {
    // Prefer a credentials message for credential-shaped login failures.
    if (error.status === 400 || error.status === 401) {
      return "invalid_credentials";
    }
  }

  return "provider";
}
