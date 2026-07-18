export const AUTH_PATHS = {
  home: "/",
  login: "/login",
  signup: "/signup",
  app: "/app",
} as const;

export type AuthPath = (typeof AUTH_PATHS)[keyof typeof AUTH_PATHS];

export function isAuthPagePath(pathname: string): boolean {
  return pathname === AUTH_PATHS.login || pathname === AUTH_PATHS.signup;
}

export function isProtectedPath(pathname: string): boolean {
  return pathname === AUTH_PATHS.app || pathname.startsWith(`${AUTH_PATHS.app}/`);
}

export function isAuthApiPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/**
 * Optimistic navigation policy for signed-in vs signed-out users.
 * Returns null when the current path should render as-is.
 */
export function resolveAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  if (isAuthApiPath(pathname)) {
    return null;
  }

  if (isAuthenticated) {
    if (pathname === AUTH_PATHS.home || isAuthPagePath(pathname)) {
      return AUTH_PATHS.app;
    }
    return null;
  }

  if (pathname === AUTH_PATHS.home || isProtectedPath(pathname)) {
    return AUTH_PATHS.login;
  }

  return null;
}
