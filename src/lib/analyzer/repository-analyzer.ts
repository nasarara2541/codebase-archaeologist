import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  AnalyzeResult,
  AnalyzedSourceFile,
  ArchitectureGraph,
  ArchitectureNode,
  CodeLocation,
  PreviewElement,
} from "../../types/api";
import { parseSourceFile, type ParsedSourceFile, type ParsedSymbol } from "./parser";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "_static", ".next"]);
const MAX_SOURCE_FILES = 1_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 512 * 1024;

export type AnalysisRepository = {
  repoUrl: string;
  sourcePath: string;
};

export class SourceAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAnalysisError";
  }
}

type DetectedRoute = {
  route: string;
  file: string;
  component?: ParsedSymbol;
};

type GraphEdge = { source: string; target: string };

function normalizeRelative(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function scanSourceFiles(root: string): Promise<string[]> {
  const rootMetadata = await stat(root).catch(() => null);
  if (!rootMetadata?.isDirectory()) {
    throw new SourceAnalysisError("The verified repository source directory is missing.");
  }

  const files: string[] = [];
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      throw new SourceAnalysisError("A verified repository source directory could not be read.");
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new SourceAnalysisError("Verified analysis sources may not contain symbolic links.");
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const metadata = await stat(entryPath);
      if (metadata.size > MAX_SINGLE_FILE_BYTES) {
        throw new SourceAnalysisError(`Source file ${entry.name} exceeds the 512 KB limit.`);
      }
      files.push(entryPath);
      totalBytes += metadata.size;
      if (files.length > MAX_SOURCE_FILES || totalBytes > MAX_SOURCE_BYTES) {
        throw new SourceAnalysisError("Repository source exceeds the 1,000-file or 10 MB analysis limit.");
      }
    }
  }

  await visit(root);
  return files.sort();
}

function resolveRelativeImport(
  importer: ParsedSourceFile,
  specifier: string,
  knownFiles: Map<string, ParsedSourceFile>,
): ParsedSourceFile | null {
  const base = path.resolve(path.dirname(importer.absolutePath), specifier);
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) => path.join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    const match = knownFiles.get(path.normalize(candidate));
    if (match) return match;
  }
  return null;
}

export function inferRouteFromFile(file: string, componentName?: string): string | null {
  const normalized = file.replaceAll("\\", "/");
  const nextAppMatch = normalized.match(/(?:^|\/)app\/(.*?\/)?page\.[cm]?[jt]sx?$/);
  if (nextAppMatch) {
    const segments = (nextAppMatch[1] ?? "")
      .split("/")
      .filter((segment) => segment && !segment.startsWith("(") && !segment.startsWith("@"));
    return `/${segments.join("/")}` || "/";
  }

  if (componentName?.endsWith("Page")) {
    const base = componentName.slice(0, -4);
    if (base.toLowerCase() === "home") return "/";
    return `/${base.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
  }

  const pagesMatch = normalized.match(/(?:^|\/)pages\/(.+)\.[cm]?[jt]sx?$/);
  if (pagesMatch) {
    const withoutIndex = pagesMatch[1].replace(/(?:^|\/)index$/i, "");
    return `/${withoutIndex}`.replace(/\/+/g, "/") || "/";
  }

  return null;
}

function detectRoutes(
  files: ParsedSourceFile[],
  importTargets: Map<string, ParsedSourceFile[]>,
): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const seen = new Set<string>();
  const addRoute = (route: DetectedRoute) => {
    const key = `${route.route}:${route.file}:${route.component?.name ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push(route);
  };

  for (const file of files) {
    for (const component of file.components) {
      const inferred = inferRouteFromFile(file.relativePath, component.name);
      if (inferred) addRoute({ route: inferred, file: file.relativePath, component });
    }

    const pathRoute = inferRouteFromFile(file.relativePath);
    if (pathRoute && file.components.length === 0) {
      addRoute({ route: pathRoute, file: file.relativePath });
    }
  }

  for (const entry of files.filter((file) => file.entryPoint)) {
    for (const target of importTargets.get(entry.relativePath) ?? []) {
      const app = target.components.find((component) => component.name === "App");
      if (app) addRoute({ route: "/", file: target.relativePath, component: app });
    }
  }

  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (edge.source === edge.target) return false;
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateFanInAndRisk(
  nodes: ArchitectureNode[],
  edges: GraphEdge[],
): ArchitectureNode[] {
  const incoming = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) incoming.get(edge.target)?.add(edge.source);
  const counts = nodes.map((node) => incoming.get(node.id)?.size ?? 0).sort((a, b) => a - b);
  const percentileIndex = Math.max(0, Math.ceil(counts.length * 0.9) - 1);
  const threshold = Math.max(3, counts[percentileIndex] ?? 3);

  return nodes.map((node) => {
    const fanIn = incoming.get(node.id)?.size ?? 0;
    return { ...node, fanIn, risky: fanIn >= threshold };
  });
}

function buildGraph(
  files: ParsedSourceFile[],
  routes: DetectedRoute[],
  importTargets: Map<string, ParsedSourceFile[]>,
): ArchitectureGraph {
  const nodes: ArchitectureNode[] = [];
  const edges: GraphEdge[] = [];

  for (const file of files) {
    const fileId = `file:${file.relativePath}`;
    nodes.push({
      id: fileId,
      label: path.basename(file.relativePath),
      type: "file",
      locations: [{ file: file.relativePath, lineStart: 1 }],
      fanIn: 0,
      risky: false,
    });

    for (const component of file.components) {
      const componentId = `component:${file.relativePath}#${component.name}`;
      nodes.push({
        id: componentId,
        label: component.name,
        type: "component",
        locations: [component.location],
        fanIn: 0,
        risky: false,
      });
      edges.push({ source: componentId, target: fileId });
    }

    for (const service of file.serviceFunctions) {
      const apiId = `api:${file.relativePath}#${service.name}`;
      nodes.push({
        id: apiId,
        label: service.name,
        type: "api",
        locations: [service.location],
        fanIn: 0,
        risky: false,
      });
      edges.push({ source: apiId, target: fileId });
    }

    for (const target of importTargets.get(file.relativePath) ?? []) {
      edges.push({ source: fileId, target: `file:${target.relativePath}` });
      for (const sourceComponent of file.components) {
        for (const targetComponent of target.components) {
          edges.push({
            source: `component:${file.relativePath}#${sourceComponent.name}`,
            target: `component:${target.relativePath}#${targetComponent.name}`,
          });
        }
        for (const service of target.serviceFunctions) {
          edges.push({
            source: `component:${file.relativePath}#${sourceComponent.name}`,
            target: `api:${target.relativePath}#${service.name}`,
          });
        }
      }
    }
  }

  for (const route of routes) {
    const routeId = `route:${route.route}:${route.file}`;
    nodes.push({
      id: routeId,
      label: route.route,
      type: "route",
      locations: [
        route.component?.location ?? {
          file: route.file,
          lineStart: 1,
        },
      ],
      fanIn: 0,
      risky: false,
    });
    edges.push({
      source: routeId,
      target: route.component
        ? `component:${route.file}#${route.component.name}`
        : `file:${route.file}`,
    });

    for (const entry of files.filter((file) => file.entryPoint)) {
      const importsRouteFile = (importTargets.get(entry.relativePath) ?? []).some(
        (target) => target.relativePath === route.file,
      );
      if (importsRouteFile) edges.push({ source: `file:${entry.relativePath}`, target: routeId });
    }
  }

  const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
  const uniqueEdges = dedupeEdges(edges);
  return { nodes: calculateFanInAndRisk(uniqueNodes, uniqueEdges), edges: uniqueEdges };
}

function fileKind(file: ParsedSourceFile): AnalyzedSourceFile["kind"] {
  if (file.entryPoint) return "entry";
  if (file.serviceFunctions.length > 0) return "service";
  if (file.components.length > 0) return "component";
  return "source";
}

export async function analyzeRepository(
  repository: AnalysisRepository,
  sessionId: string,
): Promise<AnalyzeResult> {
  const sourcePaths = await scanSourceFiles(repository.sourcePath);
  const parsedFiles = await Promise.all(
    sourcePaths.map(async (absolutePath) => {
      const relativePath = normalizeRelative(path.relative(repository.sourcePath, absolutePath));
      let source: string;
      try {
        source = await readFile(absolutePath, "utf8");
      } catch {
        throw new SourceAnalysisError(`Source file ${relativePath} could not be read.`);
      }
      return parseSourceFile(source, absolutePath, relativePath);
    }),
  );

  const filesByAbsolutePath = new Map(
    parsedFiles.map((file) => [path.normalize(file.absolutePath), file]),
  );
  const importTargets = new Map<string, ParsedSourceFile[]>();
  for (const file of parsedFiles) {
    importTargets.set(
      file.relativePath,
      file.imports
        .map((imported) => resolveRelativeImport(file, imported.specifier, filesByAbsolutePath))
        .filter((target): target is ParsedSourceFile => Boolean(target)),
    );
  }

  const dependents = new Map(parsedFiles.map((file) => [file.relativePath, new Set<string>()]));
  for (const [source, targets] of importTargets) {
    for (const target of targets) dependents.get(target.relativePath)?.add(source);
  }

  const routes = detectRoutes(parsedFiles, importTargets);
  const graph = buildGraph(parsedFiles, routes, importTargets);
  const elements: PreviewElement[] = routes.map((route) => ({
    id: `preview:${route.route}:${route.file}`,
    label: route.component?.name ?? route.route,
    route: route.route,
    locations: [route.component?.location ?? { file: route.file, lineStart: 1 }],
  }));
  const files: AnalyzedSourceFile[] = parsedFiles.map((file) => ({
    path: file.relativePath,
    kind: fileKind(file),
    imports: (importTargets.get(file.relativePath) ?? []).map((target) => target.relativePath),
    dependents: [...(dependents.get(file.relativePath) ?? [])].sort(),
    components: file.components.map((component) => component.name),
    serviceFunctions: file.serviceFunctions.map((service) => service.name),
    entryPoint: file.entryPoint,
  }));
  const entryPoints: CodeLocation[] = parsedFiles
    .filter((file) => file.entryPoint)
    .map((file) => ({ file: file.relativePath, lineStart: 1 }));

  return {
    analysisId: sessionId,
    sessionId,
    repoUrl: repository.repoUrl,
    routes: [...new Set(routes.map((route) => route.route))],
    elements,
    files,
    entryPoints,
    graph,
    project: {
      projectType: "unknown",
      frameworks: [],
      packageManagers: [],
      monorepo: false,
      subprojects: [],
      previewCandidates: [],
      previewAvailable: false,
      previewReason: "No runnable frontend preview candidate was detected.",
      source: "verified-local",
    },
  };
}
