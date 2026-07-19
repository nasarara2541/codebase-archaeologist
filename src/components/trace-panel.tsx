"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import type { CodeLocation, TraceErrorCode, TraceResult } from "@/types/api";

type TracePanelProps = {
  disabled: boolean;
  isLoading: boolean;
  error: string | null;
  errorCode: TraceErrorCode | null;
  trace: TraceResult | null;
  onAsk: (question: string) => Promise<void>;
  onSelectLocation: (location: CodeLocation) => void;
};

const suggestions = [
  "How does the settings page work?",
  "Where does deployment begin?",
  "Which files handle preference changes?",
];

function formatTrace(trace: TraceResult): string {
  const steps = trace.steps.map(
    (step, index) =>
      `${index + 1}. ${step.location.functionName ?? step.location.file} — ${step.location.file}${step.location.lineStart ? `:${step.location.lineStart}` : ""}\n${step.explanation}`,
  );
  return `${trace.question}\nConfidence: ${trace.confidence}\n\n${steps.join("\n\n")}`;
}

export function TracePanel({
  disabled,
  isLoading,
  error,
  errorCode,
  trace,
  onAsk,
  onSelectLocation,
}: TracePanelProps) {
  const [question, setQuestion] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || disabled || isLoading) return;
    await onAsk(question);
  }

  return (
    <aside className="trace-panel" aria-label="Ask about this feature">
      <div className="trace-panel__heading">
        <div className="panel-heading-with-step">
          <span className="step-number">04</span>
          <div>
            <p className="section-label">Grounded trace</p>
            <h3>Ask how a feature works</h3>
          </div>
        </div>
        <p>Answers cite only verified files and symbols in this repository.</p>
      </div>

      <form className="trace-form" onSubmit={submit}>
        <label htmlFor="trace-question">Feature question</label>
        <textarea
          id="trace-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How does the settings page work?"
          rows={3}
          maxLength={500}
          disabled={disabled || isLoading}
        />
        <button type="submit" disabled={disabled || isLoading || !question.trim()}>
          {isLoading ? "Tracing…" : "Trace feature"}
        </button>
      </form>

      {!trace && !error && !isLoading ? (
        <div className="trace-suggestions">
          <small>Try an example</small>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="trace-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <strong>Following the code path</strong>
          <small>Reviewing only the most relevant verified source…</small>
        </div>
      ) : error ? (
        <div className="trace-state trace-state--error" role="alert">
          <strong>
            {errorCode === "INVALID_CITATION"
              ? "An unverified citation was blocked"
              : errorCode === "MODEL_CONFIGURATION"
                ? "Tracing is not configured"
                : "Trace unavailable"}
          </strong>
          <small>{error}</small>
        </div>
      ) : trace?.steps.length === 0 ? (
        <div className="trace-state">
          <strong>No grounded code path found</strong>
          <small>Try naming a route, component, action, or visible feature from the preview.</small>
        </div>
      ) : trace ? (
        <section className="trace-result" aria-label="Feature flow">
          <div className="trace-result__summary">
            <div>
              <strong>Feature flow</strong>
              <span className={`confidence confidence--${trace.confidence}`}>
                {trace.confidence} confidence
              </span>
            </div>
            <CopyButton value={formatTrace(trace)} label="Trace result" />
          </div>
          <p>{trace.question}</p>
          <ol>
            {trace.steps.map((step, index) => (
              <li key={`${step.location.file}:${step.location.functionName ?? "file"}:${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectLocation(step.location)}
                  aria-label={`View trace step ${index + 1}: ${step.location.functionName ?? step.location.file}`}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.location.functionName ?? step.location.file}</strong>
                    <small>
                      {step.location.file}
                      {step.location.lineStart ? `:${step.location.lineStart}` : ""}
                    </small>
                    <p>{step.explanation}</p>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}
