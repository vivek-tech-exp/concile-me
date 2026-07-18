import type { CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";

export type AuthCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Apply cookies and cache headers produced by Supabase `setAll` onto a response.
 * Prefer this over `cookies.getAll()` → `set(name, value)`, which drops options.
 */
export function applyAuthCookiesToResponse(
  response: NextResponse,
  cookies: readonly AuthCookieToSet[],
  headers: Record<string, string> = {},
): NextResponse {
  for (const { name, value, options } of cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
