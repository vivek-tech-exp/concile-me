import { describe, expect, it } from "vitest";

import { PROJECT_NAME } from "@/lib/project";

describe("application foundation", () => {
  it("exposes the project identity", () => {
    expect(PROJECT_NAME).toBe("concile-me");
  });
});
