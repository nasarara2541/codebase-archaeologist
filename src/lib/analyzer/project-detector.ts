import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  DetectedFramework,
  DetectedSubproject,
  PackageManager,
  PreviewCandidate,
  RepositoryProjectInfo,
} from "../../types/api";
import type { AnalysisRepository } from "./repository-analyzer";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);
const MAX_PACKAGE_FILES = 100;

type PackageJson = {
  name?: unknown;
  packageManager?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  workspaces?: unknown;
};

function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join("/") || ".";
}

async function findPackageFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && entry.name === "package.json") {
        files.push(absolutePath);
        if (files.length > MAX_PACKAGE_FILES) {
          throw new Error("Repository contains more than 100 JavaScript package roots.");
        }
      }
    }
  }
  await visit(root);
  return files.sort();
}

function dependencyNames(manifest: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

function detectFrameworks(manifest: PackageJson): DetectedFramework[] {
  const names = dependencyNames(manifest);
  const frameworks: DetectedFramework[] = [];
  if (names.has("next")) frameworks.push("next");
  if (names.has("nuxt")) frameworks.push("nuxt");
  if (names.has("@angular/core")) frameworks.push("angular");
  if (names.has("@sveltejs/kit") || names.has("svelte")) frameworks.push("svelte");
  if (names.has("astro")) frameworks.push("astro");
  if (names.has("vite")) frameworks.push("vite");
  if (names.has("vue")) frameworks.push("vue");
  if (names.has("react") || names.has("react-dom")) frameworks.push("react");
  return [...new Set(frameworks)];
}

function primaryFramework(frameworks: DetectedFramework[]): DetectedFramework {
  const priority: DetectedFramework[] = [
    "next",
    "nuxt",
    "angular",
    "svelte",
    "astro",
    "vite",
    "vue",
    "react",
  ];
  return priority.find((framework) => frameworks.includes(framework)) ?? "unknown";
}

async function fileExists(filePath: string): Promise<boolean> {
  return Boolean((await stat(filePath).catch(() => null))?.isFile());
}

async function detectPackageManager(
  repositoryRoot: string,
  packageRoot: string,
  manifest: PackageJson,
): Promise<PackageManager> {
  if (typeof manifest.packageManager === "string") {
    const name = manifest.packageManager.split("@")[0];
    if (["npm", "yarn", "pnpm", "bun"].includes(name)) return name as PackageManager;
  }
  for (const root of [...new Set([packageRoot, repositoryRoot])]) {
    if (
      (await fileExists(path.join(root, "pnpm-lock.yaml"))) ||
      (await fileExists(path.join(root, "pnpm-workspace.yaml")))
    ) return "pnpm";
    if (await fileExists(path.join(root, "yarn.lock"))) return "yarn";
    if (
      (await fileExists(path.join(root, "bun.lockb"))) ||
      (await fileExists(path.join(root, "bun.lock")))
    ) return "bun";
    if (await fileExists(path.join(root, "package-lock.json"))) return "npm";
  }
  return "unknown";
}

function isRunnable(scripts: string[], framework: DetectedFramework): boolean {
  return (
    framework !== "unknown" &&
    scripts.some((script) => ["dev", "start", "preview", "serve"].includes(script))
  );
}

export async function detectRepositoryProject(
  repository: AnalysisRepository,
  options: {
    verifiedLocal?: boolean;
    defaultBranch?: string;
    description?: string;
  } = {},
): Promise<RepositoryProjectInfo> {
  const packageFiles = await findPackageFiles(repository.sourcePath);
  const subprojects: DetectedSubproject[] = [];
  const allFrameworks = new Set<DetectedFramework>();
  const allPackageManagers = new Set<PackageManager>();
  let workspaceConfigured = false;

  for (const packageFile of packageFiles) {
    const manifest = JSON.parse(await readFile(packageFile, "utf8")) as PackageJson;
    const root = path.dirname(packageFile);
    const relativeRoot = normalize(path.relative(repository.sourcePath, root));
    const frameworks = detectFrameworks(manifest);
    const framework = primaryFramework(frameworks);
    const packageManager = await detectPackageManager(repository.sourcePath, root, manifest);
    const scripts = Object.entries(manifest.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name]) => name)
      .sort();
    for (const item of frameworks) allFrameworks.add(item);
    if (packageManager !== "unknown") allPackageManagers.add(packageManager);
    if (manifest.workspaces) workspaceConfigured = true;
    subprojects.push({
      root: relativeRoot,
      name:
        typeof manifest.name === "string" && manifest.name.trim()
          ? manifest.name
          : relativeRoot === "."
            ? path.basename(repository.sourcePath)
            : path.basename(root),
      framework,
      packageManager,
      scripts,
      runnable: isRunnable(scripts, framework),
    });
  }

  const hasWorkspaceFile =
    (await fileExists(path.join(repository.sourcePath, "pnpm-workspace.yaml"))) ||
    (await fileExists(path.join(repository.sourcePath, "turbo.json"))) ||
    (await fileExists(path.join(repository.sourcePath, "nx.json")));
  const monorepo = packageFiles.length > 1 || workspaceConfigured || hasWorkspaceFile;
  const runnable = subprojects.filter((subproject) => subproject.runnable);
  const supportedRunnerFrameworks = new Set<DetectedFramework>(["vite"]);
  const previewCandidates: PreviewCandidate[] = runnable.map((subproject) => {
    const supportedFramework = supportedRunnerFrameworks.has(subproject.framework);
    const available = Boolean(options.verifiedLocal && supportedFramework);
    const reason = available
      ? "This reviewed local source can use the controlled preview runner."
      : !options.verifiedLocal
        ? "Analysis available; live preview unavailable because this repository is not a reviewed executable fixture."
        : `Analysis available; live preview unavailable because ${subproject.framework} is not supported by the controlled runner.`;
    return { ...subproject, available, reason };
  });
  const availableCandidate = previewCandidates.find((candidate) => candidate.available);
  const projectType: RepositoryProjectInfo["projectType"] = monorepo
    ? "monorepo"
    : allFrameworks.size > 0
      ? "frontend"
      : packageFiles.length > 0
        ? "library"
        : "unknown";

  return {
    projectType,
    frameworks: [...allFrameworks],
    packageManagers: [...allPackageManagers],
    monorepo,
    subprojects,
    previewCandidates,
    previewAvailable: Boolean(availableCandidate),
    previewReason:
      availableCandidate?.reason ??
      previewCandidates[0]?.reason ??
      "Analysis available; live preview unavailable because no runnable frontend subproject was detected.",
    defaultBranch: options.defaultBranch,
    description: options.description,
    source: options.verifiedLocal ? "verified-local" : "github-readonly",
  };
}
