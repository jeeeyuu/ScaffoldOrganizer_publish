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

function friendlySignupError(message: string) {
  const normalized = message.toLowerCase();
  if (!message || message === "{}") {
    return "회원가입 요청이 실패했습니다. 인증 메일 발송 설정 또는 SMTP 연결 상태를 확인해주세요.";
  }
  if (normalized.includes("rate limit")) {
    return "인증 메일 발송 제한에 걸렸습니다. 잠시 후 다시 시도하거나, 이미 받은 인증 메일이 있는지 메일함/스팸함을 확인해주세요.";
  }
  if (normalized.includes("deadline") || normalized.includes("timed out") || normalized.includes("timeout")) {
    return "인증 메일 발송 시간이 초과되었습니다. SMTP host, port, 보안 방식, 계정/비밀번호 설정을 확인한 뒤 다시 시도해주세요.";
  }
  return message;
}

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
      throw new Error(friendlySignupError(error.message));
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
