import path from "node:path";
import type { SupportedFramework } from "../../types/api";
import {
  BUNDLED_FIXTURE_REPO_URL,
  DIGITALOCEAN_SAMPLE_REPO_URL,
} from "./constants";

export {
  BUNDLED_FIXTURE_REPO_URL,
  DIGITALOCEAN_SAMPLE_REPO_SHA,
  DIGITALOCEAN_SAMPLE_REPO_URL,
} from "./constants";

export type AllowedRepository = {
  repoUrl: string;
  sourcePath: string;
  framework: SupportedFramework;
  source: "bundled" | "configured";
};

export class RepositoryValidationError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_URL" | "NOT_ALLOWED" | "INVALID_CONFIGURATION",
  ) {
    super(message);
    this.name = "RepositoryValidationError";
  }
}

export function normalizeGitHubRepositoryUrl(input: string): string {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new RepositoryValidationError(
      "Enter a valid public GitHub repository URL.",
      "INVALID_URL",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new RepositoryValidationError(
      "Only public HTTPS github.com repository URLs are supported.",
      "INVALID_URL",
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new RepositoryValidationError(
      "Use a repository root URL in the form https://github.com/owner/repository.",
      "INVALID_URL",
    );
  }

  const [owner, rawRepository] = segments;
  const repository = rawRepository.replace(/\.git$/i, "");
  const validSegment = /^[a-zA-Z0-9_.-]+$/;

  if (!owner || !repository || !validSegment.test(owner) || !validSegment.test(repository)) {
    throw new RepositoryValidationError(
      "The GitHub owner or repository name is invalid.",
      "INVALID_URL",
    );
  }

  return `https://github.com/${owner.toLowerCase()}/${repository.toLowerCase()}`;
}

export function getAllowedRepositories(
  projectRoot = process.cwd(),
): AllowedRepository[] {
  return [
    {
      repoUrl: BUNDLED_FIXTURE_REPO_URL,
      sourcePath: path.join(projectRoot, "fixtures", "sample-repo"),
      framework: "vite",
      source: "bundled",
    },
    {
      repoUrl: DIGITALOCEAN_SAMPLE_REPO_URL,
      sourcePath: path.join(
        projectRoot,
        "fixtures",
        "verified",
        "digitalocean-sample-vite-react",
      ),
      framework: "vite",
      source: "configured",
    },
  ];
}

export function resolveAllowedRepository(
  input: string,
  projectRoot = process.cwd(),
): AllowedRepository {
  const normalizedUrl = normalizeGitHubRepositoryUrl(input);
  const repository = getAllowedRepositories(projectRoot).find(
    (candidate) => candidate.repoUrl === normalizedUrl,
  );

  if (!repository) {
    throw new RepositoryValidationError(
      "Only verified demo repositories are supported in this hackathon version.",
      "NOT_ALLOWED",
    );
  }

  return repository;
}

export function findAllowedRepository(
  input: string,
  projectRoot = process.cwd(),
): AllowedRepository | null {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeGitHubRepositoryUrl(input);
  } catch {
    return null;
  }
  return (
    getAllowedRepositories(projectRoot).find((candidate) => candidate.repoUrl === normalizedUrl) ?? null
  );
}
