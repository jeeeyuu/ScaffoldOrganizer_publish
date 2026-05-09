import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { runCommand } from "@/lib/repository";

const commandSchema = z.object({
  text: z.string().min(1),
  selectedItemIds: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const body = commandSchema.parse(await request.json());
    const result = await runCommand(await getCurrentUser(), body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process command" },
      { status: 400 },
    );
  }
}
