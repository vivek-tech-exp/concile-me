import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("protected server authorization boundary", () => {
  it("uses getUser and does not use getSession in the app layout", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/(app)/layout.tsx"),
      "utf8",
    );

    expect(source).toContain("getUser(");
    expect(source).not.toContain("getSession(");
  });

  it("uses getClaims in the proxy session helper, not getSession", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/supabase/proxy.ts"),
      "utf8",
    );

    expect(source).toContain("getClaims(");
    expect(source).not.toContain("getSession(");
  });
});
