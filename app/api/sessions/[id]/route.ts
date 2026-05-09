import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getSessionById } from "@/lib/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getSessionById(await getCurrentUser(), id);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session" },
      { status: 404 },
    );
  }
}
