import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { listSessions, saveSession } from "@/lib/repository";

const saveSessionSchema = z.object({
  title: z.string().min(1),
  rawText: z.string(),
  structuredText: z.string(),
});

export async function GET() {
  try {
    const sessions = await listSessions(await getCurrentUser());
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load sessions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = saveSessionSchema.parse(await request.json());
    const session = await saveSession(await getCurrentUser(), body);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save session" },
      { status: 400 },
    );
  }
}
