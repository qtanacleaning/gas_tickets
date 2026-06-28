import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getAppEnv } from "@/lib/env";

export function createAdminClient() {
  const env = getAppEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
