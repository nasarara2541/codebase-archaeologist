# RepoLens three-minute demo script

## Before recording

1. Run `npm install`.
2. Optionally configure `OPENAI_API_KEY` in `.env.local` for the live GPT-5.6 trace. Do not describe the trace as live GPT output without a working key.
3. Run `npm run health`, then `npm run dev`.
4. Open `http://localhost:3000` at a laptop-sized viewport.
5. Leave the prefilled Northstar repository URL unchanged.

## 0:00–0:25 — The problem

Show the RepoLens hero and “How it works” panel.

Say:

> “Developers can see what a product does, or inspect how its repository is structured, but connecting those two views still takes time. RepoLens is the AI preview layer for a codebase: it lets you see the product from the outside and understand it from the inside at the same time.”

Point out the visible “Verified demo repository” label.

## 0:25–0:55 — Safe live preview

Click **Analyze Repository**. Show the detected project type, frameworks, package manager, and `.` runnable subproject. Then click **Start Live Preview**.

As the status moves through queued, analyzing, and starting, say:

> “This hackathon build never runs an arbitrary submitted repository. The URL maps to reviewed local source, starts with a fixed controlled command, receives no application secrets, and expires automatically.”

When ready, show the Northstar preview. Click **Settings** inside the preview and briefly toggle a preference.

## 0:55–1:30 — Architecture beside the product

Move attention to the architecture panel.

Say:

> “RepoLens parsed the verified TypeScript source without executing it. It detected routes, React components, service functions, entry points, files, and relative imports.”

Click the `/settings` route or `SettingsPage` component. Point out:

- The highlighted connected path.
- `src/pages/SettingsPage.tsx`.
- The component name and source lines.
- Imports, dependents, fan-in, and the file-path copy button.

## 1:30–2:20 — Grounded feature trace

Click the sample question **How does the settings page work?**, then click **Trace feature**.

If `OPENAI_API_KEY` is configured and the request succeeds, say:

> “GPT-5.6 receives only the graph-ranked source excerpts, not the whole repository. It must return strict TraceResult JSON. RepoLens validates every file and symbol, replaces line numbers with analyzer-owned locations, and blocks invented citations.”

Show the ordered feature flow. Click a trace step and point out how the corresponding source node and connecting path remain pink. Use **Copy** on the trace result.

If no API key is configured, say instead:

> “The demo environment has no model key configured, so RepoLens reports that state explicitly rather than pretending this is live GPT output. The deterministic test adapters exercise the same parser, citation validator, and highlighting pipeline without network calls.”

Then use the architecture panel to show the settings path manually.

## 2:20–2:40 — Hallucination boundary

Say:

> “Unknown files and symbols never reach the interface. Invalid JSON and citations are rejected, and unrelated questions return a low-confidence empty flow without calling the model.”

Mention that runtime DOM-to-code correlation is deliberately deferred; this version stays grounded in static source and graph evidence.

## 2:40–3:00 — Reliability and close

Click **Reset analysis** and show the interface returning focus to the repository input.

Say:

> “The final health check starts the verified preview, analyzes it, verifies the trace fallback, expires the session, and confirms cleanup. RepoLens connects what users see, how the product works, and where it lives in code—safely, visibly, and with citations.”

End on the hero:

> “RepoLens: see the product, trace the code.”
