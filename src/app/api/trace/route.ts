import { NextResponse } from "next/server";
import { analysisSessionManager } from "@/lib/analyzer/analysis-session-manager";
import { ModelConfigurationError, TraceModelError } from "@/lib/trace/openai-trace";
import { traceRepositoryFeature } from "@/lib/trace/trace-repository";
import { TraceValidationError } from "@/lib/trace/trace-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      analysisId?: unknown;
      sessionId?: unknown;
      question?: unknown;
    };
    const analysisId =
      typeof body.analysisId === "string"
        ? body.analysisId
        : typeof body.sessionId === "string"
          ? body.sessionId
          : "";
    if (!analysisId.trim()) {
      return NextResponse.json({ error: "analysisId must be a non-empty string." }, { status: 400 });
    }
    if (typeof body.question !== "string" || !body.question.trim()) {
      return NextResponse.json(
        { error: "Enter a question about the analyzed repository.", code: "EMPTY_QUESTION" },
        { status: 400 },
      );
    }
    if (body.question.length > 500) {
      return NextResponse.json({ error: "Questions are limited to 500 characters." }, { status: 400 });
    }

    const record = analysisSessionManager.get(analysisId);
    if (!record) return NextResponse.json({ error: "Analysis session not found." }, { status: 404 });
    const trace = await traceRepositoryFeature(body.question, record.result, record.repository);
    return NextResponse.json(trace, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof ModelConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: "MODEL_CONFIGURATION" },
        { status: 503 },
      );
    }
    if (error instanceof TraceValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    if (error instanceof TraceModelError) {
      return NextResponse.json({ error: error.message, code: "MODEL_ERROR" }, { status: 502 });
    }
    return NextResponse.json(
      { error: "The grounded feature trace could not be created.", code: "MODEL_ERROR" },
      { status: 500 },
    );
  }
}
