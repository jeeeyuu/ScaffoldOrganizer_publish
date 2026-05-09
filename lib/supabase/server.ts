import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";

export function createServerSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  return createClient(url, serviceRoleKey || anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
