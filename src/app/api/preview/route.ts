import { NextResponse } from "next/server";
import { analysisSessionManager } from "@/lib/analyzer/analysis-session-manager";
import { previewSessionManager } from "@/lib/preview/session-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { analysisId?: unknown; projectRoot?: unknown };
    if (typeof body.analysisId !== "string" || !body.analysisId.trim()) {
      return NextResponse.json({ error: "analysisId must be a non-empty string." }, { status: 400 });
    }
    if (body.projectRoot !== undefined && typeof body.projectRoot !== "string") {
      return NextResponse.json({ error: "projectRoot must be a string." }, { status: 400 });
    }
    const repository = analysisSessionManager.resolvePreviewRepository(
      body.analysisId,
      typeof body.projectRoot === "string" ? body.projectRoot : undefined,
    );
    if (!repository) {
      return NextResponse.json(
        { error: "Analysis available; live preview unavailable for this repository or subproject." },
        { status: 409 },
      );
    }
    return NextResponse.json(previewSessionManager.create(repository), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "The preview session could not be created." },
      { status: 500 },
    );
  }
}
