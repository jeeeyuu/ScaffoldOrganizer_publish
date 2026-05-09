import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listWorklogs, saveWorklog } from "@/lib/repository";

const saveWorklogSchema = z.object({
  logDate: z.string().min(1),
  title: z.string().min(1),
  contentMd: z.string().min(1),
  contextSummary: z.record(z.string(), z.unknown()),
});

export async function GET() {
  try {
    const worklogs = await listWorklogs();
    return NextResponse.json(worklogs);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load worklogs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = saveWorklogSchema.parse(await request.json());
    const worklog = await saveWorklog(body);
    return NextResponse.json(worklog);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save worklog" },
      { status: 400 },
    );
  }
}
