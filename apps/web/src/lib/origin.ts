import type { NextRequest } from "next/server";

/**
 * The public origin for redirects. Behind a proxy (Render, Docker) `request.nextUrl.origin` is the
 * internal address (e.g. localhost:10000), so prefer the configured site URL, then forwarded headers.
 */
export function publicOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}
