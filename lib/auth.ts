import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";
import type { AuthUser } from "@/lib/types";

export const ACCESS_COOKIE = "so_access_token";
export const REFRESH_COOKIE = "so_refresh_token";

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.toLowerCase());
}

export function createAuthClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: "demo-user",
      email: "demo@local",
      isAdmin: true,
    };
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  const auth = createAuthClient();
  if (!auth) {
    return null;
  }

  const { data, error } = await auth.auth.getUser(accessToken);
  if (error || !data.user?.email) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    isAdmin: isAdminEmail(data.user.email),
  };
}

export async function setSessionCookies(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const cookieStore = await cookies();
  const maxAge = Math.max(60, session.expires_in);

  cookieStore.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  cookieStore.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}
