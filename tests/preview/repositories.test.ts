import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FIXTURE_REPO_URL,
  DIGITALOCEAN_SAMPLE_REPO_URL,
  RepositoryValidationError,
  getAllowedRepositories,
  normalizeGitHubRepositoryUrl,
  resolveAllowedRepository,
} from "../../src/lib/preview/repositories";

describe("GitHub repository validation", () => {
  it("normalizes a public repository root URL", () => {
    expect(normalizeGitHubRepositoryUrl("https://github.com/Owner/Repo.git/"))
      .toBe("https://github.com/owner/repo");
  });

  it.each([
    "http://github.com/owner/repo",
    "https://gitlab.com/owner/repo",
    "https://github.com/owner/repo/tree/main",
    "https://token@github.com/owner/repo",
    "not-a-url",
  ])("rejects unsupported URL %s", (url) => {
    expect(() => normalizeGitHubRepositoryUrl(url)).toThrow(RepositoryValidationError);
  });
});

describe("repository allow-list", () => {
  it("allows the bundled verified fixture", () => {
    const repository = resolveAllowedRepository(BUNDLED_FIXTURE_REPO_URL, "/project");
    expect(repository.source).toBe("bundled");
    expect(repository.sourcePath).toBe(path.join("/project", "fixtures", "sample-repo"));
  });

  it("maps the exact DigitalOcean URL to its pinned local fixture", () => {
    const repositories = getAllowedRepositories("/project");
    expect(repositories).toHaveLength(2);
    expect(resolveAllowedRepository(DIGITALOCEAN_SAMPLE_REPO_URL, "/project")).toMatchObject({
      source: "configured",
      sourcePath: path.join(
        "/project",
        "fixtures",
        "verified",
        "digitalocean-sample-vite-react",
      ),
    });
  });

  it("rejects a valid but unsupported public repository", () => {
    expect(() => resolveAllowedRepository("https://github.com/example/untrusted"))
      .toThrowError("Only verified demo repositories are supported in this hackathon version.");
  });
});
