/**
 * Interactive SVG Graph-Structured Stack (GSS) Visualizer powered by Dagre layout.
 *
 * Visualizes the runtime Graph-Structured Stack for Generalized LR (GLR) parsing
 * as described in:
 * - Tomita, M. (1986). Efficient Parsing for Natural Language: A Fast Algorithm for Practical Systems.
 * - Scott, E., & Johnstone, A. (2006). Right Nulled Generalized LR Parsers (RNGLR).
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { GSSSnapshot, GSSSnapshotNode } from '../../core/lr/glrParser';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';

interface GSSGraphVisualizerProps {
  snapshot: GSSSnapshot;
  selectedNodeId?: number | null;
  onSelectNode?: (nodeId: number | null) => void;
  lang?: Language;
  filename?: string;
}

interface GSSLayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  node: GSSSnapshotNode;
}

interface GSSLayoutEdge {
  from: number;
  to: number;
  symbol: string;
  count: number;
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const GSS_NODE_WIDTH = 130;
const GSS_NODE_HEIGHT = 50;
const MARGIN = 30;

export const GSSGraphVisualizer: React.FC<GSSGraphVisualizerProps> = ({
  snapshot,
  selectedNodeId,
  onSelectNode,
  lang = 'en',
  filename = 'glr_graph_structured_stack'
}) => {
  const isCz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markerId = useId().replace(/:/g, '');
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Compute Dagre layout
  const layout = useMemo(() => {
    if (!snapshot || snapshot.nodes.length === 0) {
      return { nodes: [], edges: [], width: 400, height: 250 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 35,
      ranksep: 55,
      marginx: MARGIN,
      marginy: MARGIN
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of snapshot.nodes) {
      g.setNode(String(node.id), {
        width: GSS_NODE_WIDTH,
        height: GSS_NODE_HEIGHT
      });
    }

    // In GSS, edges go child -> parent in data, but for visualization LR rankdir,
    // drawing parent -> child (left to right) shows chronological stack growth.
    for (const edge of snapshot.edges) {
      g.setEdge(String(edge.toId), String(edge.fromId), {
        width: 30,
        height: 18
      });
    }

    dagre.layout(g);

    const layoutNodes: GSSLayoutNode[] = snapshot.nodes.map(node => {
      const dagreNode = g.node(String(node.id));
      return {
        id: node.id,
        x: dagreNode ? dagreNode.x : 0,
        y: dagreNode ? dagreNode.y : 0,
        width: GSS_NODE_WIDTH,
        height: GSS_NODE_HEIGHT,
        node
      };
    });

    const layoutEdges: GSSLayoutEdge[] = snapshot.edges.map(edge => {
      const dagreEdge = g.edge(String(edge.toId), String(edge.fromId));
      return {
        from: edge.toId,
        to: edge.fromId,
        symbol: edge.symbol,
        count: edge.count,
        points: dagreEdge && dagreEdge.points ? dagreEdge.points : [],
        labelPos: dagreEdge && typeof dagreEdge.x === 'number' && typeof dagreEdge.y === 'number'
          ? { x: dagreEdge.x, y: dagreEdge.y }
          : { x: 0, y: 0 }
      };
    });

    const graphInfo = g.graph();
    const width = Math.max(graphInfo.width || 400, 300);
    const height = Math.max(graphInfo.height || 250, 180);

    return { nodes: layoutNodes, edges: layoutEdges, width, height };
  }, [snapshot]);

  const { view, fit, zoomBy, onPointerDown, isDragging } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  const exportBounds = { width: Math.ceil(layout.width + 2 * MARGIN), height: Math.ceil(layout.height + 2 * MARGIN) };
  const exportTransform = `translate(${MARGIN}, ${MARGIN})`;

  const handleExportPng = async () => {
    if (!svgRef.current || isExportingPng) return;
    setIsExportingPng(true);
    try {
      await exportPngFile(svgRef.current, filename, exportBounds, 2, exportTransform);
    } catch (err) {
      console.error('Failed to export PNG:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{
        position: 'relative',
        width: '100%',
        height: '340px',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-base)',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
      onPointerDown={onPointerDown}
    >
      <GraphToolbar
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onFit={fit}
        onExportSvg={() => svgRef.current && exportSvgFile(svgRef.current, filename, exportBounds, exportTransform)}
        onExportPng={handleExportPng}
        isExportingPng={isExportingPng}
        lang={lang}
      />

      <div className="graph-caption" style={{ pointerEvents: 'none' }}>
        {isCz
          ? 'Kliknutím na vrchol zobrazíte podrobnosti: jak vznikl, položky gramatiky a vazbu na strom'
          : 'Click any node to inspect how it was created, its grammar items, and link to the tree'}
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        onClick={() => onSelectNode?.(null)}
      >
        <defs>
          <marker
            id={`${markerId}-arrow`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-border-strong, #888)" />
          </marker>
        </defs>

        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {/* Edges */}
          <g className="gss-edges">
            {layout.edges.map((e, idx) => {
              const pathData = edgePath(e.points);
              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke="var(--color-border-strong, #888)"
                    strokeWidth="1.8"
                    markerEnd={`url(#${markerId}-arrow)`}
                  />
                  {e.labelPos && (
                    <g transform={`translate(${e.labelPos.x}, ${e.labelPos.y})`}>
                      <rect
                        x="-18"
                        y="-11"
                        width={e.count > 1 ? 46 : 36}
                        height="20"
                        rx="4"
                        fill="var(--color-bg-base)"
                        stroke="var(--color-border)"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="var(--color-primary)"
                      >
                        {e.symbol}
                        {e.count > 1 && (
                          <tspan fill="var(--color-warning, #e67e22)" fontSize="9">
                            {' '}×{e.count}
                          </tspan>
                        )}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g className="gss-nodes">
            {layout.nodes.map(n => {
              const isHead = n.node.isHead;
              const isSelected = selectedNodeId === n.id;
              const strokeColor = isSelected
                ? 'var(--color-primary)'
                : isHead
                  ? 'var(--color-accent, #3b82f6)'
                  : 'var(--color-border)';

              return (
                <g
                  key={`node-${n.id}`}
                  transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onSelectNode?.(selectedNodeId === n.id ? null : n.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Halo for selection */}
                  {isSelected && (
                    <rect
                      x="-5"
                      y="-5"
                      width={n.width + 10}
                      height={n.height + 10}
                      rx="12"
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="2.5"
                      style={{ filter: 'drop-shadow(0 0 6px var(--color-primary))' }}
                    />
                  )}

                  {/* Halo for active heads */}
                  {isHead && !isSelected && (
                    <rect
                      x="-3"
                      y="-3"
                      width={n.width + 6}
                      height={n.height + 6}
                      rx="10"
                      fill="none"
                      stroke="var(--color-accent, #3b82f6)"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                      opacity="0.8"
                    />
                  )}

                  <rect
                    width={n.width}
                    height={n.height}
                    rx="8"
                    fill="var(--color-bg-surface, #fff)"
                    stroke={strokeColor}
                    strokeWidth={isHead || isSelected ? 2 : 1.2}
                    style={{
                      filter: isHead ? 'drop-shadow(0 2px 6px rgba(59, 130, 246, 0.25))' : undefined,
                      transition: 'all 0.2s ease'
                    }}
                  />

                  {/* State Label */}
                  <text
                    x="12"
                    y="24"
                    fontSize="13"
                    fontWeight="700"
                    fill="var(--color-text)"
                  >
                    {n.node.label}
                  </text>

                  {/* Level Tag */}
                  <text
                    x="12"
                    y="40"
                    fontSize="10"
                    fill="var(--color-text-muted)"
                  >
                    {isCz ? `Úroveň ${n.node.level}` : `Level ${n.node.level}`}
                  </text>

                  {/* Head Badge */}
                  {isHead && (
                    <g transform={`translate(${n.width - 48}, 8)`}>
                      <rect
                        width="40"
                        height="16"
                        rx="4"
                        fill="var(--color-accent, #3b82f6)"
                      />
                      <text
                        x="20"
                        y="11"
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill="#ffffff"
                      >
                        HEAD
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
};
