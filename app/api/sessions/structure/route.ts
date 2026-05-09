import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { structureSession } from "@/lib/repository";

const structureSchema = z.object({
  title: z.string().min(1),
  rawText: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = structureSchema.parse(await request.json());
    const result = await structureSession(await getCurrentUser(), body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to structure session" },
      { status: 400 },
    );
  }
}
