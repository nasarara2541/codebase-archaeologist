"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CopyButton } from "@/components/copy-button";
import { calculateTraceHighlight, graphEdgeKey } from "@/lib/trace/highlighting";
import type { AnalyzeResult, ArchitectureNode, TraceResult } from "@/types/api";

type ArchitecturePanelProps = {
  analysis: AnalyzeResult | null;
  isLoading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  trace: TraceResult | null;
  onSelectNode: (nodeId: string) => void;
};

const columnByType: Record<ArchitectureNode["type"], number> = {
  route: 0,
  component: 1,
  api: 2,
  file: 3,
};

const colorByType: Record<ArchitectureNode["type"], string> = {
  route: "#d8ff62",
  component: "#7db7ff",
  api: "#c69cff",
  file: "#7f8b9e",
};

function nodeContent(node: ArchitectureNode) {
  return (
    <div className="architecture-node">
      <span>{node.type}</span>
      <strong>{node.label}</strong>
      <small>{node.risky ? "Risky · " : ""}fan-in {node.fanIn}</small>
    </div>
  );
}

export function ArchitecturePanel({
  analysis,
  isLoading,
  error,
  selectedNodeId,
  trace,
  onSelectNode,
}: ArchitecturePanelProps) {
  const traceHighlight = useMemo(
    () => calculateTraceHighlight(analysis?.graph ?? { nodes: [], edges: [] }, trace),
    [analysis, trace],
  );
  const connectedNodeIds = useMemo(() => {
    const connected = new Set<string>();
    if (!analysis || !selectedNodeId) return connected;
    connected.add(selectedNodeId);
    for (const edge of analysis.graph.edges) {
      if (edge.source === selectedNodeId) connected.add(edge.target);
      if (edge.target === selectedNodeId) connected.add(edge.source);
    }
    return connected;
  }, [analysis, selectedNodeId]);

  const flowNodes = useMemo<Node[]>(() => {
    if (!analysis) return [];
    const rowByType: Record<ArchitectureNode["type"], number> = {
      route: 0,
      component: 0,
      api: 0,
      file: 0,
    };

    return analysis.graph.nodes.map((node) => {
      const row = rowByType[node.type]++;
      const isSelected = node.id === selectedNodeId;
      const isConnected = connectedNodeIds.has(node.id);
      const isTraced = traceHighlight.nodeIds.has(node.id);
      const color = colorByType[node.type];
      return {
        id: node.id,
        data: { label: nodeContent(node) },
        position: { x: columnByType[node.type] * 210, y: row * 108 },
        style: {
          width: 174,
          color: "#f5f7fa",
          background: isSelected ? `${color}26` : "#121925",
          border: `${isSelected || isTraced ? 2 : 1}px solid ${isTraced ? "#f7a8ff" : isSelected || isConnected ? color : "#2a3546"}`,
          borderRadius: 10,
          boxShadow: isTraced ? "0 0 0 4px #f7a8ff18" : isSelected ? `0 0 0 4px ${color}14` : "none",
          opacity: trace ? (isTraced ? 1 : 0.28) : selectedNodeId && !isConnected ? 0.4 : 1,
          padding: 0,
        },
      };
    });
  }, [analysis, connectedNodeIds, selectedNodeId, trace, traceHighlight.nodeIds]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!analysis) return [];
    return analysis.graph.edges.map((edge, index) => {
      const highlighted =
        selectedNodeId === edge.source || selectedNodeId === edge.target;
      const traced = traceHighlight.edgeKeys.has(graphEdgeKey(edge.source, edge.target));
      return {
        id: `edge:${index}:${edge.source}:${edge.target}`,
        source: edge.source,
        target: edge.target,
        animated: highlighted || traced,
        style: {
          stroke: traced ? "#f7a8ff" : highlighted ? "#d8ff62" : "#445066",
          strokeWidth: traced || highlighted ? 2.2 : 1.2,
          opacity: trace ? (traced ? 1 : 0.15) : selectedNodeId && !highlighted ? 0.25 : 0.8,
        },
      };
    });
  }, [analysis, selectedNodeId, trace, traceHighlight.edgeKeys]);

  const selectedNode = analysis?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedLocation = selectedNode?.locations[0];
  const selectedFile = analysis?.files.find((file) => file.path === selectedLocation?.file);
  const handleNodeClick: NodeMouseHandler = (_event, node) => onSelectNode(node.id);

  return (
    <aside className="architecture-panel" aria-label="Repository architecture">
      <div className="architecture-panel__heading">
        <div className="panel-heading-with-step">
          <span className="step-number">03</span>
          <div>
            <p className="section-label">Architecture</p>
            <h3>{analysis ? `${analysis.graph.nodes.length} detected nodes` : "Analyzing source"}</h3>
          </div>
        </div>
        {analysis ? <span>{analysis.graph.edges.length} edges</span> : null}
      </div>

      {trace?.steps.length ? (
        <div className="trace-legend" role="status">
          <span />
          Pink nodes and paths are part of the grounded feature trace.
        </div>
      ) : (
        <div className="graph-legend" aria-label="Architecture graph legend">
          <span><i className="legend-route" />Route</span>
          <span><i className="legend-component" />Component</span>
          <span><i className="legend-api" />Service</span>
          <span><i className="legend-file" />File</span>
        </div>
      )}

      {isLoading ? (
        <div className="architecture-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <strong>Mapping routes and components</strong>
          <small>Parsing verified JavaScript and TypeScript source…</small>
        </div>
      ) : error ? (
        <div className="architecture-state architecture-state--error" role="alert">
          <strong>Analysis failed</strong>
          <small>{error}</small>
        </div>
      ) : !analysis || analysis.graph.nodes.length === 0 ? (
        <div className="architecture-state">
          <strong>No architecture yet</strong>
          <small>Start a verified preview to analyze its source.</small>
        </div>
      ) : (
        <>
          <div className="architecture-graph">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              minZoom={0.25}
              maxZoom={1.8}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable
              edgesFocusable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#263143" gap={24} size={1} />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
          </div>

          {selectedNode && selectedLocation ? (
            <section className="node-detail" aria-label="Selected architecture node">
              <p className="source-detail-label">Source details</p>
              <div className="node-detail__title">
                <span style={{ background: colorByType[selectedNode.type] }} />
                <div>
                  <small>{selectedNode.type}</small>
                  <h4>{selectedNode.label}</h4>
                </div>
                {selectedNode.risky ? <strong>Risky</strong> : null}
              </div>
              <dl>
                <div className="source-file-detail">
                  <dt>File</dt>
                  <dd>{selectedLocation.file}</dd>
                  <CopyButton value={selectedLocation.file} label="File path" className="inline-copy-button" />
                </div>
                {selectedLocation.functionName ? (
                  <div><dt>Symbol</dt><dd>{selectedLocation.functionName}</dd></div>
                ) : null}
                {selectedLocation.lineStart ? (
                  <div>
                    <dt>Location</dt>
                    <dd>
                      Lines {selectedLocation.lineStart}
                      {selectedLocation.lineEnd && selectedLocation.lineEnd !== selectedLocation.lineStart
                        ? `–${selectedLocation.lineEnd}`
                        : ""}
                    </dd>
                  </div>
                ) : null}
                <div><dt>Fan-in</dt><dd>{selectedNode.fanIn}</dd></div>
              </dl>
              <div className="relationship-grid">
                <div>
                  <strong>Imports</strong>
                  {selectedFile?.imports.length ? (
                    <ul>{selectedFile.imports.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : <small>None detected</small>}
                </div>
                <div>
                  <strong>Dependents</strong>
                  {selectedFile?.dependents.length ? (
                    <ul>{selectedFile.dependents.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : <small>None detected</small>}
                </div>
              </div>
            </section>
          ) : (
            <p className="node-detail-empty">Select a node to inspect its source relationships.</p>
          )}
        </>
      )}
    </aside>
  );
}
