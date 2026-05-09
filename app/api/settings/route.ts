import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { updateUserSettings } from "@/lib/repository";

const settingsSchema = z.object({
  nickname: z.string().default(""),
  worklogExportPath: z.string().default(""),
  customPrompt: z.string().default(""),
  calendarWeekStartsOn: z.enum(["monday", "sunday"]).default("monday"),
});

export async function POST(request: NextRequest) {
  try {
    const body = settingsSchema.parse(await request.json());
    const settings = await updateUserSettings(await getCurrentUser(), body);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 400 },
    );
  }
}
