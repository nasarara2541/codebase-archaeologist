import type { ArchitectureGraph, CodeLocation, TraceResult } from "../../types/api";

export type TraceHighlight = {
  nodeIds: Set<string>;
  edgeKeys: Set<string>;
  stepNodeIds: string[];
};

export function graphEdgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

function matchingNodeIds(graph: ArchitectureGraph, location: CodeLocation): string[] {
  const exact = graph.nodes.filter((node) =>
    node.locations.some(
      (candidate) =>
        candidate.file === location.file &&
        Boolean(location.functionName) &&
        candidate.functionName === location.functionName,
    ),
  );
  if (exact.length > 0) return exact.map((node) => node.id);

  const fileNode = graph.nodes.find(
    (node) => node.type === "file" && node.locations.some((item) => item.file === location.file),
  );
  return fileNode ? [fileNode.id] : [];
}

export function findTraceNodeId(graph: ArchitectureGraph, location: CodeLocation): string | null {
  return matchingNodeIds(graph, location)[0] ?? null;
}

function shortestPath(graph: ArchitectureGraph, start: string, end: string): string[] {
  if (start === end) return [start];
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  const queue: string[][] = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift()!;
    for (const neighbor of adjacency.get(path.at(-1)!) ?? []) {
      if (visited.has(neighbor)) continue;
      const next = [...path, neighbor];
      if (neighbor === end) return next;
      visited.add(neighbor);
      queue.push(next);
    }
  }
  return [];
}

export function calculateTraceHighlight(
  graph: ArchitectureGraph,
  trace: TraceResult | null,
): TraceHighlight {
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  if (!trace) return { nodeIds, edgeKeys, stepNodeIds: [] };

  const stepNodeIds = trace.steps.map((step) => matchingNodeIds(graph, step.location)[0] ?? "");
  for (const step of trace.steps) {
    for (const id of matchingNodeIds(graph, step.location)) nodeIds.add(id);
    const fileId = graph.nodes.find(
      (node) => node.type === "file" && node.locations.some((item) => item.file === step.location.file),
    )?.id;
    if (fileId) nodeIds.add(fileId);
  }

  for (let index = 1; index < stepNodeIds.length; index += 1) {
    const previous = stepNodeIds[index - 1];
    const current = stepNodeIds[index];
    if (!previous || !current) continue;
    for (const id of shortestPath(graph, previous, current)) nodeIds.add(id);
  }
  for (const edge of graph.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeKeys.add(graphEdgeKey(edge.source, edge.target));
    }
  }
  return { nodeIds, edgeKeys, stepNodeIds };
}
