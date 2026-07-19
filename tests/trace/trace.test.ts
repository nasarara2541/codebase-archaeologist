import { describe, expect, it } from "vitest";
import { analyzeRepository } from "../../src/lib/analyzer/repository-analyzer";
import { getAllowedRepositories } from "../../src/lib/preview/repositories";
import { calculateTraceHighlight } from "../../src/lib/trace/highlighting";
import { ModelConfigurationError, requestTraceFromOpenAI } from "../../src/lib/trace/openai-trace";
import {
  rankRelevantNodes,
  selectRelevantSourceContext,
} from "../../src/lib/trace/source-context";
import { traceRepositoryFeature } from "../../src/lib/trace/trace-repository";
import {
  parseTraceResult,
  TraceValidationError,
  validateAndCanonicalizeTrace,
} from "../../src/lib/trace/trace-result";
import type { TraceResult } from "../../src/types/api";

const validTrace: TraceResult = {
  question: "How does the settings page work?",
  confidence: "high",
  steps: [
    {
      location: {
        file: "src/pages/SettingsPage.tsx",
        functionName: "SettingsPage",
        lineStart: 1,
      },
      explanation: "The settings route renders the preferences controls.",
    },
    {
      location: {
        file: "src/services/preferences.ts",
        functionName: "savePreferences",
        lineStart: 1,
      },
      explanation: "Saving writes the selected preferences to local storage.",
    },
  ],
};

async function fixtureAnalysis() {
  const repository = getAllowedRepositories()[0];
  return { repository, analysis: await analyzeRepository(repository, "trace-test") };
}

describe("TraceResult parsing and grounding", () => {
  it("parses valid strict TraceResult JSON", () => {
    expect(parseTraceResult(JSON.stringify(validTrace))).toEqual(validTrace);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseTraceResult("not-json")).toThrowError(TraceValidationError);
  });

  it("rejects nonexistent file citations", async () => {
    const { analysis } = await fixtureAnalysis();
    const trace = {
      ...validTrace,
      steps: [{ ...validTrace.steps[0], location: { file: "src/invented.ts", lineStart: 1 } }],
    };
    expect(() => validateAndCanonicalizeTrace(trace, analysis)).toThrowError(/unknown file/i);
  });

  it("rejects nonexistent symbol citations", async () => {
    const { analysis } = await fixtureAnalysis();
    const trace = {
      ...validTrace,
      steps: [
        {
          ...validTrace.steps[0],
          location: {
            file: "src/pages/SettingsPage.tsx",
            functionName: "ImaginarySettings",
          },
        },
      ],
    };
    expect(() => validateAndCanonicalizeTrace(trace, analysis)).toThrowError(/unknown symbol/i);
  });

  it("canonicalizes real symbol line locations", async () => {
    const { analysis } = await fixtureAnalysis();
    const grounded = validateAndCanonicalizeTrace(validTrace, analysis);
    const settingsNode = analysis.graph.nodes.find((node) => node.label === "SettingsPage")!;
    expect(grounded.steps[0].location).toEqual(settingsNode.locations[0]);
  });
});

describe("Feature trace behavior", () => {
  it.each([
    ["How does the settings page work?", "SettingsPage"],
    ["Where does deployment begin?", "createDeployment"],
    ["Which files are involved when the theme is changed?", "Toggle"],
  ])("selects grounded context for %s", async (question, expectedLabel) => {
    const { analysis } = await fixtureAnalysis();
    expect(rankRelevantNodes(question, analysis).map((node) => node.label)).toContain(expectedLabel);
  });

  it("highlights traced nodes and connecting graph edges", async () => {
    const { analysis } = await fixtureAnalysis();
    const grounded = validateAndCanonicalizeTrace(validTrace, analysis);
    const highlight = calculateTraceHighlight(analysis.graph, grounded);
    expect([...highlight.nodeIds]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SettingsPage"),
        expect.stringContaining("savePreferences"),
        "file:src/pages/SettingsPage.tsx",
        "file:src/services/preferences.ts",
      ]),
    );
    expect(highlight.edgeKeys.size).toBeGreaterThan(0);
  });

  it("creates an ordered grounded trace from a bounded relevant context", async () => {
    const { repository, analysis } = await fixtureAnalysis();
    let selectedFileCount = 0;
    const result = await traceRepositoryFeature(
      validTrace.question,
      analysis,
      repository,
      async (_question, _analysis, context) => {
        selectedFileCount = context.files.length;
        return validTrace;
      },
    );
    expect(result.steps.map((step) => step.location.functionName)).toEqual([
      "SettingsPage",
      "savePreferences",
    ]);
    expect(selectedFileCount).toBeGreaterThan(0);
    expect(selectedFileCount).toBeLessThan(analysis.files.length);
  });

  it("caps selected source context instead of sending the repository wholesale", async () => {
    const { repository, analysis } = await fixtureAnalysis();
    const context = await selectRelevantSourceContext(
      "How does the settings page save preferences?",
      analysis,
      repository,
    );
    expect(context.files.length).toBeLessThanOrEqual(7);
    expect(context.files.reduce((sum, file) => sum + file.source.length, 0)).toBeLessThanOrEqual(
      24_000,
    );
  });

  it("rejects empty questions before reading source or calling a model", async () => {
    const { repository, analysis } = await fixtureAnalysis();
    await expect(traceRepositoryFeature("   ", analysis, repository)).rejects.toThrow(
      /must not be empty/i,
    );
  });

  it("reports missing model configuration without making a request", async () => {
    const { analysis } = await fixtureAnalysis();
    await expect(
      requestTraceFromOpenAI(
        "How does settings work?",
        analysis,
        { nodeIds: [], files: [] },
        { apiKey: "", model: "gpt-5.6-sol" },
      ),
    ).rejects.toBeInstanceOf(ModelConfigurationError);
  });

  it("returns a grounded fallback without calling the model for unrelated questions", async () => {
    const { repository, analysis } = await fixtureAnalysis();
    let called = false;
    const result = await traceRepositoryFeature(
      "Who composed the soundtrack?",
      analysis,
      repository,
      async () => {
        called = true;
        return validTrace;
      },
    );
    expect(result).toEqual({
      question: "Who composed the soundtrack?",
      steps: [],
      confidence: "low",
    });
    expect(called).toBe(false);
  });
});
