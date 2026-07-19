import type { AnalyzeResult, CodeLocation, TraceResult, TraceStep } from "../../types/api";

export class TraceValidationError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_MODEL_OUTPUT" | "INVALID_CITATION",
  ) {
    super(message);
    this.name = "TraceValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new TraceValidationError(
      `${label} contains unsupported fields: ${extras.join(", ")}.`,
      "INVALID_MODEL_OUTPUT",
    );
  }
}

function parseLocation(value: unknown): CodeLocation {
  if (!isPlainObject(value) || typeof value.file !== "string" || !value.file.trim()) {
    throw new TraceValidationError("Every trace step must cite a file.", "INVALID_MODEL_OUTPUT");
  }
  requireExactKeys(value, ["file", "lineStart", "lineEnd", "functionName"], "Trace location");

  const optionalPositiveInteger = (field: string) => {
    const candidate = value[field];
    if (candidate === undefined || candidate === null) return undefined;
    if (!Number.isInteger(candidate) || Number(candidate) < 1) {
      throw new TraceValidationError(`${field} must be a positive integer.`, "INVALID_MODEL_OUTPUT");
    }
    return Number(candidate);
  };
  const lineStart = optionalPositiveInteger("lineStart");
  const lineEnd = optionalPositiveInteger("lineEnd");
  if (lineStart && lineEnd && lineEnd < lineStart) {
    throw new TraceValidationError("lineEnd cannot precede lineStart.", "INVALID_MODEL_OUTPUT");
  }
  if (
    value.functionName !== undefined &&
    value.functionName !== null &&
    typeof value.functionName !== "string"
  ) {
    throw new TraceValidationError("functionName must be a string.", "INVALID_MODEL_OUTPUT");
  }

  return {
    file: value.file.trim(),
    ...(lineStart ? { lineStart } : {}),
    ...(lineEnd ? { lineEnd } : {}),
    ...(typeof value.functionName === "string" && value.functionName.trim()
      ? { functionName: value.functionName.trim() }
      : {}),
  };
}

export function parseTraceResult(raw: string | unknown): TraceResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new TraceValidationError("The model did not return valid JSON.", "INVALID_MODEL_OUTPUT");
    }
  }
  if (!isPlainObject(value)) {
    throw new TraceValidationError("The model response must be a JSON object.", "INVALID_MODEL_OUTPUT");
  }
  requireExactKeys(value, ["question", "steps", "confidence"], "TraceResult");
  if (typeof value.question !== "string" || !value.question.trim()) {
    throw new TraceValidationError("TraceResult.question is required.", "INVALID_MODEL_OUTPUT");
  }
  if (!Array.isArray(value.steps)) {
    throw new TraceValidationError("TraceResult.steps must be an array.", "INVALID_MODEL_OUTPUT");
  }
  if (!(["high", "medium", "low"] as unknown[]).includes(value.confidence)) {
    throw new TraceValidationError("TraceResult.confidence is invalid.", "INVALID_MODEL_OUTPUT");
  }

  const steps: TraceStep[] = value.steps.map((candidate) => {
    if (!isPlainObject(candidate) || typeof candidate.explanation !== "string" || !candidate.explanation.trim()) {
      throw new TraceValidationError(
        "Every trace step needs a non-empty explanation.",
        "INVALID_MODEL_OUTPUT",
      );
    }
    requireExactKeys(candidate, ["location", "explanation"], "Trace step");
    return { location: parseLocation(candidate.location), explanation: candidate.explanation.trim() };
  });

  return {
    question: value.question.trim(),
    steps,
    confidence: value.confidence as TraceResult["confidence"],
  };
}

export function validateAndCanonicalizeTrace(
  trace: TraceResult,
  analysis: AnalyzeResult,
  expectedQuestion = trace.question,
): TraceResult {
  const knownFiles = new Set(analysis.files.map((file) => file.path));
  const locations = analysis.graph.nodes.flatMap((node) => node.locations);

  const steps = trace.steps.map((step) => {
    const citation = step.location;
    if (!knownFiles.has(citation.file)) {
      throw new TraceValidationError(
        `The model cited an unknown file: ${citation.file}.`,
        "INVALID_CITATION",
      );
    }

    if (citation.functionName) {
      const canonical = locations.find(
        (location) =>
          location.file === citation.file && location.functionName === citation.functionName,
      );
      if (!canonical) {
        throw new TraceValidationError(
          `The model cited an unknown symbol: ${citation.functionName} in ${citation.file}.`,
          "INVALID_CITATION",
        );
      }
      return { ...step, location: { ...canonical } };
    }

    const fileLocation = locations.find((location) => location.file === citation.file);
    return {
      ...step,
      location: fileLocation
        ? { file: citation.file, lineStart: fileLocation.lineStart, lineEnd: fileLocation.lineEnd }
        : { file: citation.file, lineStart: 1 },
    };
  });

  return { ...trace, question: expectedQuestion, steps };
}
