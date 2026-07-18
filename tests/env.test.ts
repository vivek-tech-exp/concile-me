import { describe, expect, it } from "vitest";

import {
  parseSupabaseEnv,
  SupabaseConfigError,
} from "@/lib/validation/env";

describe("parseSupabaseEnv", () => {
  it("accepts a valid URL and publishable key", () => {
    expect(
      parseSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    });
  });

  it("rejects a missing URL", () => {
    expect(() =>
      parseSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      }),
    ).toThrow(SupabaseConfigError);
  });

  it("rejects a missing publishable key", () => {
    expect(() =>
      parseSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ",
      }),
    ).toThrow(SupabaseConfigError);
  });

  it("rejects a malformed URL without exposing the value", () => {
    try {
      parseSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SupabaseConfigError);
      expect((error as Error).message).not.toContain("not-a-url");
    }
  });
});
