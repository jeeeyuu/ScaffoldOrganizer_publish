import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { ACCESS_COOKIE } from "@/lib/auth";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";

export async function createServerSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}
