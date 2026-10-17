/**
 * Interactive SVG ETTP (Earley Table Traversing Parsers) Automaton Graph Visualizer
 * Powered by Dagre layout, pan/zoom, state inspection, and educational derivation explanations.
 *
 * Literature Reference:
 * Scott, E., Johnstone, A.: Earley Table Traversing Parsers.
 * Science of Computer Programming 247, 103335 (2025/2026).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { ETTPTable, ETTPState, ETTPItem } from '../../core/earley/ettpParser';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';
import { Info, CheckCircle2, ArrowRight, CornerDownRight, Sparkles, Layers } from 'lucide-react';

interface ETTPGraphVisualizerProps {
  table: ETTPTable;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  activeStateId?: number | null;
  activeSymbol?: string | null;
  lang?: Language;
  height?: string;
  filename?: string;
}

interface ETTPLayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: ETTPState;
  kernelItems: ETTPItem[];
  closureItems: ETTPItem[];
}

interface ETTPLayoutEdge {
  from: number;
  to: number;
  symbol: string;
  originKind: 'kernel' | 'predicted' | 'both';
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const HEADER_H = 26;
const ITEM_LINE_H = 18;
const CHAR_W = 6.8;
const PADDING = 12;

function formatItemText(it: ETTPItem): string {
  const rhs = [...it.production.rhs];
  rhs.splice(it.dot, 0, '•');
  return `${it.production.lhs} → ${rhs.join(' ') || '•'}`;
}

export const ETTPGraphVisualizer: React.FC<ETTPGraphVisualizerProps> = ({
  table,
  selectedStateId,
  onSelectState,
  activeStateId,
  activeSymbol,
  lang = 'en',
  height = '480px',
  filename = 'ettp_automaton_graph'
}) => {
  const isCz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrowMarkerId = useId().replace(/:/g, '');
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Compute Dagre layout
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 40,
      ranksep: 75,
      marginx: 25,
      marginy: 25
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Calculate node dimensions
    for (const state of table.states) {
      const kernelItems = state.items.filter(it => it.dot > 0 || it.production.id === -1);
      const closureItems = state.items.filter(it => it.dot === 0 && it.production.id !== -1);

      let maxLineLen = 14;
      for (const it of state.items) {
        const text = formatItemText(it);
        if (text.length > maxLineLen) maxLineLen = text.length;
      }

      const width = Math.max(160, Math.min(360, Math.round(maxLineLen * CHAR_W + PADDING * 2)));
      const linesCount = state.items.length + (kernelItems.length > 0 && closureItems.length > 0 ? 1 : 0);
      const height = HEADER_H + linesCount * ITEM_LINE_H + PADDING + 6;

      g.setNode(String(state.id), { width, height });
    }

    // Register transitions
    for (const state of table.states) {
      for (const [sym, trans] of state.transitions.entries()) {
        const label = sym;
        g.setEdge(String(state.id), String(trans.targetStateId), {
          name: sym,
          label,
          originKind: trans.originKind,
          width: Math.max(24, label.length * 8 + 12),
          height: 18,
          labelpos: 'c'
        });
      }
    }

    dagre.layout(g);

    const nodes: ETTPLayoutNode[] = table.states.map(state => {
      const n = g.node(String(state.id));
      const kernelItems = state.items.filter(it => it.dot > 0 || it.production.id === -1);
      const closureItems = state.items.filter(it => it.dot === 0 && it.production.id !== -1);
      return {
        id: state.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        state,
        kernelItems,
        closureItems
      };
    });

    const edges: ETTPLayoutEdge[] = [];
    for (const state of table.states) {
      for (const [sym, trans] of state.transitions.entries()) {
        const e = g.edge(String(state.id), String(trans.targetStateId), sym);
        if (e && e.points) {
          edges.push({
            from: state.id,
            to: trans.targetStateId,
            symbol: sym,
            originKind: trans.originKind,
            points: e.points,
            labelPos: { x: e.x, y: e.y }
          });
        }
      }
    }

    const graphBBox = g.graph();
    return {
      nodes,
      edges,
      width: (graphBBox.width || 800) + 50,
      height: (graphBBox.height || 600) + 50
    };
  }, [table]);

  const { view, fit, zoomBy, reveal, onPointerDown, wasDragged } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  // Default selection
  const activeSelectedId = selectedStateId ?? (activeStateId ?? table.startStateId);
  const selectedState = table.states[activeSelectedId] ?? table.states[0];

  // Bring selected state into view when changed
  const revealedLayout = useRef(layout);
  useEffect(() => {
    if (revealedLayout.current !== layout) {
      revealedLayout.current = layout;
      return;
    }
    const n = activeSelectedId !== null && activeSelectedId !== undefined
      ? layout.nodes.find(node => node.id === activeSelectedId)
      : undefined;
    if (n) reveal(n.x - n.width / 2, n.y - n.height / 2, n.width, n.height);
  }, [activeSelectedId, layout, reveal]);

  // Export handlers
  const exportBounds = { width: Math.ceil(layout.width), height: Math.ceil(layout.height) };
  const exportTransform = 'translate(25, 25)';

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    exportSvgFile(svgRef.current, filename, exportBounds, exportTransform);
  };

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

  // Incoming transitions to selected state
  const incomingTransitions = useMemo(() => {
    const list: { fromStateId: number; symbol: string; originKind: 'kernel' | 'predicted' | 'both' }[] = [];
    for (const s of table.states) {
      for (const [sym, tr] of s.transitions.entries()) {
        if (tr.targetStateId === selectedState.id) {
          list.push({ fromStateId: s.id, symbol: sym, originKind: tr.originKind });
        }
      }
    }
    return list;
  }, [table, selectedState]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Visualizer Container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-bg-base)',
          overflow: 'hidden',
          cursor: 'grab'
        }}
        onPointerDown={onPointerDown}
      >
        <GraphToolbar
          onZoomIn={() => zoomBy(1.2)}
          onZoomOut={() => zoomBy(1 / 1.2)}
          onFit={fit}
          onExportSvg={handleExportSvg}
          onExportPng={handleExportPng}
          isExportingPng={isExportingPng}
          lang={lang}
        />

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <marker
              id={`${arrowMarkerId}-arrow`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-text-secondary)" />
            </marker>
            <marker
              id={`${arrowMarkerId}-arrow-active`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-primary)" />
            </marker>
          </defs>

          <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
            {/* Edges */}
            {layout.edges.map((e, idx) => {
              const isSelectedTarget = selectedState.id === e.to;
              const isSelectedSource = selectedState.id === e.from;
              const isActiveEdge = activeStateId === e.from && activeSymbol === e.symbol;
              const isPredicted = e.originKind === 'predicted';

              let strokeColor = 'var(--color-border)';
              let strokeWidth = 1.3;
              if (isActiveEdge) {
                strokeColor = 'var(--color-primary)';
                strokeWidth = 2.4;
              } else if (isSelectedTarget || isSelectedSource) {
                strokeColor = 'var(--color-text-secondary)';
                strokeWidth = 1.8;
              }

              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={edgePath(e.points)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isPredicted ? '4 3' : undefined}
                    markerEnd={`url(#${arrowMarkerId}-${isActiveEdge ? 'arrow-active' : 'arrow'})`}
                  />
                  {e.labelPos && (
                    <g transform={`translate(${e.labelPos.x}, ${e.labelPos.y})`}>
                      <rect
                        x="-14"
                        y="-10"
                        width="28"
                        height="18"
                        rx="4"
                        fill="var(--color-bg-surface)"
                        stroke={isActiveEdge ? 'var(--color-primary)' : 'var(--color-border)'}
                        strokeWidth={isActiveEdge ? 1.5 : 1}
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight={700}
                        fill={isActiveEdge ? 'var(--color-primary)' : 'var(--color-text-primary)'}
                      >
                        {e.symbol}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {layout.nodes.map(n => {
              const isSelected = selectedState.id === n.id;
              const isActive = activeStateId === n.id;
              const isStart = n.id === table.startStateId;
              const isAccept = n.state.isAcceptState;
              const hasCompletions = n.state.completions.length > 0;

              let borderColor = 'var(--color-border)';
              let borderWidth = 1;
              if (isActive) {
                borderColor = 'var(--color-primary)';
                borderWidth = 2.5;
              } else if (isSelected) {
                borderColor = 'var(--color-primary)';
                borderWidth = 2;
              }

              const leftX = n.x - n.width / 2;
              const topY = n.y - n.height / 2;

              return (
                <g
                  key={`node-${n.id}`}
                  transform={`translate(${leftX}, ${topY})`}
                  style={{ cursor: 'pointer' }}
                  onClick={evt => {
                    if (wasDragged()) return;
                    evt.stopPropagation();
                    onSelectState?.(n.id);
                  }}
                >
                  {/* Node Background */}
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="6"
                    fill="var(--color-bg-surface)"
                    stroke={borderColor}
                    strokeWidth={borderWidth}
                    filter={isActive ? 'drop-shadow(0 0 6px var(--color-primary-subtle))' : undefined}
                  />

                  {/* Header Bar */}
                  <rect
                    width={n.width}
                    height={HEADER_H}
                    rx="6"
                    fill={isSelected || isActive ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)'}
                    clipPath={`url(#clip-${n.id})`}
                  />

                  {/* Header Title & Badges */}
                  <text
                    x={PADDING}
                    y="17"
                    fontSize="11.5"
                    fontFamily="monospace"
                    fontWeight={700}
                    fill={isSelected || isActive ? 'var(--color-primary)' : 'var(--color-text-primary)'}
                  >
                    q{n.id}
                  </text>

                  {isStart && (
                    <text
                      x={n.width - (isAccept ? 68 : 36)}
                      y="16"
                      fontSize="9"
                      fontWeight={600}
                      fill="var(--color-primary)"
                    >
                      start
                    </text>
                  )}

                  {isAccept && (
                    <text
                      x={n.width - 34}
                      y="16"
                      fontSize="9"
                      fontWeight={700}
                      fill="var(--color-success)"
                    >
                      accept
                    </text>
                  )}

                  {hasCompletions && !isAccept && (
                    <text
                      x={n.width - 36}
                      y="16"
                      fontSize="9"
                      fontWeight={700}
                      fill="var(--color-warning)"
                    >
                      red
                    </text>
                  )}

                  {/* Header separator */}
                  <line
                    x1="0"
                    y1={HEADER_H}
                    x2={n.width}
                    y2={HEADER_H}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                  />

                  {/* Items List */}
                  {n.state.items.map((it, idx) => {
                    const isKernel = it.dot > 0 || it.production.id === -1;
                    const isComplete = it.dot === it.production.rhs.length;
                    const itemY = HEADER_H + 15 + idx * ITEM_LINE_H;

                    const rhsBefore = it.production.rhs.slice(0, it.dot).join(' ');
                    const rhsAfter = it.production.rhs.slice(it.dot).join(' ');

                    return (
                      <g key={`item-${idx}`}>
                        <text
                          x={PADDING}
                          y={itemY}
                          fontSize="10"
                          fontFamily="monospace"
                          fill={isComplete ? 'var(--color-warning)' : isKernel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'}
                        >
                          <tspan fontWeight={600}>{it.production.lhs}</tspan> → {rhsBefore}{rhsBefore ? ' ' : ''}
                          <tspan fill="var(--color-primary)" fontWeight={700}>•</tspan>
                          {rhsAfter ? ` ${rhsAfter}` : ''}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* State Educational Derivation Inspector */}
      <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', backgroundColor: 'var(--color-bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="var(--color-primary)" />
            <span style={{ fontWeight: 700, fontSize: '13.5px' }}>
              {isCz ? `Inspekce odvození stavu q${selectedState.id} z gramatiky` : `Derivation Analysis for State q${selectedState.id}`}
            </span>
            {selectedState.id === table.startStateId && (
              <span className="badge badge-info">{isCz ? 'Počáteční stav' : 'Start State'}</span>
            )}
            {selectedState.isAcceptState && (
              <span className="badge badge-success">{isCz ? 'Přijímající stav (S\' → S •)' : 'Accepting State (S\' → S •)'}</span>
            )}
            {selectedState.completions.length > 0 && (
              <span className="badge badge-warning">
                {isCz ? `${selectedState.completions.length} redukcí` : `${selectedState.completions.length} completions`}
              </span>
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            {isCz ? `Celkem ${selectedState.items.length} položek v predikčním uzávěru` : `${selectedState.items.length} items in prediction closure`}
          </span>
        </div>

        {/* Detailed Explanation Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '12px' }}>
          {/* 1. Origin & Incoming Transitions */}
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
              {isCz ? '1. Vznik stavu (Vstupní přechody)' : '1. State Origin (Incoming Transitions)'}
            </div>
            {selectedState.id === table.startStateId ? (
              <p style={{ margin: 0, fontSize: '11.5px', lineHeight: '1.4' }}>
                {isCz
                  ? 'Počáteční stav q0 byl vytvořen aplikací predikčního uzávěru na rozšířené pravidlo [S\' → • S].'
                  : 'Initial state q0 was formed by taking the prediction closure of the augmented rule [S\' → • S].'}
              </p>
            ) : incomingTransitions.length === 0 ? (
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Žádné přímé vstupní přechody' : 'No direct incoming transitions'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {incomingTransitions.map((tr, idx) => (
                  <div key={idx} style={{ fontSize: '11.5px', fontFamily: 'monospace' }}>
                    <ArrowRight size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    <strong>q{tr.fromStateId}</strong> přes symbol <strong>'{tr.symbol}'</strong>
                    <span style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                      ({tr.originKind === 'kernel' ? (isCz ? 'jádrový přechod' : 'kernel') : (isCz ? 'predikovaný uzávěr' : 'predicted')})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Kernel vs Closure Breakdown */}
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
              {isCz ? '2. Položky stavu (Jádro & Predikční uzávěr)' : '2. State Items (Kernel & Closure)'}
            </div>
            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div>
                <strong>{isCz ? 'Jádrové položky' : 'Kernel items'}:</strong>{' '}
                {selectedState.items.filter(it => it.dot > 0 || it.production.id === -1).length}
              </div>
              <div>
                <strong>{isCz ? 'Predikovaný uzávěr' : 'Prediction closure'}:</strong>{' '}
                {selectedState.items.filter(it => it.dot === 0 && it.production.id !== -1).length}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {isCz
                  ? 'Prediktor rozšířil neterminály za tečkou do stavu ještě před začátkem analýzy.'
                  : 'Predictor expanded non-terminals after the dot into the state prior to runtime.'}
              </div>
            </div>
          </div>

          {/* 3. Outgoing Transitions */}
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
              {isCz ? '3. Výstupní přechody δ(q, X)' : '3. Outgoing Transitions δ(q, X)'}
            </div>
            {selectedState.transitions.size === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Koncový stav bez dalších přechodů' : 'Leaf state with no outgoing transitions'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[...selectedState.transitions.entries()].map(([sym, tr], idx) => (
                  <span
                    key={idx}
                    onClick={() => onSelectState?.(tr.targetStateId)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      cursor: 'pointer'
                    }}
                    title={isCz ? `Kliknutím přejdete do stavu q${tr.targetStateId}` : `Click to inspect state q${tr.targetStateId}`}
                  >
                    <strong>'{sym}'</strong> → q{tr.targetStateId}{' '}
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>({tr.originKind})</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 4. Completions & Reductions */}
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '4px' }}>
              {isCz ? '4. Dokončená pravidla (Redukce kompletoru)' : '4. Completed Rules (Completer Reductions)'}
            </div>
            {selectedState.completions.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Žádné pravidlo zde nekončí' : 'No rule reduces in this state'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {selectedState.completions.map((c, idx) => (
                  <div key={idx} style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--color-warning)' }}>
                    ✓ {c.production.lhs} → {c.production.rhs.join(' ') || 'ε'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
