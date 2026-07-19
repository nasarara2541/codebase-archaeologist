import { afterEach, describe, expect, it, vi } from "vitest";
import type { AllowedRepository } from "../../src/lib/preview/repositories";
import type {
  PreviewRunner,
  RepositoryInspection,
  RunningPreview,
} from "../../src/lib/preview/runner";
import { PreviewSessionManager } from "../../src/lib/preview/session-manager";

const repository: AllowedRepository = {
  repoUrl: "https://github.com/repolens-demo/northstar-console",
  sourcePath: "/trusted/sample-repo",
  framework: "vite",
  source: "bundled",
};

const inspection: RepositoryInspection = {
  framework: "vite",
  scripts: ["build", "dev", "preview"],
  fileCount: 12,
  totalBytes: 20_000,
};

function createRunner(overrides: Partial<PreviewRunner> = {}) {
  const stop = vi.fn(async () => undefined);
  const runningPreview: RunningPreview = {
    previewUrl: "http://127.0.0.1:43210",
    onUnexpectedExit: vi.fn(),
    stop,
  };
  const runner: PreviewRunner = {
    analyze: vi.fn(async () => inspection),
    start: vi.fn(async () => runningPreview),
    ...overrides,
  };
  return { runner, stop };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PreviewSessionManager", () => {
  it("moves through queued, analyzing, starting, and ready", async () => {
    const { runner } = createRunner();
    const manager = new PreviewSessionManager({
      runner,
      ttlMs: 60_000,
      autoStart: false,
      createId: () => "session-1",
    });

    const created = manager.create(repository);
    expect(created.status).toBe("queued");
    await manager.start(created.id);

    expect(manager.get(created.id)).toMatchObject({
      status: "ready",
      previewUrl: "http://127.0.0.1:43210",
      framework: "vite",
    });
    expect(manager.getHistory(created.id)).toEqual([
      "queued",
      "analyzing",
      "starting",
      "ready",
    ]);
    await manager.dispose();
  });

  it("returns a useful failed state when the controlled build fails", async () => {
    const { runner } = createRunner({
      start: vi.fn(async () => {
        throw new Error("Verified preview build failed: src/App.tsx has a syntax error");
      }),
    });
    const manager = new PreviewSessionManager({ runner, autoStart: false });
    const session = manager.create(repository);

    await manager.start(session.id);
    expect(manager.get(session.id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("src/App.tsx has a syntax error"),
    });
    await manager.dispose();
  });

  it("expires a ready session and stops its preview process", async () => {
    vi.useFakeTimers();
    const { runner, stop } = createRunner();
    const manager = new PreviewSessionManager({ runner, ttlMs: 1_000, autoStart: false });
    const session = manager.create(repository);
    await manager.start(session.id);

    await vi.advanceTimersByTimeAsync(1_001);

    expect(manager.get(session.id)).toMatchObject({
      status: "expired",
      previewUrl: undefined,
    });
    expect(stop).toHaveBeenCalledOnce();
    await manager.dispose();
  });

  it("cleans up running previews when the manager is disposed", async () => {
    const { runner, stop } = createRunner();
    const manager = new PreviewSessionManager({ runner, autoStart: false });
    const session = manager.create(repository);
    await manager.start(session.id);

    await manager.dispose();

    expect(stop).toHaveBeenCalledOnce();
    expect(manager.get(session.id)).toBeNull();
  });
});
