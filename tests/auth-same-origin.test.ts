import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "@/lib/auth/same-origin";

describe("isSameOriginRequest", () => {
  it("accepts a matching Origin header", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects a cross-site Origin header", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("accepts a matching Referer when Origin is absent", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { Referer: "http://localhost/login" },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects a cross-site Referer when Origin is absent", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { Referer: "https://evil.example/attack" },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("rejects requests with neither Origin nor Referer", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("rejects an invalid Referer URL", () => {
    const request = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { Referer: "not-a-url" },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });
});
