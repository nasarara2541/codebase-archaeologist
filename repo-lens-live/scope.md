# RepoLens — Scope

## Product statement

RepoLens lets a developer paste a public GitHub repository, open a temporary live preview of the web application, and understand how what they see connects to the underlying code.

## MVP features

### 1. Safe live preview

Accept a public React, Next.js, or Vite repository, detect its start/build command, run it in an isolated temporary workspace, and expose a preview URL or embedded preview panel.

### 2. Preview-to-code tracing

When the user selects a visible route or UI element, show the likely page, component, route, API call, and source files responsible for it.

### 3. AI codebase explanation

Answer questions such as “Where does this checkout flow come from?” using real files and function names from the analyzed repository.

### 4. Architecture context

Show a compact dependency map beside the live preview and highlight the relevant code path.

## Deliberate limits

- Public repositories only
- React, Next.js, and Vite projects only
- JavaScript and TypeScript only
- Temporary preview sessions only
- No private environment variables, databases, authentication, or arbitrary backend execution
- One demo repository must be tested and documented end to end

## Success criterion

A judge can paste a supported repository, open its live preview, click or select a visible feature, and understand which code produces it without manually exploring the repository.
