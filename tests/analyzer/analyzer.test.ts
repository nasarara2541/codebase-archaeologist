import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectReactComponents,
  parseRelativeImports,
} from "../../src/lib/analyzer/parser";
import {
  SourceAnalysisError,
  analyzeRepository,
  calculateFanInAndRisk,
  inferRouteFromFile,
} from "../../src/lib/analyzer/repository-analyzer";
import {
  BUNDLED_FIXTURE_REPO_URL,
  DIGITALOCEAN_SAMPLE_REPO_URL,
} from "../../src/lib/preview/constants";
import type { ArchitectureNode } from "../../src/types/api";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("source parsing", () => {
  it("parses static, exported, required, and dynamic relative imports", () => {
    const imports = parseRelativeImports(
      `
        import Header from "./Header";
        export { loadCart } from "../services/cart";
        const helper = require("./helper");
        const lazy = import("./LazyPanel");
        import React from "react";
      `,
      "src/App.tsx",
    );

    expect(imports.map((item) => item.specifier)).toEqual([
      "./Header",
      "../services/cart",
      "./helper",
      "./LazyPanel",
    ]);
  });

  it("detects function, arrow, and class React components", () => {
    const components = detectReactComponents(
      `
        import React from "react";
        export function Header() { return <header>Header</header>; }
        export const SettingsPanel = () => <section>Settings</section>;
        export class LegacyCard extends React.Component {
          render() { return <article>Legacy</article>; }
        }
        function helper() { return "not a component"; }
      `,
      "src/components.tsx",
    );

    expect(components.map((component) => component.name)).toEqual([
      "Header",
      "SettingsPanel",
      "LegacyCard",
    ]);
    expect(components[0].location).toMatchObject({
      file: "src/components.tsx",
      functionName: "Header",
    });
  });
});

describe("route detection", () => {
  it("detects Next.js app routes, pages routes, and Page components", () => {
    expect(inferRouteFromFile("src/app/settings/page.tsx")).toBe("/settings");
    expect(inferRouteFromFile("src/pages/account/index.tsx")).toBe("/account");
    expect(inferRouteFromFile("src/pages/index.tsx")).toBe("/");
    expect(inferRouteFromFile("src/views/HomePage.tsx", "HomePage")).toBe("/");
    expect(inferRouteFromFile("src/views/BillingHistoryPage.tsx", "BillingHistoryPage"))
      .toBe("/billing-history");
  });
});

describe("architecture graph construction", () => {
  it("builds routes, components, APIs, files, imports, and entry points", async () => {
    const analysis = await analyzeRepository(
      {
        repoUrl: BUNDLED_FIXTURE_REPO_URL,
        sourcePath: path.join(process.cwd(), "fixtures", "sample-repo"),
        framework: "vite",
        source: "bundled",
      },
      "fixture-session",
    );

    expect(analysis.routes).toEqual(["/", "/settings"]);
    expect(analysis.entryPoints).toContainEqual({ file: "src/main.tsx", lineStart: 1 });
    expect(new Set(analysis.graph.nodes.map((node) => node.type))).toEqual(
      new Set(["route", "component", "api", "file"]),
    );
    expect(analysis.graph.edges).toContainEqual({
      source: "file:src/main.tsx",
      target: "file:src/App.tsx",
    });
    expect(analysis.files.find((file) => file.path === "src/App.tsx")?.imports).toEqual([
      "src/components/AppShell.tsx",
      "src/pages/HomePage.tsx",
      "src/pages/SettingsPage.tsx",
    ]);
  });

  it("detects the DigitalOcean App route and JavaScript entry point", async () => {
    const analysis = await analyzeRepository(
      {
        repoUrl: DIGITALOCEAN_SAMPLE_REPO_URL,
        sourcePath: path.join(
          process.cwd(),
          "fixtures",
          "verified",
          "digitalocean-sample-vite-react",
        ),
        framework: "vite",
        source: "configured",
      },
      "digitalocean-session",
    );

    expect(analysis.routes).toEqual(["/"]);
    expect(analysis.files.map((file) => file.path)).toEqual([
      ".eslintrc.cjs",
      "sammy.js",
      "src/App.jsx",
      "src/main.jsx",
      "vite.config.js",
    ]);
    expect(analysis.graph.nodes).toContainEqual(
      expect.objectContaining({ label: "App", type: "component" }),
    );
    expect(analysis.entryPoints).toEqual([{ file: "src/main.jsx", lineStart: 1 }]);
  });

  it("calculates unique fan-in and flags unusually central nodes", () => {
    const nodes: ArchitectureNode[] = ["a", "b", "c", "central"].map((id) => ({
      id,
      label: id,
      type: "file",
      locations: [{ file: `${id}.ts` }],
      fanIn: 0,
      risky: false,
    }));
    const scored = calculateFanInAndRisk(nodes, [
      { source: "a", target: "central" },
      { source: "b", target: "central" },
      { source: "c", target: "central" },
      { source: "a", target: "central" },
    ]);

    expect(scored.find((node) => node.id === "central")).toMatchObject({
      fanIn: 3,
      risky: true,
    });
    expect(scored.find((node) => node.id === "a")?.risky).toBe(false);
  });
});

describe("invalid sources", () => {
  it("rejects a missing source directory", async () => {
    await expect(
      analyzeRepository(
        {
          repoUrl: BUNDLED_FIXTURE_REPO_URL,
          sourcePath: "/definitely/missing/repolens-source",
          framework: "vite",
          source: "bundled",
        },
        "missing-session",
      ),
    ).rejects.toBeInstanceOf(SourceAnalysisError);
  });

  it("returns an empty graph for a repository with no supported source files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "repolens-empty-source-"));
    temporaryDirectories.push(directory);
    await expect(
      analyzeRepository(
        {
          repoUrl: BUNDLED_FIXTURE_REPO_URL,
          sourcePath: directory,
          framework: "vite",
          source: "bundled",
        },
        "empty-session",
      ),
    ).resolves.toMatchObject({ files: [], routes: [], graph: { nodes: [], edges: [] } });
  });
});
