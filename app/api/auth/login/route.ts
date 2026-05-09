import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAuthClient, setSessionCookies } from "@/lib/auth";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to login" },
      { status: 400 },
    );
  }
}
