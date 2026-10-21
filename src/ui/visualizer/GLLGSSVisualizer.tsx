/**
 * The graph-structured stack of GLL (Scott & Johnstone 2010, 2013): nodes (L, i) — a call
 * at position i returning to the slot L — with edges to their callers, down to the base
 * node u₀ = (L₀, 0). The whole final GSS is laid out once, so nodes keep their places
 * while stepping; only the part created up to the shown step is drawn.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { GLLResult, formatSlot, gssNodeName } from '../../core/gll/gllParser';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';

interface Props {
  result: GLLResult;
  /** Show the GSS as it was after this step */
  step: number;
  /** Node of the descriptor processed in this step */
  activeNode?: number;
  /** Nodes popped in this step */
  poppedNodes?: Set<number>;
  lang: Language;
  height?: string;
}

const MARGIN = 24;
const NODE_H = 44;
/** Below this scale the node labels are too small to read. */
const READABLE_SCALE = 0.7;

const nodeWidth = (text: string) => Math.max(90, Math.round(text.length * 6.6) + 22);

export const GLLGSSVisualizer: React.FC<Props> = ({ result, step, activeNode, poppedNodes, lang, height = '360px' }) => {
  const cz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markerId = useId().replace(/:/g, '');
  const [exporting, setExporting] = useState(false);

  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph({ multigraph: false });
    g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 46, marginx: MARGIN, marginy: MARGIN });
    g.setDefaultEdgeLabel(() => ({}));
    const labels = result.gssNodes.map(u => (u.slot ? formatSlot(u.slot) : 'L₀'));
    result.gssNodes.forEach((u, idx) => g.setNode(String(u.id), { width: nodeWidth(labels[idx]), height: NODE_H }));
    // caller on the left, callee on the right; the arrow points back to the caller as in the papers
    for (const e of result.gssEdges) g.setEdge(String(e.to), String(e.from));
    dagre.layout(g);
    const nodes = result.gssNodes.map((u, idx) => {
      const d = g.node(String(u.id));
      return { u, label: labels[idx], x: d?.x ?? 0, y: d?.y ?? 0, w: nodeWidth(labels[idx]) };
    });
    const edges = result.gssEdges.map(e => ({ e, points: g.edge(String(e.to), String(e.from))?.points ?? [] }));
    const info = g.graph();
    return { nodes, edges, width: Math.max(info.width ?? 300, 200), height: Math.max(info.height ?? 120, 100) };
  }, [result]);

  const pops = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const p of result.popSet) if (p.createdAt <= step) m.set(p.node, [...(m.get(p.node) ?? []), p.index]);
    return m;
  }, [result, step]);

  const { view, fit, zoomBy, frame, onPointerDown, isDragging } = usePanZoom(containerRef, { width: layout.width, height: layout.height }, layout.nodes.length > 0);
  // A GSS that fits the canvas at a readable scale is shown whole (usePanZoom fits it once per run).
  // A larger one would be too small to read: keep the active node, its edges and the nodes popped
  // in this step in view at a readable scale instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fitted = Math.min((r.width - 40) / layout.width, (r.height - 78) / layout.height);
    if (fitted >= READABLE_SCALE) return;
    const active = activeNode ?? 0;
    const ids = new Set<number>([active, ...(poppedNodes ?? [])]);
    for (const { e } of layout.edges) {
      if (e.createdAt > step) continue;
      if (e.from === active || e.to === active) ids.add(e.from === active ? e.to : e.from);
    }
    const box = layout.nodes.filter(n => ids.has(n.u.id) && n.u.createdAt <= step);
    if (box.length === 0) return;
    const x0 = Math.min(...box.map(n => n.x - n.w / 2)) - 30;
    const x1 = Math.max(...box.map(n => n.x + n.w / 2)) + 30;
    const y0 = Math.min(...box.map(n => n.y - NODE_H / 2)) - 40;
    const y1 = Math.max(...box.map(n => n.y + NODE_H / 2)) + 40;
    // the readable scale, or less when the neighbourhood needs it (never below READABLE_SCALE)
    const k = Math.max(READABLE_SCALE, Math.min(1, (r.width - 20) / (x1 - x0), (r.height - 20) / (y1 - y0)));
    frame(x0, y0, x1 - x0, y1 - y0, k);
  }, [step, activeNode, poppedNodes, layout, frame]);
  const exportBounds = { width: Math.ceil(layout.width + 2 * MARGIN), height: Math.ceil(layout.height + 2 * MARGIN) };
  const exportTransform = `translate(${MARGIN}, ${MARGIN})`;

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ position: 'relative', width: '100%', height, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-base)', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      onPointerDown={onPointerDown}
    >
      <GraphToolbar
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onFit={fit}
        onExportSvg={() => svgRef.current && exportSvgFile(svgRef.current, 'gll_gss', exportBounds, exportTransform)}
        onExportPng={async () => {
          if (!svgRef.current || exporting) return;
          setExporting(true);
          try {
            await exportPngFile(svgRef.current, 'gll_gss', exportBounds, 2, exportTransform);
          } finally {
            setExporting(false);
          }
        }}
        isExportingPng={exporting}
        lang={lang}
      />
      <div className="graph-caption" style={{ pointerEvents: 'none' }}>
        {cz
          ? 'Uzel (L, i): volání na pozici i s návratem do slotu L; šipka vede k volajícímu. P: pozice, na kterých se volání vrátilo.'
          : 'Node (L, i): a call at position i returning to slot L; the arrow leads to the caller. P: positions at which the call returned.'}
      </div>
      <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <marker id={`${markerId}-a`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-text-muted)" />
          </marker>
          <marker id={`${markerId}-n`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-primary)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {layout.edges.map(({ e, points }, idx) => {
            if (e.createdAt > step) return null;
            const isNew = e.createdAt === step;
            return (
              <path
                key={idx}
                d={edgePath(points)}
                fill="none"
                stroke={isNew ? 'var(--color-primary)' : 'var(--color-text-muted)'}
                strokeWidth={isNew ? 2.4 : 1.4}
                markerStart={`url(#${markerId}-${isNew ? 'n' : 'a'})`}
              />
            );
          })}
          {layout.nodes.map(({ u, label, x, y, w }) => {
            if (u.createdAt > step) return null;
            const isNew = u.createdAt === step && step > 0;
            const isActive = activeNode === u.id;
            const popped = poppedNodes?.has(u.id);
            const ps = pops.get(u.id);
            return (
              <g key={u.id} transform={`translate(${x - w / 2}, ${y - NODE_H / 2})`}>
                <title>{`${gssNodeName(u.id)} = (${label}, ${u.index})${ps ? `\nP: ${ps.join(', ')}` : ''}`}</title>
                <rect
                  width={w}
                  height={NODE_H}
                  rx="7"
                  fill={isActive ? 'var(--color-primary-subtle)' : 'var(--color-bg-surface)'}
                  stroke={isActive || isNew ? 'var(--color-primary)' : popped ? 'var(--color-warning)' : 'var(--color-border)'}
                  strokeWidth={isActive || isNew || popped ? 2.2 : 1.2}
                  strokeDasharray={popped && !isActive ? '4 2' : undefined}
                />
                <text x="8" y="16" fontSize="11" fontWeight="700" fill="var(--color-text-primary)">
                  {gssNodeName(u.id)}
                  <tspan fontWeight="400" fill="var(--color-text-secondary)">{`  i = ${u.index}`}</tspan>
                </text>
                <text x="8" y="31" fontSize="10.5" fontFamily="monospace" fill="var(--color-text-primary)">{label}</text>
                {ps && (
                  <text x={w - 6} y="16" fontSize="9.5" textAnchor="end" fill="var(--color-warning)">{`P: ${ps.join(',')}`}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
