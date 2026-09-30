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
import { formatLR0Item, formatLR1Item } from '../../core/lr/lrItem';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface AutomatonGraphVisualizerProps {
  automaton: LRAutomaton;
  selectedStateId?: number | null;
  onSelectState?: (stateId: number) => void;
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
  onSelectState
}) => {
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<LayoutEdge[]>([]);
  const [graphBounds, setGraphBounds] = useState({ width: 800, height: 600 });
  
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
      ranksep: 70,
      marginx: 20,
      marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Calculate node dimensions
    automaton.states.forEach(s => {
      const itemsCount = automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)'
        ? (s.items1?.length || 1)
        : s.items0.length;
      
      const width = 230;
      const height = Math.max(70, 36 + itemsCount * 20);

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
      {/* Zoom / Reset Toolbar */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
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
      </div>

      <svg
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
            const items = automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)'
              ? (node.state.items1 || [])
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
                  stroke={isSelected ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))"
                />

                {/* State Header */}
                <rect
                  width={node.width}
                  height={28}
                  rx={7}
                  fill={isSelected ? 'var(--color-primary)' : 'var(--color-bg-elevated)'}
                />
                <text
                  x={12}
                  y={18}
                  fill={isSelected ? '#ffffff' : 'var(--color-text-primary)'}
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="var(--font-sans)"
                >
                  State {node.state.id} {node.state.id === 0 ? '(Initial)' : ''}
                </text>

                {/* Items List */}
                {items.map((item, itIdx) => {
                  const itemStr = automaton.variant === 'LR(1)' || automaton.variant === 'LALR(1)'
                    ? formatLR1Item(item as any)
                    : formatLR0Item(item as any);

                  return (
                    <text
                      key={`item_${itIdx}`}
                      x={10}
                      y={48 + itIdx * 18}
                      fill="var(--color-text-secondary)"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                    >
                      {itemStr}
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
