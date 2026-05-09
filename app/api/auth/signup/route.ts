import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuthClient, clearAuthCookies, clearGuestCookie, getGuestCookie, isAdminEmail, setSessionCookies } from "@/lib/auth";
import { getAuthConfirmedUrl } from "@/lib/env";
import { mergeGuestSessionIntoUser } from "@/lib/repository";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().trim().max(80).optional().default(""),
});

export async function POST(request: NextRequest) {
  try {
    const body = authSchema.parse(await request.json());
    const auth = createAuthClient();
    if (!auth) {
      return NextResponse.json({ ok: true, demo: true });
    }

    const { data, error } = await auth.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        emailRedirectTo: getAuthConfirmedUrl(),
        data: {
          nickname: body.nickname,
        },
      },
    });
    if (error) {
      throw new Error(error.message);
    }

    if (data.session && data.user?.id) {
      await setSessionCookies(data.session);
      await mergeGuestSessionIntoUser(
        {
          id: data.user.id,
          email: data.user?.email ?? body.email,
          isAdmin: isAdminEmail(data.user?.email ?? body.email),
          nickname: body.nickname,
        },
        await getGuestCookie(),
      );
      await clearGuestCookie();
    }
    return NextResponse.json({ ok: true, needsConfirmation: !data.session });
  } catch (error) {
    await clearAuthCookies();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign up" },
      { status: 400 },
    );
  }
}
