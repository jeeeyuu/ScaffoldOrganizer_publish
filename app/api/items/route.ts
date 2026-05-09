import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createItem, deleteItem, listItems, updateItem } from "@/lib/repository";

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(""),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  status: z.enum(["inbox", "todo", "doing", "done", "archived"]).optional(),
  horizon: z.enum(["now", "soon", "later", "long_term"]).optional(),
  completedAt: z.string().nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  try {
    const items = await listItems();
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load items" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    const item = await createItem(body);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create item" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = updateSchema.parse(await request.json());
    const item = await updateItem(body.id, body);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = deleteSchema.parse(await request.json());
    await deleteItem(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete item" },
      { status: 400 },
    );
  }
}
