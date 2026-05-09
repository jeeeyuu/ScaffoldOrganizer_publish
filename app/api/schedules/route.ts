import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createSchedule, deleteSchedule } from "@/lib/repository";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().default(""),
  scheduleDate: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    const schedule = await createSchedule(await getCurrentUser(), body);
    return NextResponse.json(schedule);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create schedule" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = deleteSchema.parse(await request.json());
    await deleteSchedule(await getCurrentUser(), body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete schedule" },
      { status: 400 },
    );
  }
}
