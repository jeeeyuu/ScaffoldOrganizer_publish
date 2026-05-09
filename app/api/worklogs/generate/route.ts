import { NextResponse } from "next/server";

import { generateWorklogDraft } from "@/lib/repository";

export async function POST() {
  try {
    const draft = await generateWorklogDraft();
    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate worklog draft" },
      { status: 500 },
    );
  }
}
