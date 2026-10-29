import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "./http";
import { compareVersions, sha256Hex, TOKEN_PREFIX } from "./tokens";

export const CLIENT_HEADER = "x-coursmith-client";

export interface CliCaller {
  userId: string;
  tokenId: string;
  username: string;
  displayName: string;
  clientVersion: string | null;
}

/** Parses `X-Coursmith-Client: coursmith-cli/1.2.3` and rejects versions older than MIN_CLI_VERSION. */
export function checkClient(request: Request): string | null {
  const header = request.headers.get(CLIENT_HEADER);
  const version = header?.match(/^coursmith-cli\/(\d+\.\d+\.\d+(?:-[\w.]+)?)$/)?.[1] ?? null;
  if (!version) {
    throw new ApiError(400, "unknown_client", "Requests must come from the official Coursmith CLI (npx coursmith).");
  }
  const min = process.env.MIN_CLI_VERSION ?? "0.0.0";
  if (compareVersions(version, min) < 0) {
    throw new ApiError(426, "client_outdated", `Coursmith CLI ${version} is too old; update to ${min} or later.`, {
      minVersion: min,
    });
  }
  return version;
}

/** Authenticates a CLI request by its bearer token. */
export async function authenticateCli(request: Request): Promise<CliCaller> {
  const clientVersion = checkClient(request);
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token?.startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, "unauthorized", "Missing or malformed token. Run `coursmith login`.");
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("api_tokens")
    .select("id, user_id, expires_at, revoked_at, last_used_at")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at) < new Date())) {
    throw new ApiError(401, "unauthorized", "This token is invalid, expired or revoked. Run `coursmith login`.");
  }

  // Avoid a write on every request.
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("username, display_name")
    .eq("id", data.user_id)
    .maybeSingle();
  return {
    userId: data.user_id,
    tokenId: data.id,
    username: profile?.username ?? "",
    displayName: profile?.display_name ?? "",
    clientVersion,
  };
}
