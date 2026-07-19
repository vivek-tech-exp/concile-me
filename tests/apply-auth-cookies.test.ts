import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { applyAuthCookiesToResponse } from "@/lib/supabase/apply-auth-cookies";

describe("applyAuthCookiesToResponse", () => {
  it("preserves cookie options instead of name/value only", () => {
    const response = NextResponse.redirect("http://localhost/login");

    applyAuthCookiesToResponse(
      response,
      [
        {
          name: "sb-access-token",
          value: "token",
          options: {
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
            sameSite: "lax",
            httpOnly: true,
            secure: true,
          },
        },
        {
          name: "sb-stale-chunk",
          value: "",
          options: {
            path: "/",
            maxAge: 0,
          },
        },
      ],
      {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
        Expires: "0",
        Pragma: "no-cache",
      },
    );

    const setCookie = response.headers.getSetCookie();
    expect(setCookie.some((header) => header.includes("sb-access-token=token"))).toBe(
      true,
    );
    expect(
      setCookie.some(
        (header) =>
          header.includes("sb-access-token=") &&
          header.toLowerCase().includes("httponly") &&
          header.toLowerCase().includes("secure") &&
          header.toLowerCase().includes("samesite=lax") &&
          header.includes("Max-Age="),
      ),
    ).toBe(true);
    expect(
      setCookie.some(
        (header) =>
          header.includes("sb-stale-chunk=") &&
          (header.includes("Max-Age=0") || header.includes("max-age=0")),
      ),
    ).toBe(true);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });
});
