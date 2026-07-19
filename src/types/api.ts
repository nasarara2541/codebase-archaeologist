export type PreviewSessionStatus =
  | "queued"
  | "analyzing"
  | "starting"
  | "ready"
  | "failed"
  | "expired";

export type SupportedFramework = "react" | "next" | "vite";

export type PreviewSession = {
  id: string;
  repoUrl: string;
  status: PreviewSessionStatus;
  previewUrl?: string;
  framework?: SupportedFramework;
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

export type CreatePreviewRequest = {
  repoUrl: string;
};

export type AnalyzeRequest = {
  repoUrl: string;
};

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | "unknown";

export type DetectedFramework =
  | "react"
  | "next"
  | "vite"
  | "vue"
  | "nuxt"
  | "svelte"
  | "astro"
  | "angular"
  | "unknown";

export type DetectedSubproject = {
  root: string;
  name: string;
  framework: DetectedFramework;
  packageManager: PackageManager;
  scripts: string[];
  runnable: boolean;
};

export type PreviewCandidate = DetectedSubproject & {
  available: boolean;
  reason: string;
};

export type RepositoryProjectInfo = {
  projectType: "frontend" | "monorepo" | "library" | "mixed" | "unknown";
  frameworks: DetectedFramework[];
  packageManagers: PackageManager[];
  monorepo: boolean;
  subprojects: DetectedSubproject[];
  previewCandidates: PreviewCandidate[];
  previewAvailable: boolean;
  previewReason: string;
  defaultBranch?: string;
  description?: string;
  source: "verified-local" | "github-readonly";
};

export type AnalyzedSourceFile = {
  path: string;
  kind: "entry" | "component" | "service" | "source";
  imports: string[];
  dependents: string[];
  components: string[];
  serviceFunctions: string[];
  entryPoint: boolean;
};

export type AnalyzeResult = {
  analysisId: string;
  sessionId: string;
  repoUrl: string;
  routes: string[];
  elements: PreviewElement[];
  files: AnalyzedSourceFile[];
  entryPoints: CodeLocation[];
  graph: ArchitectureGraph;
  project: RepositoryProjectInfo;
};

export type TraceRequest = {
  analysisId: string;
  question: string;
};

export type TraceErrorCode =
  | "EMPTY_QUESTION"
  | "MODEL_CONFIGURATION"
  | "MODEL_ERROR"
  | "INVALID_MODEL_OUTPUT"
  | "INVALID_CITATION";
