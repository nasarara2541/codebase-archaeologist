import { NextResponse } from "next/server";
import { analysisSessionManager } from "@/lib/analyzer/analysis-session-manager";
import { RemoteRepositoryError } from "@/lib/analyzer/github-source";
import { SourceAnalysisError } from "@/lib/analyzer/repository-analyzer";
import { RepositoryValidationError } from "@/lib/preview/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { repoUrl?: unknown };
    if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
      return NextResponse.json({ error: "repoUrl must be a non-empty string." }, { status: 400 });
    }
    const analysis = await analysisSessionManager.create(body.repoUrl);
    return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof SourceAnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof RepositoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RemoteRepositoryError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "RATE_LIMITED" ? 429 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { error: "The public repository could not be analyzed." },
      { status: 500 },
    );
  }
}
