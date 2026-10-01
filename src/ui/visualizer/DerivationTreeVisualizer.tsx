/**
 * Interactive SVG Parse / Derivation Tree Visualizer.
 *
 * Uses its own tidy-tree layout instead of a general graph layout so that the
 * children of every node keep their left-to-right order: the leaves then read
 * as the yield of the tree (or as the current sentential form while the tree
 * is being built). Optionally all leaves are aligned on the bottom row.
 */

import React, { useMemo, useRef, useState } from 'react';
import { DerivationNode } from '../../core/generator/wordGenerator';
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon, AlignVerticalJustifyEnd } from 'lucide-react';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';
import { usePanZoom } from './usePanZoom';

interface DerivationTreeVisualizerProps {
  rootNode?: DerivationNode;
  height?: string;
  filename?: string;
  lang?: Language;
}

interface PlacedNode {
  id: string;
  symbol: string;
  isTerminal: boolean;
  isLeaf: boolean;
  hidden: boolean;
  x: number;
  y: number;
  width: number;
  depth: number;
  children: PlacedNode[];
}

const NODE_H = 30;
const LEVEL_GAP = 58;
const H_GAP = 14;
const MARGIN = 20;

function nodeWidth(symbol: string, isTerminal: boolean): number {
  return Math.max(34, Math.round(symbol.length * (isTerminal ? 8.2 : 8.8) + 20));
}

function layoutTree(root: DerivationNode, alignLeaves: boolean) {
  const rightEdge: number[] = [];
  // With aligned leaves all leaves share the bottom row, so they need their own contour
  let leafEdge = -Infinity;
  let maxDepth = 0;

  const shift = (n: PlacedNode, dx: number) => {
    n.x += dx;
    n.children.forEach(c => shift(c, dx));
  };
  const updateEdges = (n: PlacedNode) => {
    if (n.hidden) {
      n.children.forEach(updateEdges);
      return;
    }
    rightEdge[n.depth] = Math.max(rightEdge[n.depth] ?? -Infinity, n.x + n.width / 2);
    if (alignLeaves && n.children.length === 0) leafEdge = Math.max(leafEdge, n.x + n.width / 2);
    n.children.forEach(updateEdges);
  };
  const minGapShift = (n: PlacedNode): number => {
    // How far must this subtree move right so that no level overlaps what is already placed?
    let need = 0;
    const visit = (m: PlacedNode) => {
      if (!m.hidden) {
        const edge = rightEdge[m.depth];
        if (edge !== undefined) need = Math.max(need, edge + H_GAP - (m.x - m.width / 2));
        if (alignLeaves && m.children.length === 0 && leafEdge > -Infinity) {
          need = Math.max(need, leafEdge + H_GAP - (m.x - m.width / 2));
        }
      }
      m.children.forEach(visit);
    };
    visit(n);
    return need;
  };

  const place = (n: DerivationNode, depth: number): PlacedNode => {
    const hidden = !!n.isForestRoot;
    const kids = n.children || [];
    maxDepth = Math.max(maxDepth, depth);
    const width = hidden ? 0 : nodeWidth(n.symbol, n.isTerminal);

    if (kids.length === 0) {
      const p: PlacedNode = {
        id: n.id, symbol: n.symbol, isTerminal: n.isTerminal, isLeaf: true, hidden,
        x: width / 2, y: depth * LEVEL_GAP, width, depth, children: []
      };
      const s = minGapShift(p);
      if (s > 0) shift(p, s);
      updateEdges(p);
      return p;
    }

    const children = kids.map(c => place(c, hidden ? depth : depth + 1));
    const x = (children[0].x + children[children.length - 1].x) / 2;
    const p: PlacedNode = {
      id: n.id, symbol: n.symbol, isTerminal: n.isTerminal, isLeaf: false, hidden,
      x, y: depth * LEVEL_GAP, width, depth, children
    };
    if (!hidden) {
      const edge = rightEdge[depth];
      if (edge !== undefined && p.x - width / 2 < edge + H_GAP) {
        shift(p, edge + H_GAP - (p.x - width / 2));
      }
      // The whole subtree may have moved: refresh the right contour of every level it spans
      updateEdges(p);
    }
    return p;
  };

  const root0 = place(root, 0);
  const all: PlacedNode[] = [];
  const collect = (n: PlacedNode) => {
    all.push(n);
    n.children.forEach(collect);
  };
  collect(root0);

  if (alignLeaves) {
    for (const n of all) if (n.isLeaf) n.y = maxDepth * LEVEL_GAP;
  }

  const visibleNodes = all.filter(n => !n.hidden);
  const minX = Math.min(...visibleNodes.map(n => n.x - n.width / 2));
  const maxX = Math.max(...visibleNodes.map(n => n.x + n.width / 2));
  for (const n of all) n.x -= minX;

  const edges: { from: PlacedNode; to: PlacedNode }[] = [];
  for (const n of all) {
    if (n.hidden) continue;
    for (const c of n.children) edges.push({ from: n, to: c });
  }

  const leaves = all.filter(n => n.isLeaf && !n.hidden);
  return {
    nodes: visibleNodes,
    edges,
    leaves,
    width: maxX - minX,
    height: maxDepth * LEVEL_GAP + NODE_H
  };
}

export const DerivationTreeVisualizer: React.FC<DerivationTreeVisualizerProps> = ({
  rootNode,
  height = '380px',
  filename = 'parse_tree',
  lang = 'en'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [alignLeaves, setAlignLeaves] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const isCz = lang === 'cz';

  const layout = useMemo(() => (rootNode ? layoutTree(rootNode, alignLeaves) : null), [rootNode, alignLeaves]);
  const content = { width: layout?.width ?? 0, height: layout?.height ?? 0 };
  const { view, fit, zoomBy, onPointerDown, isDragging } = usePanZoom(containerRef, content, !!layout);

  if (!rootNode || !layout) {
    return (
      <div className="graph-empty" style={{ height }}>
        {isCz ? 'Pro tento krok není k dispozici žádný strom.' : 'No derivation tree available for this step.'}
      </div>
    );
  }

  const frontier = layout.leaves.map(l => l.symbol).filter(s => s !== 'ε');
  const isComplete = layout.leaves.every(l => l.isTerminal);
  const exportBounds = { width: Math.ceil(layout.width + 2 * MARGIN), height: Math.ceil(layout.height + 2 * MARGIN) };
  const exportTransform = `translate(${MARGIN}, ${MARGIN})`;

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      style={{ height, cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
    >
      <div className="graph-toolbar">
        <button className="btn-icon" title={isCz ? 'Přiblížit' : 'Zoom in'} onClick={() => zoomBy(1.2)}>
          <ZoomIn size={14} />
        </button>
        <button className="btn-icon" title={isCz ? 'Oddálit' : 'Zoom out'} onClick={() => zoomBy(1 / 1.2)}>
          <ZoomOut size={14} />
        </button>
        <button className="btn-icon" title={isCz ? 'Zobrazit celý strom' : 'Fit whole tree'} onClick={fit}>
          <Maximize2 size={14} />
        </button>
        <button
          className={`btn-icon ${alignLeaves ? 'active' : ''}`}
          title={isCz ? 'Zarovnat listy do jednoho řádku (výsledné slovo / větná forma)' : 'Align leaves on one row (yield / sentential form)'}
          onClick={() => setAlignLeaves(a => !a)}
        >
          <AlignVerticalJustifyEnd size={14} />
        </button>
        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border)', margin: '0 2px' }} />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 6px', fontSize: '10.5px', height: '22px', gap: '3px' }}
          title={isCz ? 'Exportovat SVG' : 'Export SVG'}
          onClick={() => svgRef.current && exportSvgFile(svgRef.current, filename, exportBounds, exportTransform)}
        >
          <Download size={11} />
          <span>SVG</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 6px', fontSize: '10.5px', height: '22px', gap: '3px' }}
          title={isCz ? 'Exportovat PNG' : 'Export PNG'}
          disabled={isExportingPng}
          onClick={async () => {
            if (!svgRef.current || isExportingPng) return;
            setIsExportingPng(true);
            try {
              await exportPngFile(svgRef.current, filename, exportBounds, 2, exportTransform);
            } catch (err) {
              console.error('Failed to export PNG:', err);
            } finally {
              setIsExportingPng(false);
            }
          }}
        >
          <ImageIcon size={11} />
          <span>{isExportingPng ? '...' : 'PNG'}</span>
        </button>
      </div>

      <div className="graph-caption" title={frontier.join(' ')}>
        {isComplete
          ? (isCz ? 'Výsledek (listy): ' : 'Yield (leaves): ')
          : (isCz ? 'Větná forma (listy): ' : 'Sentential form (leaves): ')}
        <strong>{frontier.join(' ') || 'ε'}</strong>
      </div>

      <svg ref={svgRef} width="100%" height="100%">
        <g data-viewport="" transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {layout.edges.map(({ from, to }) => (
            <line
              key={`e_${from.id}_${to.id}`}
              className={`t-edge ${alignLeaves && to.isLeaf && to.y - from.y > LEVEL_GAP ? 'to-leaf-row' : ''}`}
              x1={from.x}
              y1={from.y + NODE_H}
              x2={to.x}
              y2={to.y}
            />
          ))}

          {layout.nodes.map(n => {
            const isEps = n.symbol === 'ε';
            const kind = isEps ? 'eps' : n.isTerminal ? 't' : 'nt';
            const unexpanded = !n.isTerminal && n.isLeaf;
            return (
              <g key={`n_${n.id}`} transform={`translate(${n.x - n.width / 2}, ${n.y})`}>
                <rect
                  className={`t-node-${kind} ${unexpanded ? 'unexpanded' : ''}`}
                  width={n.width}
                  height={NODE_H}
                  rx={n.isTerminal ? NODE_H / 2 : 6}
                />
                <text className={`t-text-${kind}`} x={n.width / 2} y={NODE_H / 2 + 4.5} textAnchor="middle">
                  {n.symbol}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
