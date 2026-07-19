import type { AnalyzeResult, TraceResult } from "../../types/api";
import type { RelevantSourceContext } from "./source-context";
import { parseTraceResult } from "./trace-result";

const TRACE_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "steps", "confidence"],
  properties: {
    question: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["location", "explanation"],
        properties: {
          explanation: { type: "string" },
          location: {
            type: "object",
            additionalProperties: false,
            required: ["file", "lineStart", "lineEnd", "functionName"],
            properties: {
              file: { type: "string" },
              lineStart: { type: ["integer", "null"], minimum: 1 },
              lineEnd: { type: ["integer", "null"], minimum: 1 },
              functionName: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

export class ModelConfigurationError extends Error {
  constructor(message = "Feature tracing requires OPENAI_API_KEY configuration.") {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

export class TraceModelError extends Error {
  constructor(message = "The tracing model could not produce a result.") {
    super(message);
    this.name = "TraceModelError";
  }
}

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function responseText(payload: ResponsesPayload): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) {
        return content.text;
      }
    }
  }
  return null;
}

function repositoryIndex(analysis: AnalyzeResult, context: RelevantSourceContext): string {
  const relevant = new Set(context.nodeIds);
  return analysis.graph.nodes
    .filter((node) => relevant.has(node.id))
    .map((node) =>
      JSON.stringify({
        id: node.id,
        type: node.type,
        label: node.label,
        locations: node.locations,
      }),
    )
    .join("\n");
}

export async function requestTraceFromOpenAI(
  question: string,
  analysis: AnalyzeResult,
  context: RelevantSourceContext,
  options: { apiKey?: string; model?: string; fetcher?: typeof fetch } = {},
): Promise<TraceResult> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? process.env.OPENAI_TRACE_MODEL ?? "gpt-5.6-sol";
  if (!apiKey?.trim()) throw new ModelConfigurationError();
  if (!model.startsWith("gpt-5.6")) {
    throw new ModelConfigurationError("OPENAI_TRACE_MODEL must select a GPT-5.6 model.");
  }

  const sourceContext = context.files
    .map((file) => `FILE: ${file.path}\n\`\`\`\n${file.source}\n\`\`\``)
    .join("\n\n");
  const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      store: false,
      input: [
        {
          role: "developer",
          content:
            "Trace product behavior using only the supplied repository index and source excerpts. " +
            "Never invent a file, symbol, route, or source location. Return the shortest useful ordered flow. " +
            "If the evidence is insufficient, return an empty steps array with low confidence.",
        },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nREPOSITORY INDEX:\n${repositoryIndex(analysis, context)}\n\nSOURCE EXCERPTS:\n${sourceContext}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "trace_result",
          strict: true,
          schema: TRACE_RESULT_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = (await response.json().catch(() => ({}))) as ResponsesPayload;
  if (!response.ok) {
    throw new TraceModelError(payload.error?.message || `Tracing model returned HTTP ${response.status}.`);
  }
  const output = responseText(payload);
  if (!output) throw new TraceModelError("The tracing model returned no structured result.");
  return parseTraceResult(output);
}
