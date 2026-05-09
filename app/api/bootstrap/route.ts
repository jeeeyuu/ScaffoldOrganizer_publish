import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getBootstrapPayload } from "@/lib/repository";

export async function GET() {
  try {
    const payload = await getBootstrapPayload(await getCurrentUser());
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load bootstrap data" },
      { status: 500 },
    );
  }
}
