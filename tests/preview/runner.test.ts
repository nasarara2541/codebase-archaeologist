import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_FIXTURE_REPO_URL,
  DIGITALOCEAN_SAMPLE_REPO_SHA,
  DIGITALOCEAN_SAMPLE_REPO_URL,
} from "../../src/lib/preview/constants";
import { inspectTrustedRepository } from "../../src/lib/preview/runner";

describe("trusted repository inspection", () => {
  it("detects the fixture framework, scripts, and bounded source size", async () => {
    const inspection = await inspectTrustedRepository({
      repoUrl: BUNDLED_FIXTURE_REPO_URL,
      sourcePath: path.join(process.cwd(), "fixtures", "sample-repo"),
      framework: "vite",
      source: "bundled",
    });

    expect(inspection.framework).toBe("vite");
    expect(inspection.scripts).toEqual(["build", "dev", "preview"]);
    expect(inspection.fileCount).toBeGreaterThan(8);
    expect(inspection.fileCount).toBeLessThanOrEqual(250);
    expect(inspection.totalBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("detects and bounds the pinned DigitalOcean Vite fixture", async () => {
    const inspection = await inspectTrustedRepository({
      repoUrl: DIGITALOCEAN_SAMPLE_REPO_URL,
      sourcePath: path.join(
        process.cwd(),
        "fixtures",
        "verified",
        "digitalocean-sample-vite-react",
      ),
      framework: "vite",
      source: "configured",
    });

    expect(DIGITALOCEAN_SAMPLE_REPO_SHA).toHaveLength(40);
    expect(inspection.framework).toBe("vite");
    expect(inspection.scripts).toEqual(["build", "dev", "lint", "preview", "start"]);
    expect(inspection.fileCount).toBeGreaterThan(10);
    expect(inspection.fileCount).toBeLessThanOrEqual(250);
    expect(inspection.totalBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  });
});
