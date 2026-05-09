import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuthClient, clearGuestCookie, getGuestCookie, isAdminEmail, setSessionCookies } from "@/lib/auth";
import { mergeGuestSessionIntoUser } from "@/lib/repository";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function metadataNickname(metadata: Record<string, unknown> | null | undefined) {
  const nickname = metadata?.nickname;
  return typeof nickname === "string" ? nickname.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = authSchema.parse(await request.json());
    const auth = createAuthClient();
    if (!auth) {
      return NextResponse.json({ ok: true, demo: true });
    }

    const { data, error } = await auth.auth.signInWithPassword(body);
    if (error || !data.session) {
      throw new Error(error?.message ?? "Login failed");
    }

    await setSessionCookies(data.session);
    const nickname = metadataNickname(data.user.user_metadata);
    await mergeGuestSessionIntoUser(
      {
        id: data.user.id,
        email: data.user.email ?? body.email,
        isAdmin: isAdminEmail(data.user.email ?? body.email),
        nickname,
      },
      await getGuestCookie(),
    );
    await clearGuestCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to login" },
      { status: 400 },
    );
  }
}
