import { NextResponse } from "next/server";
import { analysisSessionManager } from "@/lib/analyzer/analysis-session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = analysisSessionManager.getResult(id);
  if (!result) return NextResponse.json({ error: "Analysis session not found." }, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = await analysisSessionManager.delete(id);
  return NextResponse.json({ id, deleted });
}
