import { NextRequest, NextResponse } from "next/server";

import { setGuestCookie } from "@/lib/auth";
import { createGuestSession } from "@/lib/repository";

export async function POST(request: NextRequest) {
  try {
    const sessionId = await createGuestSession();
    await setGuestCookie(sessionId);
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start guest mode" },
      { status: 400 },
    );
  }
}
