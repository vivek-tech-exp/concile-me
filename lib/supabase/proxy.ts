import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRedirect } from "@/lib/auth/redirects";
import {
  applyAuthCookiesToResponse,
  type AuthCookieToSet,
} from "@/lib/supabase/apply-auth-cookies";
import {
  parseSupabaseEnv,
  SupabaseConfigError,
} from "@/lib/validation/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });
  let authCookies: AuthCookieToSet[] = [];
  let authHeaders: Record<string, string> = {};

  let env;
  try {
    env = parseSupabaseEnv(process.env);
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      throw error;
    }

    const redirectTo = resolveAuthRedirect(request.nextUrl.pathname, false);
    if (redirectTo) {
      const url = request.nextUrl.clone();
      url.pathname = redirectTo;
      if (request.nextUrl.pathname.startsWith("/app")) {
        url.searchParams.set("error", "config");
      }
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          authCookies = cookiesToSet;
          authHeaders = headers;
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          applyAuthCookiesToResponse(supabaseResponse, cookiesToSet, headers);
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const redirectTo = resolveAuthRedirect(
    request.nextUrl.pathname,
    isAuthenticated,
  );

  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    return applyAuthCookiesToResponse(
      redirectResponse,
      authCookies,
      authHeaders,
    );
  }

  return supabaseResponse;
}

/** Mirrors the static matcher declared in root `proxy.ts`. */
export const PROXY_MATCHER = [
  "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
] as const;

export function shouldProxyPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/static")) return false;
  if (pathname.startsWith("/_next/image")) return false;
  if (pathname === "/favicon.ico") return false;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp)$/i.test(pathname)) return false;
  return true;
}
