import { NextResponse } from "next/server";
import { previewSessionManager } from "@/lib/preview/session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = previewSessionManager.get(id);

  if (!session) {
    return NextResponse.json({ error: "Preview session not found." }, { status: 404 });
  }

  return NextResponse.json(session, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = previewSessionManager.get(id);

  if (!session) {
    return NextResponse.json({ error: "Preview session not found." }, { status: 404 });
  }

  await previewSessionManager.expire(id);
  return NextResponse.json(previewSessionManager.get(id));
}
