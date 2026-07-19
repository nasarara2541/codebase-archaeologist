"use client";

import { useEffect, useState } from "react";
import { PreviewSessionPanel } from "@/components/preview-session-panel";
import { ProjectSummary } from "@/components/project-summary";
import { RepositoryForm } from "@/components/repository-form";
import { BUNDLED_FIXTURE_REPO_URL } from "@/lib/preview/constants";
import { findTraceNodeId } from "@/lib/trace/highlighting";
import type {
  AnalyzeResult,
  CodeLocation,
  PreviewSession,
  TraceErrorCode,
  TraceResult,
} from "@/types/api";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(BUNDLED_FIXTURE_REPO_URL);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [isStartingPreview, setIsStartingPreview] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [traceErrorCode, setTraceErrorCode] = useState<TraceErrorCode | null>(null);

  useEffect(() => {
    if (!session || ["ready", "failed", "expired"].includes(session.status)) {
      if (session) setIsStartingPreview(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/preview/${encodeURIComponent(session.id)}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as PreviewSession | { error?: string };
        if (!response.ok || !("status" in body)) {
          throw new Error("error" in body ? body.error : "Could not read preview status.");
        }
        if (!cancelled) setSession(body);
      } catch (error) {
        if (!cancelled) {
          setSession((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  error: error instanceof Error ? error.message : "Preview polling failed.",
                }
              : current,
          );
          setIsStartingPreview(false);
        }
      }
    };
    void poll();
    const interval = window.setInterval(poll, 500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.id, session?.status]);

  useEffect(() => {
    const previewId = session?.id;
    if (!previewId || previewId === "failed") return;
    return () => {
      void fetch(`/api/preview/${encodeURIComponent(previewId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    };
  }, [session?.id]);

  useEffect(() => {
    const analysisId = analysis?.analysisId;
    if (!analysisId) return;
    return () => {
      void fetch(`/api/analyze/${encodeURIComponent(analysisId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    };
  }, [analysis?.analysisId]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAnalyzing(true);
    setAnalysis(null);
    setAnalysisError(null);
    setSession(null);
    setSelectedNodeId(null);
    setTrace(null);
    setTraceError(null);
    setTraceErrorCode(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const body = (await response.json()) as AnalyzeResult | { error?: string };
      if (!response.ok || !("graph" in body)) {
        throw new Error("error" in body ? body.error : "Repository analysis failed.");
      }
      setAnalysis(body);
      const firstRoute = body.graph.nodes.find((node) => node.type === "route");
      setSelectedNodeId(firstRoute?.id ?? body.graph.nodes[0]?.id ?? null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Repository analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleStartPreview(projectRoot: string) {
    if (!analysis) return;
    setSession(null);
    setIsStartingPreview(true);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.analysisId, projectRoot }),
      });
      const body = (await response.json()) as PreviewSession | { error?: string };
      if (!response.ok || !("status" in body)) {
        throw new Error("error" in body ? body.error : "Preview session could not be created.");
      }
      setSession(body);
    } catch (error) {
      setSession({
        id: "failed",
        repoUrl: analysis.repoUrl,
        status: "failed",
        error: error instanceof Error ? error.message : "Preview session could not be created.",
      });
      setIsStartingPreview(false);
    }
  }

  async function handleTrace(question: string) {
    if (!analysis) return;
    setIsTracing(true);
    setTrace(null);
    setTraceError(null);
    setTraceErrorCode(null);
    try {
      const response = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.analysisId, question }),
      });
      const body = (await response.json()) as
        | TraceResult
        | { error?: string; code?: TraceErrorCode };
      if (!response.ok || !("steps" in body)) {
        if ("code" in body && body.code) setTraceErrorCode(body.code);
        throw new Error("error" in body ? body.error : "Feature tracing failed.");
      }
      setTrace(body);
      const firstLocation = body.steps[0]?.location;
      if (firstLocation) setSelectedNodeId(findTraceNodeId(analysis.graph, firstLocation));
    } catch (error) {
      setTraceError(error instanceof Error ? error.message : "Feature tracing failed.");
    } finally {
      setIsTracing(false);
    }
  }

  function handleTraceLocation(location: CodeLocation) {
    if (!analysis) return;
    const nodeId = findTraceNodeId(analysis.graph, location);
    if (nodeId) setSelectedNodeId(nodeId);
  }

  function handleReset() {
    setAnalysis(null);
    setAnalysisError(null);
    setSession(null);
    setSelectedNodeId(null);
    setTrace(null);
    setTraceError(null);
    setTraceErrorCode(null);
    setIsStartingPreview(false);
    window.setTimeout(() => document.getElementById("repo-url")?.focus(), 0);
  }

  return (
    <main>
      <a className="skip-link" href="#repository-heading">Skip to repository analysis</a>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="RepoLens home"><span>RL</span>RepoLens</a>
        <p>Analyze first. Preview only when safe.</p>
      </nav>

      <header className="hero" id="top">
        <p className="eyebrow">Repository intelligence + optional live preview</p>
        <h1>Understand any repo. Run only the safe ones.</h1>
        <p className="hero__copy">
          Analyze a public GitHub repository without executing it. RepoLens detects projects,
          subdirectories, frameworks, imports, and architecture—then offers a live preview only
          when a verified isolated runner is available.
        </p>
      </header>

      <section className="how-it-works" aria-labelledby="how-it-works-heading">
        <div className="how-it-works__intro">
          <p className="section-label">Two independent modes</p>
          <h2 id="how-it-works-heading">Analysis is universal. Execution is optional.</h2>
        </div>
        <ol>
          <li><span>1</span><div><strong>Fetch read-only</strong><p>Read public metadata, manifests, and supported source files.</p></div></li>
          <li><span>2</span><div><strong>Map every project</strong><p>Detect frameworks, package managers, monorepos, and runnable roots.</p></div></li>
          <li><span>3</span><div><strong>Preview when verified</strong><p>Execution stays disabled unless a reviewed local runner can start it safely.</p></div></li>
        </ol>
      </section>

      <RepositoryForm
        repoUrl={repoUrl}
        isAnalyzing={isAnalyzing}
        verifiedDemo={repoUrl.trim().toLowerCase() === BUNDLED_FIXTURE_REPO_URL}
        onRepoUrlChange={setRepoUrl}
        onSubmit={handleAnalyze}
      />

      {analysis ? (
        <ProjectSummary
          project={analysis.project}
          isStartingPreview={isStartingPreview}
          onStartPreview={handleStartPreview}
        />
      ) : null}

      <PreviewSessionPanel
        session={session}
        isSubmitting={isStartingPreview}
        analysis={analysis}
        isAnalyzing={isAnalyzing}
        analysisError={analysisError}
        selectedNodeId={selectedNodeId}
        trace={trace}
        isTracing={isTracing}
        traceError={traceError}
        traceErrorCode={traceErrorCode}
        onAskTrace={handleTrace}
        onSelectTraceLocation={handleTraceLocation}
        onSelectNode={setSelectedNodeId}
        onReset={handleReset}
      />
    </main>
  );
}
