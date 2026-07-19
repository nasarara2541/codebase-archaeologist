import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeGitHubRepositoryUrl } from "../preview/repositories";
import type { AnalysisRepository } from "./repository-analyzer";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const MANIFEST_FILES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "bun.lock",
  "bun.lockb",
  "turbo.json",
  "nx.json",
]);
const MAX_FILES = 1_000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

type GitHubRepositoryResponse = {
  private?: boolean;
  default_branch?: string;
  description?: string | null;
  full_name?: string;
};

type GitHubBranchResponse = { commit?: { sha?: string } };

type GitHubTreeEntry = {
  path?: string;
  mode?: string;
  type?: string;
  size?: number;
};

type GitHubTreeResponse = {
  truncated?: boolean;
  tree?: GitHubTreeEntry[];
};

export class RemoteRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "NOT_PUBLIC"
      | "RATE_LIMITED"
      | "TOO_LARGE"
      | "FETCH_FAILED",
  ) {
    super(message);
    this.name = "RemoteRepositoryError";
  }
}

export type FetchedGitHubRepository = {
  repository: AnalysisRepository;
  defaultBranch: string;
  description?: string;
  cleanup: () => Promise<void>;
};

function repositoryParts(repoUrl: string): { owner: string; repo: string; normalized: string } {
  const normalized = normalizeGitHubRepositoryUrl(repoUrl);
  const url = new URL(normalized);
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  return { owner, repo, normalized };
}

function apiHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RepoLens-readonly-analyzer",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, {
    headers: apiHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new RemoteRepositoryError("The public GitHub repository was not found.", "NOT_FOUND");
    }
    if (response.status === 403 || response.status === 429) {
      throw new RemoteRepositoryError(
        "GitHub API rate limit reached. Configure GITHUB_TOKEN or try again later.",
        "RATE_LIMITED",
      );
    }
    throw new RemoteRepositoryError(
      `GitHub returned HTTP ${response.status} while reading the repository.`,
      "FETCH_FAILED",
    );
  }
  return (await response.json()) as T;
}

function safeRelevantPath(entry: GitHubTreeEntry): entry is GitHubTreeEntry & { path: string; size: number } {
  if (
    entry.type !== "blob" ||
    !["100644", "100755"].includes(entry.mode ?? "") ||
    typeof entry.path !== "string" ||
    typeof entry.size !== "number"
  ) return false;
  const normalized = path.posix.normalize(entry.path);
  if (
    normalized !== entry.path ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("\\")
  ) return false;
  const basename = path.posix.basename(normalized);
  return MANIFEST_FILES.has(basename) || SOURCE_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
}

function encodePath(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

export async function fetchPublicGitHubRepository(
  repoUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchedGitHubRepository> {
  const { owner, repo, normalized } = repositoryParts(repoUrl);
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const metadata = await githubJson<GitHubRepositoryResponse>(apiBase, fetcher);
  if (metadata.private) {
    throw new RemoteRepositoryError("Only public GitHub repositories can be analyzed.", "NOT_PUBLIC");
  }
  if (!metadata.default_branch) {
    throw new RemoteRepositoryError("The repository has no readable default branch.", "FETCH_FAILED");
  }

  const branch = await githubJson<GitHubBranchResponse>(
    `${apiBase}/branches/${encodeURIComponent(metadata.default_branch)}`,
    fetcher,
  );
  const commitSha = branch.commit?.sha;
  if (!commitSha) throw new RemoteRepositoryError("The default branch commit could not be resolved.", "FETCH_FAILED");
  const tree = await githubJson<GitHubTreeResponse>(
    `${apiBase}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
    fetcher,
  );
  if (tree.truncated) {
    throw new RemoteRepositoryError(
      "The repository tree exceeds GitHub's recursive tree limit and cannot be analyzed completely.",
      "TOO_LARGE",
    );
  }

  const files = (tree.tree ?? []).filter(safeRelevantPath);
  if (files.length > MAX_FILES) {
    throw new RemoteRepositoryError(
      `Repository has ${files.length} supported files; the read-only analysis limit is ${MAX_FILES}.`,
      "TOO_LARGE",
    );
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.some((file) => file.size > MAX_FILE_BYTES) || totalBytes > MAX_TOTAL_BYTES) {
    throw new RemoteRepositoryError(
      "Supported source exceeds the 512 KB per-file or 10 MB total analysis limit.",
      "TOO_LARGE",
    );
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "repolens-analysis-"));
  try {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
      while (cursor < files.length) {
        const file = files[cursor++];
        const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(commitSha)}/${encodePath(file.path)}`;
        const response = await fetcher(rawUrl, {
          headers: { "User-Agent": "RepoLens-readonly-analyzer" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new RemoteRepositoryError(
            `Source file ${file.path} could not be fetched from GitHub.`,
            "FETCH_FAILED",
          );
        }
        const source = await response.text();
        if (Buffer.byteLength(source) > MAX_FILE_BYTES) {
          throw new RemoteRepositoryError(`Source file ${file.path} exceeds the analysis limit.`, "TOO_LARGE");
        }
        const destination = path.join(workspace, ...file.path.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, source, "utf8");
      }
    });
    await Promise.all(workers);
    return {
      repository: { repoUrl: normalized, sourcePath: workspace },
      defaultBranch: metadata.default_branch,
      description: metadata.description ?? undefined,
      cleanup: () => rm(workspace, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    if (error instanceof RemoteRepositoryError) throw error;
    throw new RemoteRepositoryError(
      error instanceof Error ? error.message : "Repository source could not be fetched.",
      "FETCH_FAILED",
    );
  }
}
