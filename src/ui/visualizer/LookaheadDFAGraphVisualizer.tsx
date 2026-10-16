/**
 * Interactive SVG Lookahead DFA Graph Visualizer powered by Dagre layout.
 *
 * Visualizes the runtime Lookahead DFA materialized for an ALL(*) decision point
 * as described in:
 * Parr, T., Harwell, S., & Fisher, K. (2014).
 * Adaptive LL(*) Parsing: The Power of Dynamic Analysis. ACM PLDI '14.
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { LookaheadDFA, DFAState } from '../../core/all/allPredictor';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';

interface LookaheadDFAGraphVisualizerProps {
  dfa: LookaheadDFA;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  activeStateId?: number | null;
  activeEdge?: { from: number; to: number; token: string } | null;
  lang?: Language;
  filename?: string;
}

interface DFALayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: DFAState;
  uniqueAlts: number[];
}

interface DFALayoutEdge {
  from: number;
  to: number;
  label: string;
  symbols: string[];
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 68;

export const LookaheadDFAGraphVisualizer: React.FC<LookaheadDFAGraphVisualizerProps> = ({
  dfa,
  selectedStateId,
  onSelectState,
  activeStateId,
  activeEdge,
  lang = 'en',
  filename = 'all_lookahead_dfa'
}) => {
  const isCz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrowMarkerId = useId();
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Compute Dagre layout
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 40,
      ranksep: 60,
      marginx: 30,
      marginy: 30
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Register nodes
    for (const s of dfa.states) {
      g.setNode(String(s.id), {
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    }

    // Merge multi-symbol transitions between same source and target
    const mergedEdges = new Map<string, { from: number; to: number; symbols: string[] }>();
    for (const s of dfa.states) {
      for (const [sym, targetId] of Object.entries(s.edges)) {
        const key = `${s.id}->${targetId}`;
        if (!mergedEdges.has(key)) {
          mergedEdges.set(key, { from: s.id, to: targetId, symbols: [] });
        }
        mergedEdges.get(key)!.symbols.push(sym);
      }
    }

    for (const e of mergedEdges.values()) {
      const label = e.symbols.map(s => `'${s}'`).join(', ');
      g.setEdge(String(e.from), String(e.to), {
        label,
        width: Math.max(30, label.length * 7 + 14),
        height: 20,
        labelpos: 'c'
      });
    }

    dagre.layout(g);

    const nodes: DFALayoutNode[] = dfa.states.map(s => {
      const n = g.node(String(s.id));
      const uniqueAlts = Array.from(new Set(s.configs.map(c => c.alt))).sort((a, b) => a - b);
      return {
        id: s.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        state: s,
        uniqueAlts
      };
    });

    const edges: DFALayoutEdge[] = [...mergedEdges.values()].map(e => {
      const data = g.edge(String(e.from), String(e.to));
      const points = data?.points || [];
      const mid = points[Math.floor(points.length / 2)] || { x: 0, y: 0 };
      const labelPos = data && typeof data.x === 'number' && typeof data.y === 'number' ? { x: data.x, y: data.y } : mid;
      return {
        from: e.from,
        to: e.to,
        label: e.symbols.map(s => `'${s}'`).join(', '),
        symbols: e.symbols,
        points,
        labelPos
      };
    });

    const info = g.graph();
    return {
      nodes,
      edges,
      width: Math.max(400, (info.width || 600) + 60),
      height: Math.max(260, (info.height || 300) + 60)
    };
  }, [dfa]);

  const { view, fit, zoomBy, onPointerDown, isDragging } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  const exportBounds = { width: layout.width, height: layout.height };
  const exportTransform = 'translate(30, 30)';

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
      style={{ height: '380px', cursor: isDragging ? 'grabbing' : 'grab', position: 'relative' }}
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

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <defs>
          <marker
            id={arrowMarkerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-text-muted)" />
          </marker>
          <marker
            id={`${arrowMarkerId}-active`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-primary)" />
          </marker>
        </defs>

        <g data-viewport transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {/* Edges */}
          {layout.edges.map(e => {
            const isEdgeActive = activeEdge && activeEdge.from === e.from && activeEdge.to === e.to;
            const pathData = edgePath(e.points);
            return (
              <g key={`${e.from}->${e.to}`} className="dfa-edge">
                <path
                  d={pathData}
                  fill="none"
                  stroke={isEdgeActive ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={isEdgeActive ? 2.5 : 1.5}
                  markerEnd={`url(#${isEdgeActive ? `${arrowMarkerId}-active` : arrowMarkerId})`}
                />
                {/* Edge Label Pill */}
                <g transform={`translate(${e.labelPos.x}, ${e.labelPos.y})`}>
                  <rect
                    x={-Math.max(20, e.label.length * 3.5 + 6)}
                    y={-10}
                    width={Math.max(40, e.label.length * 7 + 12)}
                    height={20}
                    rx={4}
                    ry={4}
                    fill="var(--color-bg-base)"
                    stroke={isEdgeActive ? 'var(--color-primary)' : 'var(--color-border)'}
                    strokeWidth={isEdgeActive ? 1.5 : 1}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isEdgeActive ? 'var(--color-primary)' : 'var(--color-text)'}
                    fontSize="11px"
                    fontFamily="monospace"
                    fontWeight={isEdgeActive ? 600 : 500}
                  >
                    {e.label}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Nodes */}
          {layout.nodes.map(n => {
            const isStart = n.id === dfa.startStateId;
            const isSelected = selectedStateId === n.id;
            const isActive = activeStateId === n.id;
            const isAccept = n.state.isAcceptState && n.state.predictedAlt !== undefined;

            let borderColor = 'var(--color-border)';
            let bgColor = 'var(--color-bg-surface)';

            if (isSelected) {
              borderColor = 'var(--color-primary)';
            } else if (isActive) {
              borderColor = 'var(--color-primary)';
              bgColor = 'var(--color-primary-subtle)';
            } else if (isAccept) {
              borderColor = 'var(--color-success)';
            }

            return (
              <g
                key={n.id}
                transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
                onClick={() => onSelectState?.(n.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Start state incoming arrow pointer */}
                {isStart && (
                  <g transform="translate(-24, 34)">
                    <path d="M 0 0 L 16 0" stroke="var(--color-primary)" strokeWidth="2" markerEnd={`url(#${arrowMarkerId}-active)`} />
                    <text x="-4" y="-5" fontSize="10px" fill="var(--color-primary)" fontWeight={600} textAnchor="end">
                      start
                    </text>
                  </g>
                )}

                {/* State Card Background */}
                <rect
                  width={n.width}
                  height={n.height}
                  rx={8}
                  ry={8}
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth={isSelected ? 2.5 : isActive ? 2 : isAccept ? 1.8 : 1.2}
                />

                {/* State Header: s{id} and accept badge */}
                <text
                  x={12}
                  y={22}
                  fontSize="13px"
                  fontWeight={700}
                  fill="var(--color-text)"
                >
                  s{n.id}
                </text>

                {isAccept ? (
                  <g transform={`translate(${n.width - 76}, 8)`}>
                    <rect
                      width={66}
                      height={18}
                      rx={3}
                      fill="var(--color-success-subtle)"
                      stroke="var(--color-success)"
                      strokeWidth={1}
                    />
                    <text
                      x={33}
                      y={10}
                      fontSize="10px"
                      fontWeight={600}
                      fill="var(--color-success)"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      Alt {n.state.predictedAlt}
                    </text>
                  </g>
                ) : (
                  <g transform={`translate(${n.width - 66}, 8)`}>
                    <rect
                      width={56}
                      height={18}
                      rx={3}
                      fill="var(--color-bg-base)"
                      stroke="var(--color-border)"
                      strokeWidth={1}
                    />
                    <text
                      x={28}
                      y={10}
                      fontSize="10px"
                      fill="var(--color-text-muted)"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {isCz ? 'Hledá se' : 'Pending'}
                    </text>
                  </g>
                )}

                {/* Configurations and Viable Alternatives Info */}
                <text
                  x={12}
                  y={42}
                  fontSize="11px"
                  fill="var(--color-text-muted)"
                >
                  {isCz ? `Konfigurace: ${n.state.configs.length}` : `Configurations: ${n.state.configs.length}`}
                </text>
                <text
                  x={12}
                  y={56}
                  fontSize="11px"
                  fill={isAccept ? 'var(--color-success)' : 'var(--color-text)'}
                  fontWeight={500}
                >
                  {isCz ? `Živé alts: [${n.uniqueAlts.join(', ')}]` : `Viable alts: [${n.uniqueAlts.join(', ')}]`}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
