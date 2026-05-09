import { NextResponse } from "next/server";

import { getStatusSnapshot } from "@/lib/repository";

export async function GET() {
  try {
    const status = await getStatusSnapshot();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load status" },
      { status: 500 },
    );
  }
}
