import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Anonymous client for public catalog reads: no cookies, so results can be cached. RLS applies. */
export function createPublicClient() {
  return createClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
