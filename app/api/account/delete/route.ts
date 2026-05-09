import { NextResponse } from "next/server";

import { clearSessionCookies, getCurrentUser } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/repository";

export async function POST() {
  try {
    await deleteUserAccount(await getCurrentUser());
    await clearSessionCookies();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete account" },
      { status: 400 },
    );
  }
}
