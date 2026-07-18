import { NextResponse } from "next/server";

import type { AuthErrorCode, AuthMessageCode } from "@/lib/auth/messages";
import { AUTH_PATHS } from "@/lib/auth/redirects";

export function redirectToApp(request: Request) {
  return NextResponse.redirect(new URL(AUTH_PATHS.app, request.url), 303);
}

export function redirectToLogin(
  request: Request,
  error?: AuthErrorCode,
) {
  const url = new URL(AUTH_PATHS.login, request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url, 303);
}

export function redirectToSignup(
  request: Request,
  options?: { error?: AuthErrorCode; message?: AuthMessageCode },
) {
  const url = new URL(AUTH_PATHS.signup, request.url);
  if (options?.error) {
    url.searchParams.set("error", options.error);
  }
  if (options?.message) {
    url.searchParams.set("message", options.message);
  }
  return NextResponse.redirect(url, 303);
}
