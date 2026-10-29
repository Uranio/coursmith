import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

/** An error with an HTTP status and a stable machine-readable code, returned to the CLI as JSON. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a route handler so thrown ApiErrors become JSON responses and anything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Next.js signals (prerender interruption, redirect, notFound) must propagate.
      unstable_rethrow(err);
      if (err instanceof ApiError) {
        return json({ error: err.code, message: err.message, ...err.details }, err.status);
      }
      console.error(err);
      return json({ error: "internal_error", message: "Something went wrong on our side." }, 500);
    }
  };
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", `The request body exceeds ${maxBytes} bytes.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
}
