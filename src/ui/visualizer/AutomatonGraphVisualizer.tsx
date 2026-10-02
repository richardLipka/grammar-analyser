/**
 * Interactive SVG Automaton Graph Visualizer powered by Dagre layout
 * Supports:
 * - Zoom (towards the cursor) & pan, fit to view
 * - State selection & inspection
 * - Kernel items separated from closure items, complete (reduce) items highlighted
 * - States with conflicts in the selected table outlined in red
 * - One edge per pair of states, labelled with all its symbols
 * - For the selected state: the transition that created it, its other incoming
 *   transitions, and the items of the predecessors whose dot moves over the
 *   entry symbol (the items GOTO turns into the kernel of the selected state)
 * - Clicking an item goes to the state its transition leads to
 * - Hovering a lookahead explains why it is in the lookahead set
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { LRAutomaton, LRState } from '../../core/lr/lrAutomaton';
import { groupLR1Items, LR0Item, GroupedLR1Item } from '../../core/lr/lrItem';
import { stateCreators, incomingEdges, itemTarget } from '../../core/lr/lrExplain';
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { FloatingTip } from '../components/LRExplanation';

interface AutomatonGraphVisualizerProps {
  automaton: LRAutomaton;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  conflictStates?: Set<number>;
  /** Node titles by state id (lecture names such as E₁, or "State 3") */
  nodeTitles?: string[];
  lang?: Language;
  /** Tooltip of an item row (why the item is there, where it leads) */
  itemHint?: (stateId: number, item: DisplayItem) => string;
  /** Tooltip body explaining a lookahead of an item */
  lookaheadTip?: (stateId: number, item: DisplayItem, lookahead: string) => React.ReactNode;
}

export interface DisplayItem {
  production: LR0Item['production'];
  dotIndex: number;
  lhs: string;
  before: string[];
  after: string[];
  lookaheads?: string[];
  isKernel: boolean;
  isComplete: boolean;
  /** state reached by moving the dot (undefined for a complete item) */
  target?: number;
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
const LA_SEP = ' / ';

/** Items of a state, kernel items first (S' -> •S and items with the dot inside). */
export function stateDisplayItems(state: LRState, withLookaheads: boolean): DisplayItem[] {
  const base: (LR0Item & { lookaheads?: string[] })[] = withLookaheads
    ? groupLR1Items(state.items1 || []).map((g: GroupedLR1Item) => ({ production: g.production, dotIndex: g.dotIndex, lookaheads: g.lookaheads }))
    : state.items0;
  const items = base.map(it => ({
    production: it.production,
    dotIndex: it.dotIndex,
    lhs: it.production.lhs,
    before: it.production.rhs.slice(0, it.dotIndex),
    after: it.production.rhs.slice(it.dotIndex),
    lookaheads: it.lookaheads,
    isKernel: it.dotIndex > 0 || it.production.id === 0,
    isComplete: it.dotIndex === it.production.rhs.length,
    target: itemTarget(state, it)
  }));
  return [...items.filter(i => i.isKernel), ...items.filter(i => !i.isKernel)];
}

/** Characters of an item row as drawn: "A → α • β, a / b" */
function itemLength(it: DisplayItem): number {
  const core = `${it.lhs} → ${[...it.before, '•', ...it.after].join(' ')}`;
  return it.lookaheads ? core.length + 2 + it.lookaheads.join(LA_SEP).length : core.length;
}

/** Baseline of the item row `idx` inside its node. */
const itemBaseline = (idx: number, separatorAt: number) =>
  HEADER_H + 20 + idx * LINE_H + (separatorAt > 0 && idx >= separatorAt ? 6 : 0);

export const AutomatonGraphVisualizer: React.FC<AutomatonGraphVisualizerProps> = ({
  automaton,
  selectedStateId,
  onSelectState,
  conflictStates,
  nodeTitles,
  lang = 'en',
  itemHint,
  lookaheadTip
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [tip, setTip] = useState<{ anchor: DOMRect; content: React.ReactNode } | null>(null);
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

  const { view, fit, zoomBy, reveal, onPointerDown, isDragging, wasDragged } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  // Origin of the selected state: the creating transition, the other transitions into it,
  // and in each predecessor the items whose dot moves over the entry symbol
  const creators = useMemo(() => stateCreators(automaton), [automaton]);
  const origin = useMemo(() => {
    const selected = selectedStateId ?? null;
    const preds = new Map<number, string>();
    if (selected !== null && automaton.states[selected]) {
      for (const e of incomingEdges(automaton, selected)) if (e.from !== selected) preds.set(e.from, e.symbol);
    }
    return { selected, creator: selected !== null ? creators[selected]?.from ?? null : null, preds };
  }, [automaton, creators, selectedStateId]);

  // Bring a newly selected state into view (no movement when it is already visible);
  // a new automaton is framed as a whole instead, so its first render reveals nothing
  const revealedLayout = useRef(layout);
  useEffect(() => {
    if (revealedLayout.current !== layout) {
      revealedLayout.current = layout;
      return;
    }
    const n = selectedStateId !== null && selectedStateId !== undefined ? layout.nodes[selectedStateId] : undefined;
    if (n) reveal(n.x - n.width / 2, n.y - n.height / 2, n.width, n.height);
  }, [selectedStateId, layout, reveal]);

  // Tooltip: immediately, or after a delay; `key` keeps a pending delayed tip when the
  // pointer only moves between the parts of the same item row
  const tipTimer = useRef<number | undefined>(undefined);
  const tipKey = useRef<string | null>(null);
  const showTip = (anchor: DOMRect, content: React.ReactNode, delay: number, key?: string) => {
    if (key !== undefined && tipKey.current === key) return;
    window.clearTimeout(tipTimer.current);
    tipKey.current = key ?? null;
    if (delay === 0) {
      setTip({ anchor, content });
    } else {
      setTip(null);
      tipTimer.current = window.setTimeout(() => setTip({ anchor, content }), delay);
    }
  };
  const hideTip = () => {
    window.clearTimeout(tipTimer.current);
    tipKey.current = null;
    setTip(null);
  };
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);
  useEffect(hideTip, [automaton, selectedStateId]);

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

  /** 'origin' = the creating transition, 'incoming' = another transition into the selected state, 'active' = outgoing */
  const edgeKind = (e: LayoutEdge): '' | 'origin' | 'incoming' | 'active' => {
    if (origin.selected === null) return '';
    if (e.from === origin.selected) return 'active';
    if (e.to === origin.selected) return e.from === origin.creator ? 'origin' : 'incoming';
    return '';
  };
  const edgeRank = { '': 0, active: 1, incoming: 2, origin: 3 };
  // Highlighted edges are drawn last, so they lie on top of the others
  const edges = [...layout.edges].sort((a, b) => edgeRank[edgeKind(a)] - edgeRank[edgeKind(b)]);

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ height: '540px', cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => {
        hideTip();
        onPointerDown(e);
      }}
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
          {(['', 'active', 'origin', 'incoming'] as const).map(kind => (
            <marker
              key={kind || 'plain'}
              id={`${markerId}-arrow${kind ? `-${kind}` : ''}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path className={`g-arrow ${kind}`} d="M 0 1 L 10 5 L 0 9 z" />
            </marker>
          ))}
        </defs>

        <g data-viewport="" transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {edges.map(edge => {
            const kind = edgeKind(edge);
            const mid = edge.labelPos;
            const labelW = edge.label.length * 7 + 12;
            return (
              <g key={`edge_${edge.from}_${edge.to}`}>
                <path
                  className={`g-edge ${kind}`}
                  d={edgePath(edge.points)}
                  markerEnd={`url(#${markerId}-arrow${kind ? `-${kind}` : ''})`}
                />
                <rect className={`g-label-bg ${kind}`} x={mid.x - labelW / 2} y={mid.y - 9} width={labelW} height={18} rx={4} />
                <text className={`g-label ${kind}`} x={mid.x} y={mid.y + 4} textAnchor="middle">{edge.label}</text>
              </g>
            );
          })}

          {layout.nodes.map(node => {
            const isSelected = selectedStateId === node.id;
            const isAccepting = !!node.state.isAccepting;
            const hasConflict = !!conflictStates?.has(node.id);
            const entrySymbol = origin.preds.get(node.id);
            const isCreator = origin.creator === node.id;
            const stateCls = isSelected
              ? 'selected'
              : isCreator
                ? 'parent'
                : entrySymbol !== undefined
                  ? 'pred'
                  : hasConflict ? 'conflict' : isAccepting ? 'accepting' : '';
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
                <rect className={`g-node-header ${isSelected ? 'selected' : isCreator ? 'parent' : ''}`} x={1} y={1} width={node.width - 2} height={HEADER_H - 1} rx={7} />
                <text className={`g-node-title ${isSelected || isCreator ? 'selected' : hasConflict ? 'conflict' : ''}`} x={10} y={18}>
                  {nodeTitles?.[node.id] ?? `${isCz ? 'Stav' : 'State'} ${node.id}`}{tags.length > 0 ? `  (${tags.join(', ')})` : ''}
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
                  const y = itemBaseline(itIdx, separatorAt);
                  // In a predecessor of the selected state: the items GOTO moves into its kernel
                  const isOrigin = entrySymbol !== undefined && it.after[0] === entrySymbol;
                  const navigable = it.target !== undefined;
                  return (
                    <g
                      key={`item_${itIdx}`}
                      className={`g-item-row ${navigable ? 'navigable' : ''}`}
                      onClick={(e) => {
                        if (!navigable) return;
                        e.stopPropagation();
                        if (!wasDragged()) onSelectState?.(it.target!);
                      }}
                      // A lookahead explains itself at once, the item after a short pause
                      onMouseOver={(e) => {
                        if (isDragging) return;
                        const la = (e.target as Element).getAttribute('data-la');
                        if (la !== null && lookaheadTip) {
                          showTip((e.target as Element).getBoundingClientRect(), lookaheadTip(node.id, it, la), 0);
                        } else if (itemHint) {
                          const row = e.currentTarget.getBoundingClientRect();
                          showTip(row, <div className="lr-explain lr-hint">{itemHint(node.id, it)}</div>, 450, `${node.id}:${itIdx}`);
                        }
                      }}
                      onMouseLeave={hideTip}
                    >
                      <rect
                        className={`g-item-hit ${isOrigin ? (isCreator ? 'origin' : 'origin secondary') : ''}`}
                        x={4}
                        y={y - 13.5}
                        width={node.width - 8}
                        height={LINE_H - 1}
                        rx={3}
                      />
                      <text className={`g-item ${it.isComplete ? 'reduce' : ''} ${isOrigin ? 'origin' : ''}`} x={10} y={y}>
                        <tspan>{`${it.lhs} → ${it.before.join(' ')}${it.before.length ? ' ' : ''}`}</tspan>
                        <tspan className="g-item-dot">•</tspan>
                        <tspan>{it.after.length ? ` ${it.after.join(' ')}` : ''}</tspan>
                        {it.lookaheads && (
                          <>
                            <tspan>{', '}</tspan>
                            {it.lookaheads.map((la, laIdx) => (
                              <React.Fragment key={la}>
                                {laIdx > 0 && <tspan>{LA_SEP}</tspan>}
                                <tspan
                                  className={`g-item-la ${lookaheadTip ? 'explained' : ''}`}
                                  data-la={la}
                                >
                                  {la}
                                </tspan>
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {tip && <FloatingTip anchor={tip.anchor}>{tip.content}</FloatingTip>}
    </div>
  );
};
