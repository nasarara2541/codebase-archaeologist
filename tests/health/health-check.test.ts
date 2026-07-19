import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalysisSessionManager } from "../../src/lib/analyzer/analysis-session-manager";
import { getAllowedRepositories } from "../../src/lib/preview/repositories";
import { PreviewSessionManager } from "../../src/lib/preview/session-manager";
import { traceRepositoryFeature } from "../../src/lib/trace/trace-repository";
import type { AnalyzeResult, PreviewSession } from "../../src/types/api";

describe.sequential("RepoLens final health check", () => {
  const repository = getAllowedRepositories()[0];
  const analyses = new AnalysisSessionManager(60_000);
  const manager = new PreviewSessionManager({ autoStart: false, ttlMs: 60_000 });
  let session: PreviewSession;
  let analysis: AnalyzeResult;

  beforeAll(async () => {
    analysis = await analyses.create(repository.repoUrl);
    const previewRepository = analyses.resolvePreviewRepository(analysis.analysisId, ".")!;
    session = manager.create(previewRepository);
    await manager.start(session.id);
    session = manager.get(session.id)!;
  }, 30_000);

  afterAll(async () => {
    await manager.dispose();
    await analyses.dispose();
  });

  it("Preview works: starts the controlled fixture and serves HTML", async () => {
    expect(session.status, session.error).toBe("ready");
    expect(session.framework).toBe("vite");
    const response = await fetch(session.previewUrl!);
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("Northstar Console");
  });

  it("Analysis works: builds routes, components, services, files, and edges", async () => {
    expect(analysis.routes).toEqual(expect.arrayContaining(["/", "/settings"]));
    expect(analysis.project).toMatchObject({ projectType: "frontend", previewAvailable: true });
    expect(analysis.graph.nodes.some((node) => node.type === "component")).toBe(true);
    expect(analysis.graph.nodes.some((node) => node.type === "api")).toBe(true);
    expect(analysis.graph.edges.length).toBeGreaterThan(0);
  });

  it("Trace fallback works: unrelated questions skip the model safely", async () => {
    const trace = await traceRepositoryFeature(
      "Who composed the soundtrack?",
      analysis,
      repository,
      async () => {
        throw new Error("The fallback must not call the model.");
      },
    );
    expect(trace).toEqual({
      question: "Who composed the soundtrack?",
      steps: [],
      confidence: "low",
    });
  });

  it("Cleanup works: expires the session and stops serving the preview", async () => {
    const previewUrl = session.previewUrl!;
    await manager.expire(session.id);
    expect(manager.get(session.id)).toMatchObject({ status: "expired", previewUrl: undefined });

    let stopped = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fetch(previewUrl, { signal: AbortSignal.timeout(200) });
      } catch {
        stopped = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(stopped).toBe(true);
  });
}, 30_000);
