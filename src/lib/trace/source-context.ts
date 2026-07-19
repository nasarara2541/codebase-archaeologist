import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AnalyzeResult, ArchitectureNode } from "../../types/api";
import type { AnalysisRepository } from "../analyzer/repository-analyzer";

const MAX_CONTEXT_FILES = 7;
const MAX_FILE_CHARACTERS = 6_000;
const MAX_TOTAL_CHARACTERS = 24_000;

export type RelevantSourceContext = {
  nodeIds: string[];
  files: { path: string; source: string }[];
};

function questionTerms(question: string): Set<string> {
  const terms = new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9_$-]+/)
      .filter((term) => term.length > 2),
  );
  const expansions: Record<string, string[]> = {
    settings: ["preferences", "toggle", "save"],
    setting: ["preferences", "toggle", "save"],
    theme: ["settings", "preferences", "styles", "toggle"],
    deployment: ["deployments", "createdeployment", "home"],
    deploy: ["deployment", "deployments", "createdeployment"],
    start: ["main", "entry", "app"],
    begin: ["main", "entry", "app"],
  };
  for (const term of [...terms]) {
    for (const expansion of expansions[term] ?? []) terms.add(expansion);
  }
  return terms;
}

function nodeSearchText(node: ArchitectureNode): string {
  return [
    node.label,
    node.type,
    ...node.locations.flatMap((location) => [location.file, location.functionName ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
}

export function rankRelevantNodes(question: string, analysis: AnalyzeResult): ArchitectureNode[] {
  const terms = questionTerms(question);
  if (terms.size === 0) return [];
  return analysis.graph.nodes
    .map((node) => {
      const haystack = nodeSearchText(node);
      let score = 0;
      for (const term of terms) {
        if (!haystack.includes(term)) continue;
        score += node.label.toLowerCase().includes(term) ? 5 : 2;
        if (node.type === "route" || node.type === "component" || node.type === "api") score += 2;
      }
      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.node.fanIn - a.node.fanIn)
    .slice(0, 8)
    .map((item) => item.node);
}

function relatedNodeIds(seedIds: Set<string>, analysis: AnalyzeResult): Set<string> {
  const related = new Set(seedIds);
  for (const edge of analysis.graph.edges) {
    if (seedIds.has(edge.source)) related.add(edge.target);
    if (seedIds.has(edge.target)) related.add(edge.source);
  }
  return related;
}

export async function selectRelevantSourceContext(
  question: string,
  analysis: AnalyzeResult,
  repository: AnalysisRepository,
): Promise<RelevantSourceContext> {
  const ranked = rankRelevantNodes(question, analysis);
  if (ranked.length === 0) return { nodeIds: [], files: [] };

  const nodeIds = relatedNodeIds(new Set(ranked.map((node) => node.id)), analysis);
  const rankedPaths = new Set(ranked.flatMap((node) => node.locations.map((location) => location.file)));
  const relatedPaths = new Set(
    analysis.graph.nodes
      .filter((node) => nodeIds.has(node.id))
      .flatMap((node) => node.locations.map((location) => location.file)),
  );
  const filePaths = [...rankedPaths, ...relatedPaths].slice(0, MAX_CONTEXT_FILES);
  const root = path.resolve(repository.sourcePath);
  let remaining = MAX_TOTAL_CHARACTERS;
  const files: RelevantSourceContext["files"] = [];

  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) continue;
    const source = await readFile(absolutePath, "utf8").catch(() => null);
    if (source === null) continue;
    const excerpt = source.slice(0, Math.min(MAX_FILE_CHARACTERS, remaining));
    if (!excerpt) continue;
    files.push({ path: relativePath, source: excerpt });
    remaining -= excerpt.length;
    if (remaining <= 0) break;
  }

  return { nodeIds: [...nodeIds], files };
}
