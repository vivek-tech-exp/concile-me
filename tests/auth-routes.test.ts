import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST as loginPost } from "@/app/auth/login/route";
import { GET as confirmGet } from "@/app/auth/confirm/route";
import { POST as logoutPost } from "@/app/auth/logout/route";
import { POST as signupPost } from "@/app/auth/signup/route";
import { SupabaseConfigError } from "@/lib/validation/env";

function formRequest(
  path: string,
  fields: Record<string, string>,
): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
  });
}

describe("auth route handlers", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("logs in successfully and redirects to /app", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn(),
        getSession: vi.fn(),
      },
    });

    const response = await loginPost(
      formRequest("/auth/login", {
        email: "user@example.com",
        password: "password123",
      }) as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/app");
  });

  it("returns a safe failure for invalid credentials", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: { message: "Invalid login credentials" } }),
      },
    });

    const response = await loginPost(
      formRequest("/auth/login", {
        email: "user@example.com",
        password: "wrong",
      }) as never,
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=invalid_credentials",
    );
    expect(response.headers.get("location")).not.toContain("Invalid login");
  });

  it("signs up with an immediate session and redirects to /app", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token" }, user: { id: "1" } },
          error: null,
        }),
      },
    });

    const response = await signupPost(
      formRequest("/auth/signup", {
        email: "user@example.com",
        password: "password123",
      }) as never,
    );

    expect(response.headers.get("location")).toBe("http://localhost/app");
  });

  it("asks the user to check email when confirmation is required", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { session: null, user: { id: "1" } },
          error: null,
        }),
      },
    });

    const response = await signupPost(
      formRequest("/auth/signup", {
        email: "user@example.com",
        password: "password123",
      }) as never,
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/signup?message=check_email",
    );
  });

  it("confirms a valid token_hash and redirects to /app", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockResolvedValue({
      auth: { verifyOtp },
    });

    const response = await confirmGet(
      new Request(
        "http://localhost/auth/confirm?token_hash=abc&type=email",
      ) as never,
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "abc",
    });
    expect(response.headers.get("location")).toBe("http://localhost/app");
  });

  it("rejects an invalid confirmation token safely", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        verifyOtp: vi
          .fn()
          .mockResolvedValue({ error: { message: "Token has expired or is invalid" } }),
      },
    });

    const response = await confirmGet(
      new Request(
        "http://localhost/auth/confirm?token_hash=bad&type=email",
      ) as never,
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=confirmation_expired",
    );
    expect(response.headers.get("location")).not.toContain("Token has expired");
  });

  it("logs out and redirects to login", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockResolvedValue({
      auth: { signOut },
    });

    const response = await logoutPost(
      new Request("http://localhost/auth/logout", { method: "POST" }) as never,
    );

    expect(signOut).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("surfaces a config error without exposing env values", async () => {
    createClientMock.mockRejectedValue(new SupabaseConfigError());

    const response = await loginPost(
      formRequest("/auth/login", {
        email: "user@example.com",
        password: "password123",
      }) as never,
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=config",
    );
  });
});
