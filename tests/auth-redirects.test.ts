import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "@/lib/auth/redirects";

describe("resolveAuthRedirect", () => {
  it("sends signed-out users from home and app to login", () => {
    expect(resolveAuthRedirect("/", false)).toBe("/login");
    expect(resolveAuthRedirect("/app", false)).toBe("/login");
    expect(resolveAuthRedirect("/app/settings", false)).toBe("/login");
  });

  it("allows signed-out users on auth pages", () => {
    expect(resolveAuthRedirect("/login", false)).toBeNull();
    expect(resolveAuthRedirect("/signup", false)).toBeNull();
  });

  it("sends signed-in users from home and auth pages to app", () => {
    expect(resolveAuthRedirect("/", true)).toBe("/app");
    expect(resolveAuthRedirect("/login", true)).toBe("/app");
    expect(resolveAuthRedirect("/signup", true)).toBe("/app");
  });

  it("allows signed-in users on app routes", () => {
    expect(resolveAuthRedirect("/app", true)).toBeNull();
    expect(resolveAuthRedirect("/app/imports", true)).toBeNull();
  });

  it("does not redirect auth API paths", () => {
    expect(resolveAuthRedirect("/auth/login", false)).toBeNull();
    expect(resolveAuthRedirect("/auth/confirm", true)).toBeNull();
  });
});
