# RepoLens — Data and API Contract

```ts
export type PreviewSession = {
  id: string;
  repoUrl: string;
  status: "queued" | "analyzing" | "starting" | "ready" | "failed" | "expired";
  previewUrl?: string;
  framework?: "react" | "next" | "vite";
  error?: string;
};

export type CodeLocation = {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  functionName?: string;
};

export type PreviewElement = {
  id: string;
  label: string;
  route: string;
  locations: CodeLocation[];
};

export type ArchitectureNode = {
  id: string;
  label: string;
  type: "route" | "component" | "api" | "file";
  locations: CodeLocation[];
  fanIn: number;
  risky: boolean;
};

export type ArchitectureGraph = {
  nodes: ArchitectureNode[];
  edges: { source: string; target: string }[];
};

export type TraceStep = {
  location: CodeLocation;
  explanation: string;
};

export type TraceResult = {
  question: string;
  steps: TraceStep[];
  confidence: "high" | "medium" | "low";
};
```

## Endpoints

### `POST /api/preview`

Request:

```json
{ "analysisId": "analysis-id", "projectRoot": "." }
```

Response: `PreviewSession`

### `GET /api/preview/:id`

Returns the current `PreviewSession` status and preview URL when ready.

### `POST /api/analyze`

Request:

```json
{ "repoUrl": "https://github.com/owner/repository" }
```

Response: an analysis ID, detected project type, frameworks, package managers, subprojects, preview candidates, routes, elements, and `ArchitectureGraph`. Analysis does not execute repository code.

### `POST /api/trace`

Request:

```json
{ "analysisId": "analysis-id", "question": "Where does checkout begin?" }
```

Response: `TraceResult`.

## Validation rules

- Every returned citation must refer to a fetched repository file.
- Public source fetching is read-only and bounded; fetched repositories are never passed to the preview runner.
- Preview commands and project roots must resolve from a verified analysis candidate and local allow-list.
- A session expires automatically.
- Invalid model output must be rejected before it reaches the UI.
