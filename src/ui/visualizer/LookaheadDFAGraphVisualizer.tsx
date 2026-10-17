/**
 * Interactive SVG Lookahead DFA Graph Visualizer powered by Dagre layout.
 *
 * Visualizes the lookahead DFA of one ALL(*) decision as built by SLL prediction
 * (Parr, Harwell & Fisher 2014, §4.4, §5.4): every DFA state is a set of ATN
 * configurations (p, i, γ) shown as dotted items, edges are lookahead symbols.
 * With `upToClock` only the states and edges that existed at that moment of the
 * simulation are drawn.
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { LookaheadDFA, DFAState, describeConfig, displaySymbol } from '../../core/all/allPredictor';
import { ATN } from '../../core/all/allAtn';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';

interface LookaheadDFAGraphVisualizerProps {
  dfa: LookaheadDFA;
  atn: ATN;
  /** Show the DFA as it was at this value of the DFA clock (undefined = everything) */
  upToClock?: number;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  activeStateId?: number | null;
  activeEdge?: { from: number; to: number } | null;
  lang?: Language;
  filename?: string;
  height?: string;
}

export type DFAStateStatus = 'accept' | 'conflict' | 'open';

export function dfaStateStatus(s: DFAState): DFAStateStatus {
  if (s.isAcceptState && s.predictedAlt !== undefined) return 'accept';
  if (s.stackSensitive) return 'conflict';
  return 'open';
}

/** Short label used by the graph and the table alike */
export function dfaStateStatusLabel(s: DFAState, cz: boolean): string {
  switch (dfaStateStatus(s)) {
    case 'accept': return cz ? `předpovídá alt. ${s.predictedAlt}` : `predicts alt ${s.predictedAlt}`;
    case 'conflict': return cz ? 'konflikt SLL → LL' : 'SLL conflict → LL';
    default: return cz ? 'čte dál' : 'needs more lookahead';
  }
}

/** The DFA restricted to what existed at `clock` */
export function dfaAtClock(dfa: LookaheadDFA, clock?: number): { states: DFAState[]; edges: { from: number; to: number; symbol: string }[] } {
  const states = dfa.states.filter(s => clock === undefined || s.createdAt <= clock);
  const ids = new Set(states.map(s => s.id));
  const edges: { from: number; to: number; symbol: string }[] = [];
  for (const s of states) {
    for (const [sym, to] of Object.entries(s.edges)) {
      if (!ids.has(to)) continue;
      if (clock !== undefined && (s.edgeCreatedAt[sym] ?? 0) > clock) continue;
      edges.push({ from: s.id, to, symbol: sym });
    }
  }
  return { states, edges };
}

interface DFALayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: DFAState;
  lines: string[];
  more: number;
  uniqueAlts: number[];
}

interface DFALayoutEdge {
  from: number;
  to: number;
  label: string;
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const NODE_WIDTH = 240;
const MAX_LINES = 3;
const LINE_H = 13;
const nodeHeight = (lines: number, more: number) => 46 + (lines + (more > 0 ? 1 : 0)) * LINE_H;

export const LookaheadDFAGraphVisualizer: React.FC<LookaheadDFAGraphVisualizerProps> = ({
  dfa,
  atn,
  upToClock,
  selectedStateId,
  onSelectState,
  activeStateId,
  activeEdge,
  lang = 'en',
  filename = 'all_lookahead_dfa',
  height = '380px'
}) => {
  const isCz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrowMarkerId = useId();
  const [isExportingPng, setIsExportingPng] = useState(false);

  // The DFA object is filled during the simulation, so the layout also depends on its size.
  const edgeCount = dfa.states.reduce((n, s) => n + Object.keys(s.edges).length, 0);
  const layout = useMemo(() => {
    const { states, edges } = dfaAtClock(dfa, upToClock);
    const g = new dagre.graphlib.Graph({ multigraph: false });
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 56, marginx: 30, marginy: 30 });
    g.setDefaultEdgeLabel(() => ({}));

    const info = new Map<number, { lines: string[]; more: number }>();
    for (const s of states) {
      const all = s.configs.map(c => describeConfig(atn, c));
      const lines = all.slice(0, MAX_LINES);
      info.set(s.id, { lines, more: all.length - lines.length });
      g.setNode(String(s.id), { width: NODE_WIDTH, height: nodeHeight(lines.length, all.length - lines.length) });
    }

    // Merge multi-symbol transitions between same source and target
    const merged = new Map<string, { from: number; to: number; symbols: string[] }>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      if (!merged.has(key)) merged.set(key, { from: e.from, to: e.to, symbols: [] });
      merged.get(key)!.symbols.push(displaySymbol(e.symbol));
    }
    for (const e of merged.values()) {
      const label = e.symbols.join(', ');
      g.setEdge(String(e.from), String(e.to), { label, width: Math.max(24, label.length * 7 + 14), height: 20, labelpos: 'c' });
    }

    dagre.layout(g);

    const nodes: DFALayoutNode[] = states.map(s => {
      const n = g.node(String(s.id));
      const { lines, more } = info.get(s.id)!;
      return {
        id: s.id, x: n.x, y: n.y, width: n.width, height: n.height, state: s, lines, more,
        uniqueAlts: Array.from(new Set(s.configs.map(c => c.alt))).sort((a, b) => a - b)
      };
    });
    const layoutEdges: DFALayoutEdge[] = [...merged.values()].map(e => {
      const data = g.edge(String(e.from), String(e.to));
      const points = data?.points || [];
      const mid = points[Math.floor(points.length / 2)] || { x: 0, y: 0 };
      const labelPos = data && typeof data.x === 'number' && typeof data.y === 'number' ? { x: data.x, y: data.y } : mid;
      return { from: e.from, to: e.to, label: e.symbols.join(', '), points, labelPos };
    });

    const gi = g.graph();
    return {
      nodes,
      edges: layoutEdges,
      width: Math.max(400, (gi.width || 600) + 60),
      height: Math.max(220, (gi.height || 300) + 60)
    };
    // edgeCount and states.length: the DFA is mutated in place while parsing
  }, [dfa, atn, upToClock, dfa.states.length, edgeCount]);

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
      style={{ height, cursor: isDragging ? 'grabbing' : 'grab', position: 'relative' }}
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

      <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-text-muted)" />
          </marker>
          <marker id={`${arrowMarkerId}-active`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-primary)" />
          </marker>
        </defs>

        <g data-viewport transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {layout.edges.map(e => {
            const isEdgeActive = !!activeEdge && activeEdge.from === e.from && activeEdge.to === e.to;
            const w = Math.max(24, e.label.length * 7 + 12);
            return (
              <g key={`${e.from}->${e.to}`} className="dfa-edge">
                <path
                  d={edgePath(e.points)}
                  fill="none"
                  stroke={isEdgeActive ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={isEdgeActive ? 2.5 : 1.5}
                  markerEnd={`url(#${isEdgeActive ? `${arrowMarkerId}-active` : arrowMarkerId})`}
                />
                <g transform={`translate(${e.labelPos.x}, ${e.labelPos.y})`}>
                  <rect x={-w / 2} y={-10} width={w} height={20} rx={4} ry={4}
                    fill="var(--color-bg-base)"
                    stroke={isEdgeActive ? 'var(--color-primary)' : 'var(--color-border)'}
                    strokeWidth={isEdgeActive ? 1.5 : 1} />
                  <text textAnchor="middle" dominantBaseline="middle"
                    fill={isEdgeActive ? 'var(--color-primary)' : 'var(--color-text)'}
                    fontSize="11px" fontFamily="monospace" fontWeight={isEdgeActive ? 700 : 500}>
                    {e.label}
                  </text>
                </g>
              </g>
            );
          })}

          {layout.nodes.map(n => {
            const isStart = n.id === dfa.startStateId;
            const isSelected = selectedStateId === n.id;
            const isActive = activeStateId === n.id;
            const status = dfaStateStatus(n.state);
            const statusColor = status === 'accept' ? 'var(--color-success)' : status === 'conflict' ? 'var(--color-warning)' : 'var(--color-text-muted)';
            const statusBg = status === 'accept' ? 'var(--color-success-subtle)' : status === 'conflict' ? 'var(--color-warning-subtle)' : 'var(--color-bg-base)';
            const borderColor = isActive || isSelected ? 'var(--color-primary)' : status === 'open' ? 'var(--color-border)' : statusColor;
            const label = dfaStateStatusLabel(n.state, isCz);
            const badgeW = label.length * 6.2 + 14;

            return (
              <g
                key={n.id}
                transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
                onClick={() => onSelectState?.(n.id)}
                style={{ cursor: 'pointer' }}
              >
                {isStart && (
                  <g transform={`translate(-24, ${n.height / 2})`}>
                    <path d="M 0 0 L 16 0" stroke="var(--color-primary)" strokeWidth="2" markerEnd={`url(#${arrowMarkerId}-active)`} />
                    <text x="-4" y="-5" fontSize="10px" fill="var(--color-primary)" fontWeight={600} textAnchor="end">start</text>
                  </g>
                )}
                <rect
                  width={n.width}
                  height={n.height}
                  rx={8}
                  ry={8}
                  fill={isActive ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)'}
                  stroke={borderColor}
                  strokeWidth={isActive ? 3 : isSelected ? 2.5 : status === 'open' ? 1.2 : 1.8}
                  strokeDasharray={isSelected && !isActive ? '5 3' : undefined}
                />
                <text x={12} y={21} fontSize="13px" fontWeight={700} fill="var(--color-text)">
                  {isStart ? `s${n.id} = D0` : `s${n.id}`}
                </text>
                <g transform={`translate(${n.width - badgeW - 8}, 8)`}>
                  <rect width={badgeW} height={18} rx={3} fill={statusBg} stroke={statusColor} strokeWidth={1} />
                  <text x={badgeW / 2} y={10} fontSize="10px" fontWeight={600} fill={statusColor} textAnchor="middle" dominantBaseline="middle">
                    {label}
                  </text>
                </g>
                <text x={12} y={38} fontSize="10px" fill="var(--color-text-muted)">
                  {isCz
                    ? `${n.state.configs.length} konfigurací, alternativy {${n.uniqueAlts.join(', ')}}`
                    : `${n.state.configs.length} configurations, alts {${n.uniqueAlts.join(', ')}}`}
                </text>
                {n.lines.map((line, i) => (
                  <text key={i} x={12} y={54 + i * LINE_H} fontSize="10px" fontFamily="monospace" fill="var(--color-text)">
                    {line.length > 38 ? `${line.slice(0, 37)}…` : line}
                  </text>
                ))}
                {n.more > 0 && (
                  <text x={12} y={54 + n.lines.length * LINE_H} fontSize="10px" fill="var(--color-text-muted)">
                    {isCz ? `… a dalších ${n.more} (klikněte)` : `… and ${n.more} more (click)`}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
