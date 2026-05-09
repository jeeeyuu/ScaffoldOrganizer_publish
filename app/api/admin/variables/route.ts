import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { upsertAdminVariable } from "@/lib/repository";

const variableSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  value: z.string().default(""),
  description: z.string().default(""),
});

export async function POST(request: NextRequest) {
  try {
    const body = variableSchema.parse(await request.json());
    const variable = await upsertAdminVariable(await getCurrentUser(), body);
    return NextResponse.json(variable);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save admin variable" },
      { status: 400 },
    );
  }
}
