/**
 * Interactive SVG ETTP (Earley Table Traversing Parsers) Automaton Graph Visualizer
 * Powered by Dagre layout, pan/zoom, state inspection, and educational derivation explanations.
 *
 * Primary Literature References:
 * - Scott, E., Johnstone, A.: Earley Table Traversing Parsers.
 *   Science of Computer Programming 247, 103335 (2025/2026).
 *   https://doi.org/10.1016/j.scico.2025.103335
 * - Earley, J.: An efficient context-free parsing algorithm.
 *   Communications of the ACM 13(2), 94–102 (1970).
 *   https://doi.org/10.1145/362007.362035
 * - Aycock, J., Horspool, R.N.: Practical Earley Parsing.
 *   The Computer Journal 45(6), 620–630 (2002).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import {
  ETTPTable,
  ETTPState,
  ETTPItem,
  ETTPTransitionReason,
  isETTPKernelItem,
  getETTPTransitionReason,
  findPredictionTriggers
} from '../../core/earley/ettpParser';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';
import { FloatingTip } from '../components/LRExplanation';
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

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

export interface ETTPDisplayItem {
  production: ETTPItem['production'];
  dot: number;
  lhs: string;
  before: string[];
  after: string[];
  isKernel: boolean;
  isComplete: boolean;
  nextSymbol?: string;
  targetStateId?: number;
  predictedBy?: ETTPItem[];
}

interface ETTPLayoutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  state: ETTPState;
  kernelItems: ETTPDisplayItem[];
  closureItems: ETTPDisplayItem[];
  allItems: ETTPDisplayItem[];
  separatorY?: number;
}

interface ETTPLayoutEdge {
  from: number;
  to: number;
  symbols: string[];
  originKind: 'kernel' | 'predicted' | 'both';
  reasons: ETTPTransitionReason[];
  points: { x: number; y: number }[];
  labelPos: { x: number; y: number };
}

const HEADER_H = 28;
const ITEM_LINE_H = 19;
const SEP_H = 22;
const CHAR_W = 6.9;
const PADDING = 14;

function formatDisplayItem(it: ETTPDisplayItem): string {
  return `${it.lhs} → ${[...it.before, '•', ...it.after].join(' ')}`;
}

export const ETTPGraphVisualizer: React.FC<ETTPGraphVisualizerProps> = ({
  table,
  selectedStateId,
  onSelectState,
  activeStateId,
  activeSymbol,
  lang = 'en',
  height = '500px',
  filename = 'ettp_automaton_graph'
}) => {
  const isCz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrowMarkerId = useId().replace(/:/g, '');
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Floating tooltip state for edges & items
  const [tip, setTip] = useState<{ anchor: DOMRect; content: React.ReactNode } | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);

  const showTip = (anchor: DOMRect, content: React.ReactNode, delay = 150) => {
    window.clearTimeout(tipTimer.current);
    if (delay === 0) {
      setTip({ anchor, content });
    } else {
      tipTimer.current = window.setTimeout(() => setTip({ anchor, content }), delay);
    }
  };

  const hideTip = () => {
    window.clearTimeout(tipTimer.current);
    setTip(null);
  };

  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

  // Compute Dagre layout
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 44,
      ranksep: 85,
      marginx: 30,
      marginy: 30
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Convert and partition items for each state
    const nodesData = new Map<
      number,
      {
        kernelItems: ETTPDisplayItem[];
        closureItems: ETTPDisplayItem[];
        allItems: ETTPDisplayItem[];
        separatorY?: number;
      }
    >();

    for (const state of table.states) {
      const allItems: ETTPDisplayItem[] = state.items.map(it => {
        const isKernel = isETTPKernelItem(it, state.id, table.startStateId);
        const nextSymbol = it.dot < it.production.rhs.length ? it.production.rhs[it.dot] : undefined;
        const targetStateId = nextSymbol ? state.transitions.get(nextSymbol)?.targetStateId : undefined;
        const predictedBy = !isKernel ? findPredictionTriggers(state, it) : undefined;

        return {
          production: it.production,
          dot: it.dot,
          lhs: it.production.lhs,
          before: it.production.rhs.slice(0, it.dot),
          after: it.production.rhs.slice(it.dot),
          isKernel,
          isComplete: it.dot === it.production.rhs.length,
          nextSymbol,
          targetStateId,
          predictedBy
        };
      });

      const kernelItems = allItems.filter(i => i.isKernel);
      const closureItems = allItems.filter(i => !i.isKernel);
      const hasSeparator = kernelItems.length > 0 && closureItems.length > 0;

      const sepLabel = isCz ? 'Zbývající pravidla (predikce)' : 'Remaining rules (closure)';
      let maxLineLen = Math.max(16, sepLabel.length);
      for (const it of allItems) {
        const text = formatDisplayItem(it);
        if (text.length > maxLineLen) maxLineLen = text.length;
      }

      const width = Math.max(190, Math.min(390, Math.round(maxLineLen * CHAR_W + PADDING * 2)));
      const separatorY = hasSeparator ? HEADER_H + 8 + kernelItems.length * ITEM_LINE_H + 2 : undefined;
      const height =
        HEADER_H +
        8 +
        kernelItems.length * ITEM_LINE_H +
        (hasSeparator ? SEP_H : 0) +
        closureItems.length * ITEM_LINE_H +
        PADDING;

      nodesData.set(state.id, { kernelItems, closureItems, allItems, separatorY });
      g.setNode(String(state.id), { width, height });
    }

    // Merge parallel transitions (same from and to) into a single labeled edge
    const mergedEdges = new Map<
      string,
      {
        from: number;
        to: number;
        symbols: string[];
        reasons: ETTPTransitionReason[];
        originKind: 'kernel' | 'predicted' | 'both';
      }
    >();

    for (const state of table.states) {
      for (const [sym, trans] of state.transitions.entries()) {
        const key = `${state.id}->${trans.targetStateId}`;
        const targetState = table.states[trans.targetStateId];
        const reason = targetState ? getETTPTransitionReason(state, sym, targetState) : undefined;

        if (!mergedEdges.has(key)) {
          mergedEdges.set(key, {
            from: state.id,
            to: trans.targetStateId,
            symbols: [sym],
            reasons: reason ? [reason] : [],
            originKind: trans.originKind
          });
        } else {
          const entry = mergedEdges.get(key)!;
          if (!entry.symbols.includes(sym)) entry.symbols.push(sym);
          if (reason) entry.reasons.push(reason);
          if (entry.originKind !== trans.originKind) entry.originKind = 'both';
        }
      }
    }

    for (const e of mergedEdges.values()) {
      const label = e.symbols.join(', ');
      g.setEdge(String(e.from), String(e.to), {
        name: label,
        label,
        width: Math.max(30, label.length * 7.2 + 20),
        height: 18,
        labelpos: 'c'
      });
    }

    dagre.layout(g);

    const nodes: ETTPLayoutNode[] = table.states.map(state => {
      const n = g.node(String(state.id));
      const d = nodesData.get(state.id)!;
      return {
        id: state.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        state,
        kernelItems: d.kernelItems,
        closureItems: d.closureItems,
        allItems: [...d.kernelItems, ...d.closureItems],
        separatorY: d.separatorY
      };
    });

    const edges: ETTPLayoutEdge[] = [];
    for (const e of mergedEdges.values()) {
      const edgeInfo = g.edge(String(e.from), String(e.to));
      if (edgeInfo && edgeInfo.points) {
        edges.push({
          from: e.from,
          to: e.to,
          symbols: e.symbols,
          originKind: e.originKind,
          reasons: e.reasons,
          points: edgeInfo.points,
          labelPos: { x: edgeInfo.x, y: edgeInfo.y }
        });
      }
    }

    const graphBBox = g.graph();
    return {
      nodes,
      edges,
      width: (graphBBox.width || 800) + 60,
      height: (graphBBox.height || 600) + 60
    };
  }, [table, isCz]);

  const { view, fit, zoomBy, reveal, onPointerDown, wasDragged } = usePanZoom(
    containerRef,
    { width: layout.width, height: layout.height },
    layout.nodes.length > 0
  );

  // Active / Selected state
  const activeSelectedId = selectedStateId ?? (activeStateId ?? table.startStateId);
  const selectedState = table.states[activeSelectedId] ?? table.states[0];

  // Bring selected state into view when changed
  const revealedLayout = useRef(layout);
  useEffect(() => {
    if (revealedLayout.current !== layout) {
      revealedLayout.current = layout;
      return;
    }
    const n =
      activeSelectedId !== null && activeSelectedId !== undefined
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

  // Predecessor states and incoming transition reasons to selected state
  const incomingTransitions = useMemo(() => {
    const list: {
      fromStateId: number;
      symbol: string;
      originKind: 'kernel' | 'predicted' | 'both';
      reason?: ETTPTransitionReason;
    }[] = [];

    for (const s of table.states) {
      for (const [sym, tr] of s.transitions.entries()) {
        if (tr.targetStateId === selectedState.id) {
          const reason = getETTPTransitionReason(s, sym, selectedState);
          list.push({ fromStateId: s.id, symbol: sym, originKind: tr.originKind, reason });
        }
      }
    }
    return list;
  }, [table, selectedState]);

  // Outgoing transition reasons from selected state
  const outgoingTransitions = useMemo(() => {
    const list: {
      symbol: string;
      targetStateId: number;
      originKind: 'kernel' | 'predicted' | 'both';
      reason?: ETTPTransitionReason;
    }[] = [];

    for (const [sym, tr] of selectedState.transitions.entries()) {
      const targetState = table.states[tr.targetStateId];
      const reason = targetState ? getETTPTransitionReason(selectedState, sym, targetState) : undefined;
      list.push({ symbol: sym, targetStateId: tr.targetStateId, originKind: tr.originKind, reason });
    }
    return list;
  }, [table, selectedState]);

  // Predecessor state IDs for visual graph highlighting
  const predecessorStateIds = useMemo(() => {
    return new Set(incomingTransitions.map(t => t.fromStateId));
  }, [incomingTransitions]);

  // Successor state IDs for visual graph highlighting
  const successorStateIds = useMemo(() => {
    return new Set(outgoingTransitions.map(t => t.targetStateId));
  }, [outgoingTransitions]);

  // Incoming trigger symbols
  const incomingSymbols = useMemo(() => {
    return new Set(incomingTransitions.map(t => t.symbol));
  }, [incomingTransitions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Visualizer Canvas Container */}
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
          titleFit={isCz ? 'Zobrazit celý automat' : 'Fit whole automaton'}
          titleSvg={isCz ? 'Exportovat graf jako vektorový SVG' : 'Export graph as vector SVG'}
          titlePng={isCz ? 'Exportovat graf jako PNG (vysoké rozlišení)' : 'Export graph as high-res PNG'}
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
            <marker
              id={`${arrowMarkerId}-arrow-origin`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--color-warning)" />
            </marker>
          </defs>

          <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
            {/* Edges */}
            {layout.edges.map((e, idx) => {
              const isSelectedTarget = selectedState.id === e.to;
              const isSelectedSource = selectedState.id === e.from;
              const isActiveEdge = activeStateId === e.from && e.symbols.includes(activeSymbol ?? '');
              const isPredicted = e.originKind === 'predicted';
              const isBoth = e.originKind === 'both';

              let strokeColor = 'var(--color-border)';
              let strokeWidth = 1.3;
              let markerKind = 'arrow';

              if (isActiveEdge) {
                strokeColor = 'var(--color-primary)';
                strokeWidth = 2.4;
                markerKind = 'arrow-active';
              } else if (isSelectedTarget) {
                strokeColor = 'var(--color-warning)';
                strokeWidth = 2;
                markerKind = 'arrow-origin';
              } else if (isSelectedSource) {
                strokeColor = 'var(--color-primary)';
                strokeWidth = 1.8;
                markerKind = 'arrow-active';
              }

              const strokeDasharray = isPredicted ? '4 3' : isBoth ? '7 3 2 3' : undefined;

              return (
                <g key={`edge-${idx}`}>
                  <path
                    d={edgePath(e.points)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    markerEnd={`url(#${arrowMarkerId}-${markerKind})`}
                  />
                  {e.labelPos && (
                    <g
                      transform={`translate(${e.labelPos.x}, ${e.labelPos.y})`}
                      style={{ cursor: 'pointer' }}
                      onClick={evt => {
                        if (wasDragged()) return;
                        evt.stopPropagation();
                        onSelectState?.(e.to);
                      }}
                      onMouseEnter={evt => {
                        const targetRect = (evt.target as Element).getBoundingClientRect();
                        showTip(
                          targetRect,
                          <div style={{ maxWidth: '320px', fontSize: '11.5px', lineHeight: '1.4' }}>
                            <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '4px' }}>
                              {isCz ? 'Přechod přechodového automatu ETTP' : 'ETTP Automaton Transition'}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '6px' }}>
                              q{e.from} ──[ <strong>{e.symbols.join(', ')}</strong> ]──&gt; q{e.to}
                            </div>
                            <div style={{ marginBottom: '4px' }}>
                              <strong>{isCz ? 'Důvod přechodu (spouštěcí položky):' : 'Triggering items:'}</strong>
                              <ul style={{ margin: '3px 0 6px 16px', padding: 0 }}>
                                {e.reasons.flatMap(r => r.triggerItems).map((it, i) => (
                                  <li key={i} style={{ fontFamily: 'monospace' }}>
                                    {it.production.lhs} → {it.production.rhs.slice(0, it.dot).join(' ')} •{' '}
                                    {it.production.rhs.slice(it.dot).join(' ')}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)' }}>
                              {e.originKind === 'kernel'
                                ? (isCz ? 'Jádrový přechod: zachovává počáteční index j z předchůdce.' : 'Kernel shift: inherits origin j from predecessor.')
                                : e.originKind === 'predicted'
                                ? (isCz ? 'Predikovaný přechod: zakládá nový počáteční index i na aktuální pozici.' : 'Predicted shift: initializes origin i to current token index.')
                                : (isCz ? 'Hybridní přechod (jádrový i predikovaný).' : 'Hybrid shift (both kernel and predicted).')}
                            </div>
                          </div>,
                          100
                        );
                      }}
                      onMouseLeave={hideTip}
                    >
                      <rect
                        x={-(Math.max(28, e.symbols.join(', ').length * 7.5 + 22) / 2)}
                        y="-10"
                        width={Math.max(28, e.symbols.join(', ').length * 7.5 + 22)}
                        height="20"
                        rx="4"
                        fill="var(--color-bg-surface)"
                        stroke={isActiveEdge || isSelectedTarget || isSelectedSource ? strokeColor : 'var(--color-border)'}
                        strokeWidth={isActiveEdge || isSelectedTarget ? 1.5 : 1}
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight={700}
                        fill={isActiveEdge ? 'var(--color-primary)' : 'var(--color-text-primary)'}
                      >
                        {e.symbols.join(', ')}
                        <tspan fontSize="8" fill="var(--color-text-secondary)" dx="3">
                          [{e.originKind === 'kernel' ? 'K' : e.originKind === 'predicted' ? 'P' : 'K+P'}]
                        </tspan>
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
              const isPredecessor = predecessorStateIds.has(n.id);
              const isSuccessor = successorStateIds.has(n.id);
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
                borderWidth = 2.2;
              } else if (isPredecessor) {
                borderColor = 'var(--color-warning)';
                borderWidth = 1.6;
              } else if (isSuccessor) {
                borderColor = 'var(--color-text-secondary)';
                borderWidth = 1.4;
              }

              const leftX = n.x - n.width / 2;
              const topY = n.y - n.height / 2;
              const hasSeparator = n.kernelItems.length > 0 && n.closureItems.length > 0;

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
                  {/* Node Outer Card */}
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="7"
                    fill="var(--color-bg-surface)"
                    stroke={borderColor}
                    strokeWidth={borderWidth}
                    filter={isActive ? 'drop-shadow(0 0 6px var(--color-primary-subtle))' : undefined}
                  />

                  {/* Header Background */}
                  <path
                    d={`M 0,7 Q 0,0 7,0 L ${n.width - 7},0 Q ${n.width},0 ${n.width},7 L ${n.width},${HEADER_H} L 0,${HEADER_H} Z`}
                    fill={isSelected || isActive ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)'}
                  />

                  {/* Header Title: State ID */}
                  <text
                    x={PADDING}
                    y="18"
                    fontSize="12"
                    fontFamily="monospace"
                    fontWeight={700}
                    fill={isSelected || isActive ? 'var(--color-primary)' : 'var(--color-text-primary)'}
                  >
                    q{n.id}
                  </text>

                  {/* Badges: Start / Accept / Completions */}
                  <g transform={`translate(${n.width - PADDING}, 17)`} textAnchor="end">
                    {isStart && (
                      <text
                        x={isAccept ? -70 : hasCompletions ? -48 : 0}
                        fontSize="9"
                        fontWeight={700}
                        fill="var(--color-primary)"
                      >
                        start
                      </text>
                    )}
                    {isAccept && (
                      <text
                        x={0}
                        fontSize="9"
                        fontWeight={700}
                        fill="var(--color-success)"
                      >
                        accept
                      </text>
                    )}
                    {hasCompletions && !isAccept && (
                      <text
                        x={0}
                        fontSize="9"
                        fontWeight={700}
                        fill="var(--color-warning)"
                      >
                        red({n.state.completions.length})
                      </text>
                    )}
                  </g>

                  {/* Header Bottom Border */}
                  <line
                    x1="0"
                    y1={HEADER_H}
                    x2={n.width}
                    y2={HEADER_H}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                  />

                  {/* 1. Core / Kernel Items Section */}
                  {n.kernelItems.map((it, idx) => {
                    const itemY = HEADER_H + 16 + idx * ITEM_LINE_H;
                    const isOriginItem = isSelected && it.dot > 0 && incomingSymbols.has(it.before[it.before.length - 1]);
                    const hasNavigableTarget = it.targetStateId !== undefined;

                    return (
                      <g
                        key={`kernel-${idx}`}
                        onClick={evt => {
                          if (hasNavigableTarget && !wasDragged()) {
                            evt.stopPropagation();
                            onSelectState?.(it.targetStateId!);
                          }
                        }}
                        onMouseEnter={evt => {
                          const targetRect = (evt.target as Element).getBoundingClientRect();
                          showTip(
                            targetRect,
                            <div style={{ maxWidth: '300px', fontSize: '11px', lineHeight: '1.4' }}>
                              <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '3px' }}>
                                {isCz ? 'Jádrová položka (Core item)' : 'Core / Kernel Item'}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11.5px', marginBottom: '4px' }}>
                                {it.lhs} → {it.before.join(' ')} • {it.after.join(' ')}
                              </div>
                              <div style={{ color: 'var(--color-text-secondary)' }}>
                                {it.isComplete
                                  ? (isCz ? 'Dokončené pravidlo (připraveno k redukci).' : 'Completed rule (ready for completion reduction).')
                                  : it.nextSymbol
                                  ? (isCz
                                      ? `Očekává symbol '${it.nextSymbol}' pro přechod do stavu q${it.targetStateId}.`
                                      : `Awaits symbol '${it.nextSymbol}' to transition to state q${it.targetStateId}.`)
                                  : ''}
                              </div>
                            </div>,
                            100
                          );
                        }}
                        onMouseLeave={hideTip}
                      >
                        {isOriginItem && (
                          <rect
                            x="4"
                            y={itemY - 12}
                            width={n.width - 8}
                            height={ITEM_LINE_H - 2}
                            rx="3"
                            fill="var(--color-warning-subtle)"
                            opacity={0.6}
                          />
                        )}
                        <text
                          x={PADDING}
                          y={itemY}
                          fontSize="10"
                          fontFamily="monospace"
                          fill={
                            it.isComplete
                              ? 'var(--color-warning)'
                              : 'var(--color-text-primary)'
                          }
                        >
                          <tspan fontWeight={600}>{it.lhs}</tspan> → {it.before.join(' ')}
                          {it.before.length > 0 ? ' ' : ''}
                          <tspan fill="var(--color-primary)" fontWeight={700}>
                            •
                          </tspan>
                          {it.after.length > 0 ? ` ${it.after.join(' ')}` : ''}
                        </text>
                      </g>
                    );
                  })}

                  {/* 2. Divider between Core and Remaining Rules */}
                  {hasSeparator && n.separatorY && (
                    <g>
                      <line
                        x1="8"
                        y1={n.separatorY}
                        x2={n.width - 8}
                        y2={n.separatorY}
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        strokeWidth="0.8"
                      />
                      <rect
                        x={PADDING}
                        y={n.separatorY - 6.5}
                        width={isCz ? 134 : 124}
                        height="13"
                        rx="3"
                        fill="var(--color-bg-base)"
                        stroke="var(--color-border)"
                        strokeWidth="0.7"
                      />
                      <text
                        x={PADDING + 5}
                        y={n.separatorY + 3}
                        fontSize="8"
                        fontWeight={600}
                        fill="var(--color-text-secondary)"
                        letterSpacing="0.2px"
                      >
                        {isCz ? 'Zbývající pravidla (predikce)' : 'Remaining rules (closure)'}
                      </text>
                    </g>
                  )}

                  {/* 3. Prediction Closure / Remaining Rules Section */}
                  {n.closureItems.map((it, idx) => {
                    const itemY =
                      HEADER_H +
                      16 +
                      n.kernelItems.length * ITEM_LINE_H +
                      (hasSeparator ? SEP_H : 0) +
                      idx * ITEM_LINE_H;
                    const hasNavigableTarget = it.targetStateId !== undefined;

                    return (
                      <g
                        key={`closure-${idx}`}
                        onClick={evt => {
                          if (hasNavigableTarget && !wasDragged()) {
                            evt.stopPropagation();
                            onSelectState?.(it.targetStateId!);
                          }
                        }}
                        onMouseEnter={evt => {
                          const targetRect = (evt.target as Element).getBoundingClientRect();
                          showTip(
                            targetRect,
                            <div style={{ maxWidth: '320px', fontSize: '11px', lineHeight: '1.4' }}>
                              <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '3px' }}>
                                {isCz ? 'Zbývající pravidlo (Predikovaný uzávěr)' : 'Remaining Rule (Prediction Closure)'}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11.5px', marginBottom: '4px' }}>
                                {it.lhs} → • {it.after.join(' ')}
                              </div>
                              <div style={{ color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                                {isCz
                                  ? `Pravidlo bylo do stavu doplněno prediktorem, protože neterminál '${it.lhs}' následuje za tečkou v jiné položce stavu.`
                                  : `This rule was expanded by the predictor because non-terminal '${it.lhs}' appears after the dot in another item of this state.`}
                              </div>
                              {it.predictedBy && it.predictedBy.length > 0 && (
                                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                                  <strong>{isCz ? 'Vyvoláno z položky:' : 'Triggered by:'}</strong>{' '}
                                  {it.predictedBy.map(p => `${p.production.lhs} → ... • ${it.lhs} ...`).join(', ')}
                                </div>
                              )}
                            </div>,
                            100
                          );
                        }}
                        onMouseLeave={hideTip}
                      >
                        <text
                          x={PADDING + 6}
                          y={itemY}
                          fontSize="9.5"
                          fontFamily="monospace"
                          fill="var(--color-text-secondary)"
                        >
                          <tspan fill="var(--color-text-tertiary)">↳ </tspan>
                          <tspan fontWeight={500}>{it.lhs}</tspan> → <tspan fill="var(--color-primary)" fontWeight={700}>•</tspan>
                          {it.after.length > 0 ? ` ${it.after.join(' ')}` : ''}
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

      {/* State Educational Derivation Inspector (Comprehensive 4-Panel Drawer) */}
      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--color-primary)',
          backgroundColor: 'var(--color-bg-surface)',
          padding: '14px 16px'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="var(--color-primary)" />
            <span style={{ fontWeight: 700, fontSize: '14px' }}>
              {isCz
                ? `Inspekce odvození stavu q${selectedState.id} a jeho přechodů`
                : `Derivation Analysis for State q${selectedState.id} & Transitions`}
            </span>
            {selectedState.id === table.startStateId && (
              <span className="badge badge-info">{isCz ? 'Počáteční stav' : 'Start State'}</span>
            )}
            {selectedState.isAcceptState && (
              <span className="badge badge-success">
                {isCz ? 'Přijímající stav (S\' → S •)' : 'Accepting State (S\' → S •)'}
              </span>
            )}
            {selectedState.completions.length > 0 && (
              <span className="badge badge-warning">
                {isCz ? `${selectedState.completions.length} redukcí` : `${selectedState.completions.length} completions`}
              </span>
            )}
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
            <strong>
              {selectedState.items.filter(it => isETTPKernelItem(it, selectedState.id, table.startStateId)).length}
            </strong>{' '}
            {isCz ? 'jádrových položek (core)' : 'kernel items'} +{' '}
            <strong>
              {selectedState.items.filter(it => !isETTPKernelItem(it, selectedState.id, table.startStateId)).length}
            </strong>{' '}
            {isCz ? 'zbývajících pravidel (predikovaný uzávěr)' : 'remaining prediction rules'}
          </span>
        </div>

        {/* 4-Panel Breakdown Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            marginTop: '12px'
          }}
        >
          {/* Panel 1: Core / Kernel & Origin */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>{isCz ? '1. Jádro stavu a vznik (Core & Origin)' : '1. State Core & Origin'}</span>
            </div>

            {selectedState.id === table.startStateId ? (
              <div style={{ fontSize: '11.5px', lineHeight: '1.45' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                  [S' → • {table.grammar.startSymbol}]
                </p>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                  {isCz
                    ? 'Počáteční stav q0 vznikl inicializací rozšířené gramatiky v nulté stavové množině S₀.'
                    : 'Initial state q0 was created by initializing the augmented axiom in the start set S₀.'}
                </span>
              </div>
            ) : incomingTransitions.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Žádné přímé vstupní přechody' : 'No direct incoming transitions'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {incomingTransitions.map((tr, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: '11.5px',
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span
                        style={{ fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', color: 'var(--color-primary)' }}
                        onClick={() => onSelectState?.(tr.fromStateId)}
                        title={isCz ? `Kliknutím přejdete na stav q${tr.fromStateId}` : `Click to jump to state q${tr.fromStateId}`}
                      >
                        q{tr.fromStateId} ──[ '{tr.symbol}' ]──&gt; q{selectedState.id}
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {tr.originKind}
                      </span>
                    </div>

                    {tr.reason && tr.reason.triggerItems.length > 0 && (
                      <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
                        <div>
                          {isCz ? 'Posun tečky:' : 'Dot advance:'}{' '}
                          {tr.reason.triggerItems.map(it => `${it.production.lhs} → ... • ${tr.symbol} ...`).join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 2: Remaining Rules / Prediction Closure */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                marginBottom: '6px'
              }}
            >
              {isCz ? '2. Zbývající pravidla (Predikovaný uzávěr)' : '2. Remaining Rules (Prediction Closure)'}
            </div>

            {selectedState.items.filter(it => !isETTPKernelItem(it, selectedState.id, table.startStateId)).length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Tento stav neobsahuje žádná další predikovaná pravidla (uzávěr je prázdný).' : 'No prediction rules in this state (empty closure).'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {selectedState.items
                  .filter(it => !isETTPKernelItem(it, selectedState.id, table.startStateId))
                  .map((it, idx) => {
                    const triggers = findPredictionTriggers(selectedState, it);
                    return (
                      <div
                        key={idx}
                        style={{
                          fontSize: '11px',
                          padding: '4px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border)',
                          fontFamily: 'monospace'
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {it.production.lhs} → • {it.production.rhs.join(' ') || 'ε'}
                        </div>
                        {triggers.length > 0 && (
                          <div style={{ fontSize: '9.5px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                            {isCz ? 'Vyvoláno z položky:' : 'Predicted from:'}{' '}
                            {triggers.map(t => `${t.production.lhs} → ... • ${it.production.lhs} ...`).join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Panel 3: Outgoing Transitions & Reasons */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                marginBottom: '6px'
              }}
            >
              {isCz ? '3. Výstupní přechody δ(q, X) a jejich důvody' : '3. Outgoing Transitions δ(q, X) & Reasons'}
            </div>

            {outgoingTransitions.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Koncový stav bez dalších výstupních přechodů' : 'Leaf state with no outgoing transitions'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {outgoingTransitions.map((tr, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: '11px',
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{ fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer', color: 'var(--color-primary)' }}
                        onClick={() => onSelectState?.(tr.targetStateId)}
                        title={isCz ? `Kliknutím přejdete na stav q${tr.targetStateId}` : `Click to jump to state q${tr.targetStateId}`}
                      >
                        '{tr.symbol}' ──&gt; q{tr.targetStateId}
                      </span>
                      <span className="badge badge-secondary" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {tr.originKind}
                      </span>
                    </div>

                    {tr.reason && (
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
                        <strong>{isCz ? 'Důvod:' : 'Reason:'}</strong>{' '}
                        {tr.reason.triggerItems.map(it => `${it.production.lhs} → ... • ${tr.symbol} ...`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 4: Completed Rules & Completer Reductions */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--color-warning)',
                marginBottom: '6px'
              }}
            >
              {isCz ? '4. Dokončená pravidla (Redukce kompletoru)' : '4. Completed Rules (Completer Reductions)'}
            </div>

            {selectedState.completions.length === 0 ? (
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                {isCz ? 'Žádné pravidlo zde nekončí (žádná redukce)' : 'No rule reduces in this state'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {selectedState.completions.map((c, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: '11.5px',
                      fontFamily: 'monospace',
                      color: 'var(--color-warning)',
                      padding: '4px 6px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    ✓ {c.production.lhs} → {c.production.rhs.join(' ') || 'ε'}
                    {c.isEmpty && (
                      <span style={{ fontSize: '9.5px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                        (ε-redukce)
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>
                  {isCz
                    ? 'Při dokončení pravidla [A → γ •, j] vyhledá Earleyho kompletor v množině S_j položky s tečkou před A a posune v nich tečku do aktuální množiny.'
                    : 'When rule [A → γ •, j] completes, the Earley Completer scans back to set S_j to advance all items waiting for A into the current set.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
