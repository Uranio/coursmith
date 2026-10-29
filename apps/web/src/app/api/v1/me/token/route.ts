import { authenticateCli } from "@/lib/api/auth";
import { handle, json } from "@/lib/api/http";
import { createAdminClient } from "@/lib/supabase/admin";

/** `coursmith logout`: revokes the token used for this request. */
export const DELETE = handle(async (request: Request) => {
  const caller = await authenticateCli(request);
  const { error } = await createAdminClient()
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", caller.tokenId);
  if (error) throw error;
  return json({ revoked: true });
});
