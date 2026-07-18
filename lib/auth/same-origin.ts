/**
 * Fail-closed same-origin check for cookie-authenticated form POSTs.
 * Prefer Origin; fall back to Referer when Origin is absent (some browsers).
 */
export function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer === null || referer.trim() === "") {
    return false;
  }

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}
