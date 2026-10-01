/**
 * Interactive SVG Automaton Graph Visualizer powered by Dagre layout
 * Supports:
 * - Zoom (towards the cursor) & pan, fit to view
 * - State selection & inspection
 * - Kernel items separated from closure items, complete (reduce) items highlighted
 * - States with conflicts in the selected table outlined in red
 * - One edge per pair of states, labelled with all its symbols
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { LRAutomaton, LRState } from '../../core/lr/lrAutomaton';
import { groupLR1Items, LR0Item, GroupedLR1Item } from '../../core/lr/lrItem';
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';

interface AutomatonGraphVisualizerProps {
  automaton: LRAutomaton;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  conflictStates?: Set<number>;
  lang?: Language;
}

interface DisplayItem {
  lhs: string;
  before: string[];
  after: string[];
  lookaheads?: string[];
  isKernel: boolean;
  isComplete: boolean;
}

interface LayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: LRState;
  items: DisplayItem[];
}

interface LayoutEdge {
  from: number;
  to: number;
  label: string;
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const HEADER_H = 28;
const LINE_H = 19;
const CHAR_W = 6.9;
const MARGIN = 30;

/** Items of a state, kernel items first (S' -> •S and items with the dot inside). */
export function stateDisplayItems(state: LRState, withLookaheads: boolean): DisplayItem[] {
  const base: (LR0Item & { lookaheads?: string[] })[] = withLookaheads
    ? groupLR1Items(state.items1 || []).map((g: GroupedLR1Item) => ({ production: g.production, dotIndex: g.dotIndex, lookaheads: g.lookaheads }))
    : state.items0;
  const items = base.map(it => ({
    lhs: it.production.lhs,
    before: it.production.rhs.slice(0, it.dotIndex),
    after: it.production.rhs.slice(it.dotIndex),
    lookaheads: it.lookaheads,
    isKernel: it.dotIndex > 0 || it.production.id === 0,
    isComplete: it.dotIndex === it.production.rhs.length
  }));
  return [...items.filter(i => i.isKernel), ...items.filter(i => !i.isKernel)];
}

function itemLength(it: DisplayItem): number {
  const core = `${it.lhs} → ${[...it.before, '•', ...it.after].join(' ')}`;
  return it.lookaheads ? core.length + 4 + it.lookaheads.join(', ').length : core.length;
}

export const AutomatonGraphVisualizer: React.FC<AutomatonGraphVisualizerProps> = ({
  automaton,
  selectedStateId,
  onSelectState,
  conflictStates,
  lang = 'en'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const markerId = useId().replace(/:/g, '');
  const isCz = lang === 'cz';
  const withLookaheads = automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)';

  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 90, marginx: 10, marginy: 10 });
    g.setDefaultEdgeLabel(() => ({}));

    const itemsByState = new Map<number, DisplayItem[]>();
    for (const s of automaton.states) {
      const items = stateDisplayItems(s, withLookaheads);
      itemsByState.set(s.id, items);
      const maxLen = Math.max(14, ...items.map(itemLength));
      const hasSeparator = items.some(i => i.isKernel) && items.some(i => !i.isKernel);
      g.setNode(String(s.id), {
        width: Math.max(170, Math.round(maxLen * CHAR_W + 26)),
        height: HEADER_H + 10 + items.length * LINE_H + (hasSeparator ? 6 : 0)
      });
    }

    // Merge parallel transitions (same source and target) into one labelled edge
    const merged = new Map<string, { from: number; to: number; symbols: string[] }>();
    for (const s of automaton.states) {
      for (const [sym, target] of s.transitions.entries()) {
        const key = `${s.id}->${target}`;
        if (!merged.has(key)) merged.set(key, { from: s.id, to: target, symbols: [] });
        merged.get(key)!.symbols.push(sym);
      }
    }
    for (const e of merged.values()) {
      const label = e.symbols.join(', ');
      g.setEdge(String(e.from), String(e.to), { label, width: label.length * 7 + 12, height: 18, labelpos: 'c' });
    }

    dagre.layout(g);

    const nodes: LayoutNode[] = automaton.states.map(s => {
      const n = g.node(String(s.id));
      return { id: s.id, x: n.x, y: n.y, width: n.width, height: n.height, state: s, items: itemsByState.get(s.id)! };
    });
    const edges: LayoutEdge[] = [...merged.values()].map(e => {
      const data = g.edge(String(e.from), String(e.to));
      const points = data?.points || [];
      const mid = points[Math.floor(points.length / 2)] || { x: 0, y: 0 };
      const labelPos = data && typeof data.x === 'number' && typeof data.y === 'number' ? { x: data.x, y: data.y } : mid;
      return { from: e.from, to: e.to, label: e.symbols.join(', '), points, labelPos };
    });
    const info = g.graph();
    return { nodes, edges, width: info.width || 800, height: info.height || 600 };
  }, [automaton, withLookaheads]);

  const { view, fit, zoomBy, onPointerDown, isDragging, wasDragged } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  const filename = `${automaton.variant.toLowerCase().replace(/[^a-z0-9]/g, '_')}_graph`;
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

  const edgePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length < 3) return `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`;
    // Smooth the dagre polyline with quadratic segments through the midpoints
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x},${pts[i].y} ${i === pts.length - 2 ? pts[i + 1].x : mx},${i === pts.length - 2 ? pts[i + 1].y : my}`;
    }
    return d;
  };

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ height: '540px', cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
    >
      <div className="graph-toolbar">
        <button className="btn-icon" title={isCz ? 'Přiblížit' : 'Zoom in'} onClick={() => zoomBy(1.2)}>
          <ZoomIn size={16} />
        </button>
        <button className="btn-icon" title={isCz ? 'Oddálit' : 'Zoom out'} onClick={() => zoomBy(1 / 1.2)}>
          <ZoomOut size={16} />
        </button>
        <button className="btn-icon" title={isCz ? 'Zobrazit celý automat' : 'Fit whole automaton'} onClick={fit}>
          <Maximize2 size={16} />
        </button>
        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--color-border)', margin: '0 2px' }} />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', gap: '4px' }}
          title={isCz ? 'Exportovat graf jako vektorový SVG' : 'Export graph as vector SVG'}
          onClick={() => svgRef.current && exportSvgFile(svgRef.current, filename, exportBounds, exportTransform)}
        >
          <Download size={12} />
          <span>SVG</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', gap: '4px' }}
          title={isCz ? 'Exportovat graf jako PNG (vysoké rozlišení)' : 'Export graph as high-res PNG'}
          onClick={handleExportPng}
          disabled={isExportingPng}
        >
          <ImageIcon size={12} />
          <span>{isExportingPng ? '...' : 'PNG'}</span>
        </button>
      </div>

      <svg ref={svgRef} width="100%" height="100%">
        <defs>
          <marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="g-arrow" d="M 0 1 L 10 5 L 0 9 z" />
          </marker>
          <marker id={`${markerId}-arrow-active`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="g-arrow active" d="M 0 1 L 10 5 L 0 9 z" />
          </marker>
        </defs>

        <g data-viewport="" transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {layout.edges.map((edge, idx) => {
            const active = selectedStateId !== undefined && selectedStateId !== null &&
              (edge.from === selectedStateId || edge.to === selectedStateId);
            const mid = edge.labelPos;
            const labelW = edge.label.length * 7 + 12;
            return (
              <g key={`edge_${idx}`}>
                <path
                  className={`g-edge ${active ? 'active' : ''}`}
                  d={edgePath(edge.points)}
                  markerEnd={`url(#${markerId}-arrow${active ? '-active' : ''})`}
                />
                <rect className={`g-label-bg ${active ? 'active' : ''}`} x={mid.x - labelW / 2} y={mid.y - 9} width={labelW} height={18} rx={4} />
                <text className="g-label" x={mid.x} y={mid.y + 4} textAnchor="middle">{edge.label}</text>
              </g>
            );
          })}

          {layout.nodes.map(node => {
            const isSelected = selectedStateId === node.id;
            const isAccepting = !!node.state.isAccepting;
            const hasConflict = !!conflictStates?.has(node.id);
            const stateCls = isSelected ? 'selected' : hasConflict ? 'conflict' : isAccepting ? 'accepting' : '';
            const firstClosure = node.items.findIndex(i => !i.isKernel);
            const separatorAt = firstClosure > 0 ? firstClosure : -1;
            const tags = [
              node.id === 0 ? (isCz ? 'počáteční' : 'initial') : '',
              isAccepting ? (isCz ? 'přijímající' : 'accept') : '',
              hasConflict ? (isCz ? '⚠ konflikt' : '⚠ conflict') : ''
            ].filter(Boolean);

            return (
              <g
                key={`node_${node.id}`}
                transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!wasDragged()) onSelectState?.(node.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <rect className={`g-node ${stateCls}`} width={node.width} height={node.height} rx={8} />
                <rect className={`g-node-header ${isSelected ? 'selected' : ''}`} x={1} y={1} width={node.width - 2} height={HEADER_H - 1} rx={7} />
                <text className={`g-node-title ${isSelected ? 'selected' : hasConflict ? 'conflict' : ''}`} x={10} y={18}>
                  {isCz ? 'Stav' : 'State'} {node.id}{tags.length > 0 ? `  (${tags.join(', ')})` : ''}
                </text>

                {separatorAt > 0 && (
                  <line
                    className="g-closure-sep"
                    x1={8}
                    x2={node.width - 8}
                    y1={HEADER_H + 8 + separatorAt * LINE_H - 2}
                    y2={HEADER_H + 8 + separatorAt * LINE_H - 2}
                  />
                )}

                {node.items.map((it, itIdx) => {
                  const y = HEADER_H + 20 + itIdx * LINE_H + (separatorAt > 0 && itIdx >= separatorAt ? 6 : 0);
                  return (
                    <text key={`item_${itIdx}`} className={`g-item ${it.isComplete ? 'reduce' : ''}`} x={10} y={y}>
                      <tspan>{`${it.lhs} → ${it.before.join(' ')}${it.before.length ? ' ' : ''}`}</tspan>
                      <tspan className="g-item-dot">•</tspan>
                      <tspan>{it.after.length ? ` ${it.after.join(' ')}` : ''}</tspan>
                      {it.lookaheads && (
                        <>
                          <tspan>{' , '}</tspan>
                          <tspan className="g-item-la">{it.lookaheads.join(' / ')}</tspan>
                        </>
                      )}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
