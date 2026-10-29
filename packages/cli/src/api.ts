import { readFileSync } from "node:fs";

export const CLI_VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(
  apiUrl: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "x-coursmith-client": `coursmith-cli/${CLI_VERSION}`,
    accept: "application/json",
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (err) {
    throw new ApiError(0, "network_error", `Cannot reach ${apiUrl}: ${(err as Error).message}`, {});
  }

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error page.
  }
  if (!res.ok) {
    const code = typeof body.error === "string" ? body.error : `http_${res.status}`;
    const message = typeof body.message === "string" ? body.message : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}

/** Uploads raw bytes to a Supabase Storage signed upload URL. */
export async function uploadToSignedUrl(url: string, data: Uint8Array, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "true", "cache-control": "max-age=3600" },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
}
