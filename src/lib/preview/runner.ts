import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupportedFramework } from "../../types/api";
import type { AllowedRepository } from "./repositories";

const MAX_PACKAGE_JSON_BYTES = 64 * 1024;
const MAX_REPOSITORY_FILES = 250;
const MAX_REPOSITORY_BYTES = 2 * 1024 * 1024;
const DEFAULT_START_TIMEOUT_MS = 15_000;
const MAX_START_TIMEOUT_MS = 30_000;
const MAX_ERROR_OUTPUT = 2_000;

export type RepositoryInspection = {
  framework: SupportedFramework;
  scripts: string[];
  fileCount: number;
  totalBytes: number;
};

export type RunningPreview = {
  previewUrl: string;
  onUnexpectedExit: (listener: (error: Error) => void) => void;
  stop: () => Promise<void>;
};

export type PreviewRunner = {
  analyze: (repository: AllowedRepository) => Promise<RepositoryInspection>;
  start: (
    repository: AllowedRepository,
    inspection: RepositoryInspection,
  ) => Promise<RunningPreview>;
};

function getStartTimeout(): number {
  const configured = Number(process.env.PREVIEW_START_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_START_TIMEOUT_MS)
    : DEFAULT_START_TIMEOUT_MS;
}

function createSanitizedEnvironment(homeDirectory: string): NodeJS.ProcessEnv {
  return {
    CI: "1",
    HOME: homeDirectory,
    NODE_ENV: "production",
    NO_COLOR: "1",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    TMPDIR: homeDirectory,
  };
}

async function scanRepository(root: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0;
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (["node_modules", ".git", "dist", ".next"].includes(entry.name)) continue;
      if (entry.name.startsWith(".env") && entry.name !== ".env.example") {
        throw new Error("Verified preview sources may not include environment files.");
      }
      const entryPath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error("Verified preview sources may not contain symbolic links.");
      }

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const metadata = await stat(entryPath);
      fileCount += 1;
      totalBytes += metadata.size;

      if (fileCount > MAX_REPOSITORY_FILES || totalBytes > MAX_REPOSITORY_BYTES) {
        throw new Error(
          `Verified preview exceeds the ${MAX_REPOSITORY_FILES}-file or ${MAX_REPOSITORY_BYTES / 1024 / 1024} MB source limit.`,
        );
      }
    }
  }

  await visit(root);
  return { fileCount, totalBytes };
}

export async function inspectTrustedRepository(
  repository: AllowedRepository,
): Promise<RepositoryInspection> {
  const packagePath = path.join(repository.sourcePath, "package.json");
  const packageMetadata = await stat(packagePath).catch(() => null);

  if (!packageMetadata?.isFile()) {
    throw new Error("The verified repository does not contain a package.json file.");
  }

  if (packageMetadata.size > MAX_PACKAGE_JSON_BYTES) {
    throw new Error("The verified repository package.json exceeds the 64 KB limit.");
  }

  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = Object.keys(packageJson.scripts ?? {}).sort();
  let framework: SupportedFramework | null = null;

  if (typeof dependencies.next === "string") framework = "next";
  else if (typeof dependencies.vite === "string") framework = "vite";
  else if (typeof dependencies.react === "string") framework = "react";

  if (!framework) {
    throw new Error("Only verified React, Next.js, or Vite repositories are supported.");
  }

  if (framework !== repository.framework) {
    throw new Error(
      `The verified repository was configured as ${repository.framework} but was detected as ${framework}.`,
    );
  }

  const size = await scanRepository(repository.sourcePath);
  return { framework, scripts, ...size };
}

function formatProcessError(prefix: string, output: string): Error {
  const detail = output.trim().slice(-MAX_ERROR_OUTPUT);
  return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

async function runControlledBuild(
  repository: AllowedRepository,
  outputDirectory: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  const args = [
    "--max-old-space-size=256",
    viteCli,
    "build",
    repository.sourcePath,
    "--outDir",
    outputDirectory,
    "--emptyOutDir",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Verified preview build exceeded the startup timeout."));
    }, getStartTimeout());

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Verified preview build could not start: ${error.message}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(formatProcessError("Verified preview build failed", output));
    });
  });
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a loopback preview port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServerReady(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Verified preview server exceeded the startup timeout."));
    }, getStartTimeout());

    const handleOutput = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("PREVIEW_READY")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Verified preview server could not start: ${error.message}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(formatProcessError(`Verified preview server exited with code ${code}`, output));
    });
  });
}

export const controlledPreviewRunner: PreviewRunner = {
  analyze: inspectTrustedRepository,

  async start(repository, inspection) {
    if (inspection.framework !== "vite") {
      throw new Error(
        "This controlled runner currently starts only operator-verified Vite sources.",
      );
    }

    const workspace = await mkdtemp(path.join(tmpdir(), "repolens-preview-"));
    const outputDirectory = path.join(workspace, "dist");
    const environment = createSanitizedEnvironment(workspace);
    let child: ChildProcessWithoutNullStreams | null = null;

    try {
      await runControlledBuild(repository, outputDirectory, environment);
      const port = await reservePort();
      const serverScript = path.join(process.cwd(), "scripts", "serve-preview.mjs");
      child = spawn(process.execPath, [
        "--max-old-space-size=64",
        serverScript,
        outputDirectory,
        String(port),
      ], {
        cwd: workspace,
        env: environment,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin.end();
      await waitForServerReady(child);

      let stopped = false;
      const exitListeners = new Set<(error: Error) => void>();
      child.once("exit", (code) => {
        if (stopped) return;
        const error = new Error(
          `Verified preview stopped unexpectedly${code === null ? "" : ` with code ${code}`}.`,
        );
        for (const listener of exitListeners) listener(error);
      });
      return {
        previewUrl: `http://127.0.0.1:${port}`,
        onUnexpectedExit(listener) {
          exitListeners.add(listener);
        },
        async stop() {
          if (stopped) return;
          stopped = true;
          if (child && !child.killed) child.kill("SIGTERM");
          await rm(workspace, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (child && !child.killed) child.kill("SIGKILL");
      await rm(workspace, { recursive: true, force: true });
      throw error;
    }
  },
};
