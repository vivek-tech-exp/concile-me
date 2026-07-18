import { describe, expect, it } from "vitest";

import { shouldProxyPath } from "@/lib/supabase/proxy";

describe("shouldProxyPath", () => {
  it("matches application routes", () => {
    expect(shouldProxyPath("/")).toBe(true);
    expect(shouldProxyPath("/login")).toBe(true);
    expect(shouldProxyPath("/app")).toBe(true);
    expect(shouldProxyPath("/auth/confirm")).toBe(true);
  });

  it("excludes Next.js framework and static assets", () => {
    expect(shouldProxyPath("/_next/static/chunk.js")).toBe(false);
    expect(shouldProxyPath("/_next/image")).toBe(false);
    expect(shouldProxyPath("/favicon.ico")).toBe(false);
    expect(shouldProxyPath("/logo.svg")).toBe(false);
    expect(shouldProxyPath("/hero.PNG")).toBe(false);
  });
});
