/**
 * Interactive SVG Automaton Graph Visualizer powered by Dagre layout
 * Supports:
 * - Zoom & Pan (mouse drag & wheel)
 * - State selection & inspection
 * - Dot marker • highlight
 * - Transition symbol pill badges
 */

import React, { useEffect, useRef, useState } from 'react';
import dagre from 'dagre';
import { LRAutomaton, LRState } from '../../core/lr/lrAutomaton';
import {
  formatLR0Item,
  formatLR1Item,
  groupLR1Items,
  GroupedLR1Item,
  formatGroupedLR1Item,
  LR0Item
} from '../../core/lr/lrItem';
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from 'lucide-react';
import { exportSvgFile, exportPngFile } from '../../core/export/graphExport';
import { Language } from '../../i18n/translations';

interface AutomatonGraphVisualizerProps {
  automaton: LRAutomaton;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
  lang?: Language;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: LRState;
}

interface LayoutEdge {
  from: string;
  to: string;
  symbol: string;
  points: { x: number; y: number }[];
}

export const AutomatonGraphVisualizer: React.FC<AutomatonGraphVisualizerProps> = ({
  automaton,
  selectedStateId,
  onSelectState,
  lang = 'en'
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<LayoutEdge[]>([]);
  const [graphBounds, setGraphBounds] = useState({ width: 800, height: 600 });
  const [isExportingPng, setIsExportingPng] = useState(false);
  
  // Pan and zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!automaton || automaton.states.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 40,
      ranksep: 80,
      marginx: 20,
      marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Calculate node dimensions
    automaton.states.forEach(s => {
      let lineCount = 0;
      let maxLen = 14;

      if (automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)') {
        const grouped = groupLR1Items(s.items1 || []);
        lineCount = grouped.length;
        for (const it of grouped) {
          const formatted = formatGroupedLR1Item(it);
          if (formatted.length > maxLen) maxLen = formatted.length;
        }
      } else {
        lineCount = s.items0.length;
        for (const it of s.items0) {
          const formatted = formatLR0Item(it);
          if (formatted.length > maxLen) maxLen = formatted.length;
        }
      }

      const width = Math.max(240, Math.round(maxLen * 7.5 + 32));
      const height = Math.max(76, 36 + lineCount * 20 + 8);

      g.setNode(s.id.toString(), { width, height });
    });

    // Add transitions
    automaton.states.forEach(s => {
      for (const [sym, targetId] of s.transitions.entries()) {
        g.setEdge(s.id.toString(), targetId.toString(), { label: sym });
      }
    });

    dagre.layout(g);

    // Collect layouted nodes
    const layoutNodes: LayoutNode[] = [];
    automaton.states.forEach(s => {
      const nodeData = g.node(s.id.toString());
      if (nodeData) {
        layoutNodes.push({
          id: s.id.toString(),
          x: nodeData.x,
          y: nodeData.y,
          width: nodeData.width,
          height: nodeData.height,
          state: s
        });
      }
    });

    // Collect layouted edges
    const layoutEdges: LayoutEdge[] = [];
    automaton.states.forEach(s => {
      for (const [sym, targetId] of s.transitions.entries()) {
        const edgeData = g.edge(s.id.toString(), targetId.toString());
        if (edgeData && edgeData.points) {
          layoutEdges.push({
            from: s.id.toString(),
            to: targetId.toString(),
            symbol: sym,
            points: edgeData.points
          });
        }
      }
    });

    const gInfo = g.graph();
    setGraphBounds({
      width: (gInfo.width || 800) + 100,
      height: (gInfo.height || 600) + 100
    });

    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [automaton]);

  // Mouse interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.min(2.5, Math.max(0.3, prev * factor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 40, y: 40 });
  };

  const filename = `${automaton.variant.toLowerCase().replace(/[^a-z0-9]/g, '_')}_graph`;

  const handleExportSvg = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!svgRef.current) return;
    exportSvgFile(svgRef.current, filename, graphBounds);
  };

  const handleExportPng = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!svgRef.current || isExportingPng) return;
    setIsExportingPng(true);
    try {
      await exportPngFile(svgRef.current, filename, graphBounds, 2);
    } catch (err) {
      console.error('Failed to export PNG:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '520px',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Zoom / Reset / Export Toolbar */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 10,
        backgroundColor: 'var(--color-bg-elevated)',
        padding: '4px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)'
      }}>
        <button
          className="btn-icon"
          title="Zoom In"
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(2.5, z * 1.15)); }}
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="btn-icon"
          title="Zoom Out"
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.3, z * 0.85)); }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="btn-icon"
          title="Reset View"
          onClick={(e) => { e.stopPropagation(); resetView(); }}
        >
          <Maximize2 size={16} />
        </button>

        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--color-border)', margin: '0 2px' }} />

        {/* Subtle SVG & PNG Export Buttons */}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
          title={lang === 'cz' ? 'Exportovat graf jako vektorový SVG' : 'Export graph as vector SVG'}
          onClick={handleExportSvg}
        >
          <Download size={12} />
          <span>SVG</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 7px', fontSize: '11px', height: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
          title={lang === 'cz' ? 'Exportovat graf jako PNG (vysoké rozlišení)' : 'Export graph as high-res PNG'}
          onClick={handleExportPng}
          disabled={isExportingPng}
        >
          <ImageIcon size={12} />
          <span>{isExportingPng ? '...' : 'PNG'}</span>
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-text-muted)" />
          </marker>
          <marker
            id="arrow-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-primary)" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((edge, idx) => {
            const isConnected = selectedStateId !== undefined &&
              (Number(edge.from) === selectedStateId || Number(edge.to) === selectedStateId);

            const pathD = `M ${edge.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
            const mid = edge.points[Math.floor(edge.points.length / 2)] || { x: 0, y: 0 };

            return (
              <g key={`edge_${idx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={isConnected ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={isConnected ? 2.5 : 1.5}
                  markerEnd={isConnected ? 'url(#arrow-selected)' : 'url(#arrow)'}
                />
                {/* Edge Symbol Badge */}
                <rect
                  x={mid.x - 12}
                  y={mid.y - 10}
                  width={24}
                  height={18}
                  rx={4}
                  fill="var(--color-bg-elevated)"
                  stroke={isConnected ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={1}
                />
                <text
                  x={mid.x}
                  y={mid.y + 3}
                  textAnchor="middle"
                  fill="var(--color-text-primary)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                >
                  {edge.symbol}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedStateId === node.state.id;
            const isAccepting = node.state.isAccepting;
            const items = automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)'
              ? groupLR1Items(node.state.items1 || [])
              : node.state.items0;

            return (
              <g
                key={`node_${node.id}`}
                transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectState?.(node.state.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* State Card Box */}
                <rect
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill={isSelected ? 'var(--color-primary-subtle)' : 'var(--color-bg-card)'}
                  stroke={isSelected ? 'var(--color-primary)' : (isAccepting ? 'var(--color-success)' : 'var(--color-border)')}
                  strokeWidth={isSelected ? 2.5 : (isAccepting ? 2 : 1.5)}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))"
                />

                {/* State Header */}
                <rect
                  width={node.width}
                  height={28}
                  rx={7}
                  fill={isSelected ? 'var(--color-primary)' : (isAccepting ? 'var(--color-success-subtle)' : 'var(--color-bg-elevated)')}
                />
                <line x1={0} y1={28} x2={node.width} y2={28} stroke={isSelected ? 'var(--color-primary)' : 'var(--color-border)'} strokeWidth={1} />
                <text
                  x={12}
                  y={18}
                  fill={isSelected ? '#ffffff' : (isAccepting ? 'var(--color-success)' : 'var(--color-text-primary)')}
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="var(--font-sans)"
                >
                  State {node.state.id} {node.state.id === 0 ? '(Initial)' : ''} {isAccepting ? '(Accept)' : ''}
                </text>

                {/* Items List */}
                {items.map((item, itIdx) => {
                  if (automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)') {
                    const gItem = item as GroupedLR1Item;
                    const lr0Str = formatLR0Item({ production: gItem.production, dotIndex: gItem.dotIndex });
                    const lasStr = gItem.lookaheads.join(', ');

                    return (
                      <text
                        key={`item_${itIdx}`}
                        x={12}
                        y={48 + itIdx * 20}
                        fontSize="11"
                        fontFamily="var(--font-mono)"
                      >
                        <tspan fill="var(--color-text-secondary)">[{lr0Str}, </tspan>
                        <tspan fill="var(--color-primary)" fontWeight="700">{lasStr}</tspan>
                        <tspan fill="var(--color-text-secondary)">]</tspan>
                      </text>
                    );
                  }

                  const lr0Str = formatLR0Item(item as LR0Item);
                  return (
                    <text
                      key={`item_${itIdx}`}
                      x={12}
                      y={48 + itIdx * 20}
                      fill="var(--color-text-secondary)"
                      fontSize="11"
                      fontFamily="var(--font-mono)"
                    >
                      {lr0Str}
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
