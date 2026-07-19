import { randomUUID } from "node:crypto";
import type { PreviewSession, PreviewSessionStatus } from "../../types/api";
import type { AllowedRepository } from "./repositories";
import {
  controlledPreviewRunner,
  type PreviewRunner,
  type RunningPreview,
} from "./runner";

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_TTL_MS = 10 * 60 * 1000;

type TimerHandle = ReturnType<typeof setTimeout>;

type SessionRecord = {
  publicSession: PreviewSession;
  repository: AllowedRepository;
  history: PreviewSessionStatus[];
  expiryTimer: TimerHandle;
  runningPreview?: RunningPreview;
};

type SessionManagerOptions = {
  runner?: PreviewRunner;
  ttlMs?: number;
  autoStart?: boolean;
  createId?: () => string;
  setTimer?: (callback: () => void, timeout: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

const allowedTransitions: Record<PreviewSessionStatus, PreviewSessionStatus[]> = {
  queued: ["analyzing", "failed", "expired"],
  analyzing: ["starting", "failed", "expired"],
  starting: ["ready", "failed", "expired"],
  ready: ["failed", "expired"],
  failed: [],
  expired: [],
};

function cloneSession(session: PreviewSession): PreviewSession {
  return { ...session };
}

function configuredTtl(): number {
  const value = Number(process.env.PREVIEW_TTL_MS);
  return Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_SESSION_TTL_MS)
    : DEFAULT_SESSION_TTL_MS;
}

export class PreviewSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly runner: PreviewRunner;
  private readonly ttlMs: number;
  private readonly autoStart: boolean;
  private readonly createId: () => string;
  private readonly setTimer: (callback: () => void, timeout: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.runner = options.runner ?? controlledPreviewRunner;
    this.ttlMs = options.ttlMs ?? configuredTtl();
    this.autoStart = options.autoStart ?? true;
    this.createId = options.createId ?? randomUUID;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  create(repository: AllowedRepository): PreviewSession {
    const id = this.createId();
    const publicSession: PreviewSession = {
      id,
      repoUrl: repository.repoUrl,
      status: "queued",
      framework: repository.framework,
    };
    const expiryTimer = this.setTimer(() => {
      void this.expire(id);
    }, this.ttlMs);
    if (typeof expiryTimer === "object" && "unref" in expiryTimer) expiryTimer.unref();

    this.sessions.set(id, {
      publicSession,
      repository,
      history: ["queued"],
      expiryTimer,
    });

    if (this.autoStart) queueMicrotask(() => void this.start(id));
    return cloneSession(publicSession);
  }

  get(id: string): PreviewSession | null {
    const record = this.sessions.get(id);
    return record ? cloneSession(record.publicSession) : null;
  }

  getHistory(id: string): PreviewSessionStatus[] {
    return [...(this.sessions.get(id)?.history ?? [])];
  }

  async start(id: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record || record.publicSession.status !== "queued") return;

    try {
      this.transition(record, "analyzing");
      const inspection = await this.runner.analyze(record.repository);
      if (this.get(id)?.status === "expired") return;

      this.transition(record, "starting");
      const runningPreview = await this.runner.start(record.repository, inspection);

      if (this.get(id)?.status === "expired") {
        await runningPreview.stop();
        return;
      }

      record.runningPreview = runningPreview;
      runningPreview.onUnexpectedExit((error) => {
        void this.fail(id, error.message);
      });
      this.transition(record, "ready", {
        previewUrl: runningPreview.previewUrl,
        framework: inspection.framework,
      });
    } catch (error) {
      if (this.get(id)?.status === "expired") return;
      await this.fail(
        id,
        error instanceof Error ? error.message : "The verified preview could not be started.",
      );
    }
  }

  async fail(id: string, message: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record || ["failed", "expired"].includes(record.publicSession.status)) return;
    await this.stopRunningPreview(record);
    this.transition(record, "failed", { error: message, previewUrl: undefined });
    this.clearTimer(record.expiryTimer);
  }

  async expire(id: string): Promise<void> {
    const record = this.sessions.get(id);
    if (!record || record.publicSession.status === "expired") return;
    if (record.publicSession.status === "failed") return;
    await this.stopRunningPreview(record);
    this.transition(record, "expired", {
      error: "This temporary preview session has expired.",
      previewUrl: undefined,
    });
    this.clearTimer(record.expiryTimer);
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(async (record) => {
        this.clearTimer(record.expiryTimer);
        await this.stopRunningPreview(record);
      }),
    );
    this.sessions.clear();
  }

  private transition(
    record: SessionRecord,
    status: PreviewSessionStatus,
    updates: Partial<PreviewSession> = {},
  ): void {
    const currentStatus = record.publicSession.status;
    if (!allowedTransitions[currentStatus].includes(status)) {
      throw new Error(`Invalid preview session transition: ${currentStatus} → ${status}.`);
    }
    record.publicSession = { ...record.publicSession, ...updates, status };
    record.history.push(status);
  }

  private async stopRunningPreview(record: SessionRecord): Promise<void> {
    const runningPreview = record.runningPreview;
    record.runningPreview = undefined;
    if (runningPreview) await runningPreview.stop();
  }
}

declare global {
  var __repoLensPreviewSessions: PreviewSessionManager | undefined;
}

export const previewSessionManager =
  globalThis.__repoLensPreviewSessions ?? new PreviewSessionManager();

if (process.env.NODE_ENV !== "production") {
  globalThis.__repoLensPreviewSessions = previewSessionManager;
}
