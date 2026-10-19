/**
 * A shared packed parse forest (SPPF) in one picture: symbol nodes (X, i, j) as rounded
 * boxes, intermediate nodes of the binarised form as dashed boxes, packed nodes as small
 * circles, terminals and ε as leaves. A node with two or more packed nodes — a place where
 * the word has different derivations — is drawn in the warning colour; the nodes of one
 * chosen tree can be highlighted.
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import dagre from 'dagre';
import { SharedPackedForest, ForestNode } from '../../core/forest/sppf';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';
import { edgePath } from './graphUtils';
import { GraphToolbar } from './GraphToolbar';

interface Props {
  forest: SharedPackedForest;
  tokens: string[];
  highlight?: Set<string>;
  lang: Language;
  height?: string;
}

const MARGIN = 24;
const PACKED_R = 6;

function size(x: ForestNode): { w: number; h: number; text: string } {
  if (x.kind === 'packed') return { w: PACKED_R * 2, h: PACKED_R * 2, text: '' };
  if (x.kind === 'terminal') return { w: Math.max(30, x.label.length * 8 + 16), h: 24, text: x.label };
  if (x.kind === 'epsilon') return { w: 28, h: 24, text: 'ε' };
  const text = `${x.label}, ${x.i}, ${x.j}`;
  return { w: Math.max(56, Math.round(text.length * 6.8) + 18), h: 28, text };
}

export const ForestVisualizer: React.FC<Props> = ({ forest, tokens, highlight, lang, height = '420px' }) => {
  const cz = lang === 'cz';
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markerId = useId().replace(/:/g, '');
  const [exporting, setExporting] = useState(false);
  const ambiguous = useMemo(() => new Set(forest.ambiguous), [forest]);
  /** Packed nodes of an ambiguous node: labelled with their rule, so the alternatives can be told apart */
  const alternatives = useMemo(() => new Set(forest.ambiguous.flatMap(id => forest.nodes.get(id)?.children ?? [])), [forest]);

  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 14, ranksep: 30, marginx: MARGIN, marginy: MARGIN });
    g.setDefaultEdgeLabel(() => ({}));
    const sizes = new Map<string, ReturnType<typeof size>>();
    for (const x of forest.nodes.values()) {
      const s = size(x);
      sizes.set(x.id, s);
      g.setNode(x.id, { width: s.w, height: s.h });
    }
    for (const x of forest.nodes.values()) for (const c of x.children) if (forest.nodes.has(c)) g.setEdge(x.id, c);
    dagre.layout(g);
    const nodes = [...forest.nodes.values()].map(x => {
      const d = g.node(x.id);
      return { x, s: sizes.get(x.id)!, cx: d?.x ?? 0, cy: d?.y ?? 0 };
    });
    // The leaves are put on the bottom row in input order (the yield reads left to right),
    // on the horizontal places dagre gave them; their edges become straight lines.
    const leaves = nodes.filter(n => n.x.kind === 'terminal' || n.x.kind === 'epsilon');
    const xs = leaves.map(n => n.cx).sort((a, b) => a - b);
    const bottom = Math.max(0, ...leaves.map(n => n.cy));
    leaves.sort((a, b) => a.x.i - b.x.i || (a.x.kind === 'epsilon' ? -1 : 1) - (b.x.kind === 'epsilon' ? -1 : 1));
    leaves.forEach((n, k) => {
      n.cx = xs[k];
      n.cy = bottom;
    });
    const at = new Map(nodes.map(n => [n.x.id, n]));
    const edges: { from: string; to: string; points: { x: number; y: number }[] }[] = [];
    for (const x of forest.nodes.values()) {
      for (const c of x.children) {
        const to = at.get(c);
        if (!to) continue;
        const from = at.get(x.id)!;
        const isLeaf = to.x.kind === 'terminal' || to.x.kind === 'epsilon';
        edges.push({
          from: x.id,
          to: c,
          points: isLeaf ? [{ x: from.cx, y: from.cy + from.s.h / 2 }, { x: to.cx, y: to.cy - to.s.h / 2 }] : g.edge(x.id, c)?.points ?? []
        });
      }
    }
    const info = g.graph();
    return { nodes, edges, width: Math.max(info.width ?? 300, 200), height: Math.max(info.height ?? 150, 100) };
  }, [forest, tokens]);

  const { view, fit, zoomBy, onPointerDown, isDragging } = usePanZoom(containerRef, { width: layout.width, height: layout.height }, layout.nodes.length > 0);
  const exportBounds = { width: Math.ceil(layout.width + 2 * MARGIN), height: Math.ceil(layout.height + 2 * MARGIN) };
  const exportTransform = `translate(${MARGIN}, ${MARGIN})`;
  const on = (id: string) => !highlight || highlight.has(id);

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
        onExportSvg={() => svgRef.current && exportSvgFile(svgRef.current, 'sppf', exportBounds, exportTransform)}
        onExportPng={async () => {
          if (!svgRef.current || exporting) return;
          setExporting(true);
          try {
            await exportPngFile(svgRef.current, 'sppf', exportBounds, 2, exportTransform);
          } finally {
            setExporting(false);
          }
        }}
        isExportingPng={exporting}
        lang={lang}
      />
      <div className="graph-caption" style={{ pointerEvents: 'none' }}>
        {cz
          ? 'Uzel (X, i, j): X odvodí w[i..j); ● zabalený uzel = jedno odvození; oranžový uzel má více odvození (nejednoznačnost).'
          : 'Node (X, i, j): X derives w[i..j); ● packed node = one derivation; an orange node has several derivations (ambiguity).'}
      </div>
      <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <marker id={`${markerId}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-text-muted)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {layout.edges.map((e, idx) => {
            const lit = highlight && highlight.has(e.from) && highlight.has(e.to);
            return (
              <path
                key={idx}
                d={edgePath(e.points)}
                fill="none"
                stroke={lit ? 'var(--color-primary)' : 'var(--color-text-muted)'}
                strokeWidth={lit ? 2 : 1}
                opacity={highlight && !lit ? 0.35 : 0.9}
                markerEnd={`url(#${markerId}-a)`}
              />
            );
          })}
          {layout.nodes.map(({ x, s, cx, cy }) => {
            const lit = highlight?.has(x.id);
            const dim = highlight && !lit ? 0.4 : 1;
            if (x.kind === 'packed') {
              return (
                <g key={x.id} opacity={dim}>
                  <title>{`${cz ? 'zabalený uzel' : 'packed node'}: ${x.label}${x.pivot !== undefined ? `, k = ${x.pivot}` : ''}`}</title>
                  <circle cx={cx} cy={cy} r={PACKED_R} fill={lit ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
                  {alternatives.has(x.id) && (
                    <text x={cx + PACKED_R + 3} y={cy + 3.5} fontSize="9.5" fontFamily="monospace" fill={lit ? 'var(--color-primary)' : 'var(--color-warning)'}>
                      {x.label}
                      {x.pivot !== undefined ? `, k=${x.pivot}` : ''}
                    </text>
                  )}
                </g>
              );
            }
            const amb = ambiguous.has(x.id);
            const leaf = x.kind === 'terminal' || x.kind === 'epsilon';
            const stroke = amb ? 'var(--color-warning)' : lit ? 'var(--color-primary)' : 'var(--color-border)';
            return (
              <g key={x.id} transform={`translate(${cx - s.w / 2}, ${cy - s.h / 2})`} opacity={dim}>
                <title>
                  {leaf
                    ? `${x.label} (${x.i}, ${x.j})`
                    : `${x.kind === 'symbol' ? (cz ? 'symbolový uzel' : 'symbol node') : (cz ? 'mezilehlý uzel' : 'intermediate node')} (${x.label}, ${x.i}, ${x.j}) — ${tokens.slice(x.i, x.j).join(' ') || 'ε'}${amb ? (cz ? `\n${x.children.length} odvození` : `\n${x.children.length} derivations`) : ''}`}
                </title>
                {lit && amb && <rect x={-4} y={-4} width={s.w + 8} height={s.h + 8} rx={15} fill="none" stroke="var(--color-primary)" strokeWidth={2} />}
                {leaf ? (
                  <rect width={s.w} height={s.h} rx="3" fill="var(--color-bg-surface)" stroke={lit ? 'var(--color-primary)' : 'var(--color-border-subtle)'} />
                ) : (
                  <rect
                    width={s.w}
                    height={s.h}
                    rx={x.kind === 'symbol' ? 12 : 3}
                    fill={amb ? 'var(--color-warning-subtle)' : 'var(--color-bg-surface)'}
                    stroke={stroke}
                    strokeWidth={amb ? 2.5 : lit ? 2 : 1.2}
                    strokeDasharray={x.kind === 'intermediate' ? '4 2' : undefined}
                  />
                )}
                <text
                  x={s.w / 2}
                  y={s.h / 2 + 4}
                  textAnchor="middle"
                  fontSize={leaf ? 12 : 11}
                  fontWeight={leaf ? 700 : 600}
                  fontFamily={x.kind === 'intermediate' ? 'monospace' : undefined}
                  fill={leaf ? 'var(--color-success)' : 'var(--color-text-primary)'}
                >
                  {s.text}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
