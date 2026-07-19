import type { AnalyzeResult, TraceResult } from "../../types/api";
import type { AnalysisRepository } from "../analyzer/repository-analyzer";
import { requestTraceFromOpenAI } from "./openai-trace";
import { selectRelevantSourceContext } from "./source-context";
import { validateAndCanonicalizeTrace } from "./trace-result";

export type TraceModel = (
  question: string,
  analysis: AnalyzeResult,
  context: Awaited<ReturnType<typeof selectRelevantSourceContext>>,
) => Promise<TraceResult>;

export async function traceRepositoryFeature(
  question: string,
  analysis: AnalyzeResult,
  repository: AnalysisRepository,
  model: TraceModel = requestTraceFromOpenAI,
): Promise<TraceResult> {
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) throw new Error("Question must not be empty.");
  const context = await selectRelevantSourceContext(normalizedQuestion, analysis, repository);
  if (context.files.length === 0) {
    return { question: normalizedQuestion, steps: [], confidence: "low" };
  }
  const candidate = await model(normalizedQuestion, analysis, context);
  return validateAndCanonicalizeTrace(candidate, analysis, normalizedQuestion);
}
