import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisSessionManager } from "../../src/lib/analyzer/analysis-session-manager";
import { fetchPublicGitHubRepository } from "../../src/lib/analyzer/github-source";
import { detectRepositoryProject } from "../../src/lib/analyzer/project-detector";
import { BUNDLED_FIXTURE_REPO_URL } from "../../src/lib/preview/constants";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createMonorepo() {
  const root = await mkdtemp(path.join(tmpdir(), "repolens-monorepo-test-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "apps", "web"), { recursive: true });
  await mkdir(path.join(root, "packages", "ui"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "workspace", private: true, workspaces: ["apps/*", "packages/*"] }),
  );
  await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
  await writeFile(
    path.join(root, "apps", "web", "package.json"),
    JSON.stringify({
      name: "web",
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { react: "latest", vite: "latest" },
    }),
  );
  await writeFile(
    path.join(root, "packages", "ui", "package.json"),
    JSON.stringify({ name: "ui", dependencies: { react: "latest" } }),
  );
  return root;
}

describe("generic project detection", () => {
  it("detects monorepos, package managers, frameworks, and runnable roots", async () => {
    const sourcePath = await createMonorepo();
    const project = await detectRepositoryProject(
      { repoUrl: "https://github.com/example/monorepo", sourcePath },
      { verifiedLocal: false, defaultBranch: "main" },
    );

    expect(project).toMatchObject({
      projectType: "monorepo",
      monorepo: true,
      previewAvailable: false,
      source: "github-readonly",
      defaultBranch: "main",
    });
    expect(project.frameworks).toEqual(expect.arrayContaining(["vite", "react"]));
    expect(project.packageManagers).toContain("pnpm");
    expect(project.subprojects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ root: "apps/web", framework: "vite", runnable: true }),
        expect.objectContaining({ root: "packages/ui", framework: "react", runnable: false }),
      ]),
    );
    expect(project.previewReason).toMatch(/analysis available; live preview unavailable/i);
  });

  it("offers preview only for a runnable verified local candidate", async () => {
    const manager = new AnalysisSessionManager(60_000);
    const result = await manager.create(BUNDLED_FIXTURE_REPO_URL);
    expect(result.project.previewAvailable).toBe(true);
    expect(result.project.previewCandidates[0]).toMatchObject({ root: ".", framework: "vite" });
    expect(manager.resolvePreviewRepository(result.analysisId, ".")?.sourcePath).toContain(
      "fixtures/sample-repo",
    );
    await manager.dispose();
  });
});

describe("read-only GitHub source acquisition", () => {
  it("fetches metadata, a complete tree, manifests, and supported source without execution", async () => {
    const packageSource = JSON.stringify({
      name: "remote-app",
      scripts: { dev: "vite" },
      dependencies: { react: "latest", vite: "latest" },
    });
    const appSource = "export function App() { return <main>Remote</main>; }";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/example/remote")) {
        return Response.json({ private: false, default_branch: "main", description: "Remote" });
      }
      if (url.includes("/branches/main")) return Response.json({ commit: { sha: "abc123" } });
      if (url.includes("/git/trees/abc123")) {
        return Response.json({
          truncated: false,
          tree: [
            { path: "package.json", mode: "100644", type: "blob", size: packageSource.length },
            { path: "src/App.tsx", mode: "100644", type: "blob", size: appSource.length },
            { path: "image.png", mode: "100644", type: "blob", size: 50 },
          ],
        });
      }
      if (url.endsWith("/package.json")) return new Response(packageSource);
      if (url.endsWith("/src/App.tsx")) return new Response(appSource);
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const fetched = await fetchPublicGitHubRepository(
      "https://github.com/example/remote",
      fetcher,
    );
    temporaryRoots.push(fetched.repository.sourcePath);
    expect(fetched.defaultBranch).toBe("main");
    expect(await readFile(path.join(fetched.repository.sourcePath, "src", "App.tsx"), "utf8")).toBe(
      appSource,
    );
    expect(await stat(path.join(fetched.repository.sourcePath, "image.png")).catch(() => null)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(5);
    await fetched.cleanup();
  });
});
