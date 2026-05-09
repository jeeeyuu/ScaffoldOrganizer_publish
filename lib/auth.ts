import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";
import type { AuthUser } from "@/lib/types";

export const ACCESS_COOKIE = "so_access_token";
export const REFRESH_COOKIE = "so_refresh_token";
export const GUEST_COOKIE = "so_guest_session_id";
export const GUEST_SESSION_HOURS = 36;

export function isDevPreviewEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_PREVIEW_AUTH_BYPASS !== "false";
}

function devPreviewUser(): AuthUser {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    email: "dev-preview@local",
    isAdmin: true,
    isPreview: true,
  };
}

function guestUser(id: string): AuthUser {
  return {
    id,
    email: "guest@local",
    isAdmin: false,
    isGuest: true,
  };
}

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

function metadataNickname(metadata: Record<string, unknown> | null | undefined) {
  const nickname = metadata?.nickname;
  return typeof nickname === "string" ? nickname.trim() : "";
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: "demo-user",
      email: "demo@local",
      isAdmin: true,
      isPreview: process.env.NODE_ENV === "development",
    };
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const guestSessionId = cookieStore.get(GUEST_COOKIE)?.value;
  if (!accessToken && guestSessionId) {
    return guestUser(guestSessionId);
  }

  if (!accessToken) {
    return isDevPreviewEnabled() ? devPreviewUser() : null;
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
    nickname: metadataNickname(data.user.user_metadata),
  };
}

export async function setGuestCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_HOURS * 60 * 60,
  });
}

export async function getGuestCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_COOKIE)?.value ?? null;
}

export async function clearGuestCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE);
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
  cookieStore.delete(GUEST_COOKIE);
}
