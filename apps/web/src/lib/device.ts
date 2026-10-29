import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/http";
import { newApiToken, newDeviceCode, newUserCode, sha256Hex } from "@/lib/api/tokens";

export const DEVICE_CODE_TTL_SECONDS = 15 * 60;
export const POLL_INTERVAL_SECONDS = 5;

export async function startDeviceAuthorization(clientName: string, clientVersion: string | null) {
  const db = createAdminClient();
  const { deviceCode, hash } = newDeviceCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString();

  // User codes are short, so retry on the rare collision with an active one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = newUserCode();
    const { error } = await db.from("device_codes").insert({
      device_code_hash: hash,
      user_code: userCode,
      client_name: clientName,
      client_version: clientVersion,
      expires_at: expiresAt,
    });
    if (!error) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      return {
        deviceCode,
        userCode,
        verificationUri: `${site}/device`,
        verificationUriComplete: `${site}/device?code=${userCode}`,
        expiresIn: DEVICE_CODE_TTL_SECONDS,
        interval: POLL_INTERVAL_SECONDS,
      };
    }
    if (error.code !== "23505") throw error;
    // Free codes that expired long ago so they can be reused.
    await db.from("device_codes").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString());
  }
  throw new ApiError(503, "try_again", "Could not allocate a login code; try again.");
}

/** RFC 8628-style polling: pending → slow_down → token, or a terminal error. */
export async function pollDeviceAuthorization(deviceCode: string) {
  const db = createAdminClient();
  const { data: row, error } = await db
    .from("device_codes")
    .select("id, client_name, expires_at, approved_by, denied_at, consumed_at, last_polled_at")
    .eq("device_code_hash", sha256Hex(deviceCode))
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new ApiError(400, "invalid_device_code", "Unknown login request. Run `coursmith login` again.");
  if (row.denied_at) throw new ApiError(400, "access_denied", "The login request was denied in the browser.");
  if (row.consumed_at || new Date(row.expires_at) < new Date()) {
    throw new ApiError(400, "expired_token", "The login request expired. Run `coursmith login` again.");
  }

  if (!row.approved_by) {
    const tooFast = row.last_polled_at && Date.now() - new Date(row.last_polled_at).getTime() < (POLL_INTERVAL_SECONDS - 1) * 1000;
    await db.from("device_codes").update({ last_polled_at: new Date().toISOString() }).eq("id", row.id);
    if (tooFast) throw new ApiError(400, "slow_down", "Polling too fast.", { interval: POLL_INTERVAL_SECONDS + 5 });
    throw new ApiError(400, "authorization_pending", "Waiting for approval in the browser.");
  }

  // Consume atomically so a token is issued at most once per approval.
  const { data: consumed, error: consumeError } = await db
    .from("device_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed) throw new ApiError(400, "expired_token", "This login request was already used.");

  const { token, hash, prefix } = newApiToken();
  const { error: tokenError } = await db.from("api_tokens").insert({
    user_id: row.approved_by,
    name: row.client_name,
    token_hash: hash,
    token_prefix: prefix,
  });
  if (tokenError) throw tokenError;

  const { data: profile } = await db.from("profiles").select("username, display_name").eq("id", row.approved_by).single();
  return {
    accessToken: token,
    tokenType: "Bearer",
    user: { username: profile?.username ?? "", displayName: profile?.display_name ?? "" },
  };
}

/** Looks up a pending request for the /device page. */
export async function findPendingDeviceCode(userCode: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("device_codes")
    .select("id, client_name, client_version, created_at, expires_at, approved_at, denied_at, consumed_at")
    .eq("user_code", userCode)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.consumed_at || data.denied_at || data.approved_at || new Date(data.expires_at) < new Date()) return null;
  return data;
}

export async function decideDeviceCode(userCode: string, userId: string, approve: boolean): Promise<boolean> {
  const db = createAdminClient();
  const patch = approve
    ? { approved_by: userId, approved_at: new Date().toISOString() }
    : { denied_at: new Date().toISOString() };
  const { data, error } = await db
    .from("device_codes")
    .update(patch)
    .eq("user_code", userCode)
    .is("approved_at", null)
    .is("denied_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw error;
  return data.length === 1;
}
