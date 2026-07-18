import { describe, expect, it } from "vitest";

import { mapSupabaseAuthError } from "@/lib/auth/map-supabase-error";
import { authErrorMessage } from "@/lib/auth/messages";

describe("mapSupabaseAuthError", () => {
  it("maps invalid login credentials for login", () => {
    expect(
      mapSupabaseAuthError(
        { code: "invalid_credentials", message: "Invalid login credentials" },
        "login",
      ),
    ).toBe("invalid_credentials");
    expect(authErrorMessage("invalid_credentials")).toContain("Incorrect email or password");
  });

  it("maps already-registered signup errors", () => {
    expect(
      mapSupabaseAuthError(
        { message: "User already registered", status: 422 },
        "signup",
      ),
    ).toBe("account_exists");
  });

  it("maps unconfirmed email on login", () => {
    expect(
      mapSupabaseAuthError(
        { code: "email_not_confirmed", message: "Email not confirmed" },
        "login",
      ),
    ).toBe("email_not_confirmed");
  });
});
