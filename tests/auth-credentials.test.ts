import { describe, expect, it } from "vitest";

import { parseAuthCredentials } from "@/lib/validation/auth-credentials";

describe("parseAuthCredentials", () => {
  it("accepts valid email and password", () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "any-password");

    expect(parseAuthCredentials(formData)).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "any-password",
      },
    });
  });

  it("rejects a malformed email", () => {
    expect(
      parseAuthCredentials({
        email: "not-an-email",
        password: "password",
      }),
    ).toEqual({ success: false, error: "validation" });
  });

  it("rejects a missing password", () => {
    expect(
      parseAuthCredentials({
        email: "user@example.com",
        password: "",
      }),
    ).toEqual({ success: false, error: "validation" });
  });

  it("rejects wrong value types from FormData", () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.append("password", new File(["x"], "x.txt"));

    expect(parseAuthCredentials(formData)).toEqual({
      success: false,
      error: "validation",
    });
  });
});
