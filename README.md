# RepoLens

RepoLens is a repository-understanding layer with an optional live preview. It can analyze any public GitHub repository without executing it, then places a live frontend beside its architecture only when the source is backed by a reviewed local runner.

Analysis and execution are deliberately independent. Public metadata, manifests, and supported source files may be fetched read-only for analysis. Arbitrary downloaded source is never installed or executed.

## Product flow

1. Paste any public GitHub repository URL and select **Analyze Repository**.
2. RepoLens reads GitHub metadata, the complete repository tree, relevant manifests, and bounded supported source files without running code.
3. It detects project type, frameworks, package managers, monorepos, subprojects, runnable roots, and architecture relationships.
4. Analysis and grounded feature questions remain available whether or not the project can run.
5. For a reviewed local fixture, **Start Live Preview** creates an independent expiring preview session using a fixed controlled command.

## Analysis and preview support

Analysis accepts public root URLs in the form `https://github.com/owner/repository`. An optional `GITHUB_TOKEN` raises GitHub REST API rate limits; private repositories remain unsupported.

Live preview remains restricted to these exact reviewed sources:

- `https://github.com/repolens-demo/northstar-console` — bundled demo fixture with home, settings, navigation, reusable components, preference storage, and a deployment interaction.
- `https://github.com/digitalocean/sample-vite-react` — reviewed local snapshot pinned to commit `ce1b05ce493249f241bceee9ea30513b88697cc0`.

The DigitalOcean source is stored under `fixtures/verified/digitalocean-sample-vite-react/`. Its URL, commit, and verification metadata are recorded in `fixtures/verified/manifest.json`.

## Local setup

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). An OpenAI key is optional for preview and analysis; feature tracing requires it.

```dotenv
OPENAI_API_KEY=
OPENAI_TRACE_MODEL=gpt-5.6-sol
GITHUB_TOKEN=
ANALYSIS_TTL_MS=600000
PREVIEW_START_TIMEOUT_MS=15000
PREVIEW_TTL_MS=300000
```

Never commit `.env.local`.

## Verification

```bash
npm run health
npm test
npm run build
```

`npm run health` performs an end-to-end local check using only the bundled fixture. It starts and fetches the preview, builds the architecture analysis, confirms that an unrelated question takes the deterministic no-model fallback, then expires the session and verifies that the preview stops responding.

## Architecture

```text
Browser UI
  ├─ POST /api/analyze
  │    ├─ verified URL ── reviewed local source
  │    └─ public URL ── GitHub metadata/tree/raw files (read-only)
  │          └─ project detector + TypeScript parser ── ArchitectureGraph
  ├─ POST /api/preview ── analysis candidate + allow-list ── controlled Vite runner
  └─ POST /api/trace
       ├─ graph relevance ranking
       ├─ bounded verified source excerpts
       ├─ GPT-5.6 Responses API (only with OPENAI_API_KEY)
       └─ strict TraceResult parser + citation validator
```

Analysis sessions and preview sessions have separate lifecycles. Remote analysis source is stored in a temporary directory and deleted on reset or expiry. The preview manager independently owns queued, analyzing, starting, ready, failed, and expired states.

Read-only analysis accepts at most 1,000 supported JavaScript or TypeScript files, 10 MB total, and 512 KB per file. GitHub tree responses must be complete rather than truncated. The analyzer detects Next.js `app/**/page` and `pages/` conventions, `*Page` components, React components, service/API modules, entry points, and relative `import`, `export from`, `require`, and dynamic `import()` relationships. Repositories with no supported source still receive project metadata and an empty graph.

The architecture graph contains route, component, service, and file nodes. It includes definition, render, dependency, and import edges, plus fan-in counts and repository-relative risky-node flags.

## GPT-5.6 feature tracing

When `OPENAI_API_KEY` is configured, `POST /api/trace` uses the Responses API with `gpt-5.6-sol` by default. The question is ranked against the existing graph, expanded by one relationship hop, and limited to at most seven files and 24,000 source characters. The entire repository is not sent when a smaller context is available.

The model must return strict JSON matching the `TraceResult` contract. RepoLens rejects extra fields, invalid JSON, nonexistent files, and nonexistent symbols. Valid symbol citations are rewritten to analyzer-owned line locations before the result reaches the interface. If no relevant code is identified, RepoLens returns an empty low-confidence trace without calling the model.

No live GPT result is claimed unless a valid key is configured and the request succeeds. Without a key, the UI shows an explicit model-configuration state while preview and analysis continue to work.

## Deterministic testing

Tests do not spend API tokens or depend on model availability. Trace tests inject deterministic model adapters that return known `TraceResult` fixtures. The same production parser, canonicalizer, citation validator, context selector, and graph-highlighting logic then process those results. Separate tests cover invalid JSON, invented files, invented symbols, empty questions, missing model configuration, fallback behavior, and source-context limits.

## Safety limitations

- Submitted URLs are normalized and restricted to public HTTPS `github.com` repository roots.
- Read-only analysis fetches only metadata, manifests, and supported source extensions from GitHub-controlled API/raw hosts.
- Symlinks, submodules, binaries, environment files, incomplete trees, and oversized source sets are not followed or analyzed.
- Preview uses a separate exact allow-list; fetched remote source can never enter the runner.
- Package scripts, shell commands, arbitrary backend services, and user-provided commands are never executed.
- Builds use fixed executable paths and argument arrays with `shell: false`.
- The build and preview receive a minimal environment without application secrets or host environment variables.
- Preview output binds only to loopback and appears in a restricted iframe.
- Preview sessions expire after five minutes by default. Analysis sessions expire after ten minutes by default.
- Temporary build output is deleted during expiry and cleanup.
- Because there is no OS-level sandbox, only committed, reviewed fixtures are executable.
- Runtime DOM-to-code correlation, private repositories, authentication, databases, browser extensions, and arbitrary backend execution are not included.

## How Codex was used

Codex helped build RepoLens in five reviewable checkpoints: contract and UI foundation, controlled preview execution, static architecture analysis, grounded feature tracing, and final reliability polish. It read the planning contracts, implemented each bounded scope, created fixtures and tests, ran builds and health checks, and documented safety decisions and remaining limitations. Codex is a development collaborator for this repository; it is not silently executing user repositories at runtime.

## Demo

The complete three-minute recording plan is in [DEMO.md](DEMO.md).
