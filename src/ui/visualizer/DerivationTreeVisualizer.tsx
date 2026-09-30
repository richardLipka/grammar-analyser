/**
 * Interactive SVG Parse / Derivation Tree Visualizer powered by Dagre
 */

import React, { useEffect, useState } from 'react';
import dagre from 'dagre';
import { DerivationNode } from '../../core/generator/wordGenerator';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface DerivationTreeVisualizerProps {
  rootNode?: DerivationNode;
  height?: string;
}

interface TreeNodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  symbol: string;
  isTerminal: boolean;
}

interface TreeEdgeLayout {
  from: string;
  to: string;
  points: { x: number; y: number }[];
}

export const DerivationTreeVisualizer: React.FC<DerivationTreeVisualizerProps> = ({
  rootNode,
  height = '380px'
}) => {
  const [nodes, setNodes] = useState<TreeNodeLayout[]>([]);
  const [edges, setEdges] = useState<TreeEdgeLayout[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = React.useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!rootNode) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'TB',
      nodesep: 25,
      ranksep: 40,
      marginx: 20,
      marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Traverse tree to register nodes and edges in Dagre
    function traverse(node: DerivationNode) {
      const width = Math.max(36, node.symbol.length * 10 + 18);
      const height = 30;

      g.setNode(node.id, {
        width,
        height,
        symbol: node.symbol,
        isTerminal: node.isTerminal
      });

      if (node.children) {
        for (const child of node.children) {
          traverse(child);
          g.setEdge(node.id, child.id);
        }
      }
    }

    traverse(rootNode);
    dagre.layout(g);

    const layoutNodes: TreeNodeLayout[] = [];
    g.nodes().forEach(nodeId => {
      const n = g.node(nodeId);
      if (n) {
        layoutNodes.push({
          id: nodeId,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          symbol: (n as any).symbol,
          isTerminal: (n as any).isTerminal
        });
      }
    });

    const layoutEdges: TreeEdgeLayout[] = [];
    g.edges().forEach(e => {
      const edgeData = g.edge(e);
      if (edgeData && edgeData.points) {
        layoutEdges.push({
          from: e.v,
          to: e.w,
          points: edgeData.points
        });
      }
    });

    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [rootNode]);

  if (!rootNode) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        fontStyle: 'italic',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)'
      }}>
        No derivation tree available for this step.
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
      onMouseDown={(e) => {
        setIsDragging(true);
        dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }}
      onMouseMove={(e) => {
        if (isDragging) {
          setPan({
            x: e.clientX - dragRef.current.x,
            y: e.clientY - dragRef.current.y
          });
        }
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onWheel={(e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setZoom(z => Math.min(2.5, Math.max(0.4, z * factor)));
      }}
    >
      {/* Zoom / Reset Toolbar */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        display: 'flex',
        gap: '4px',
        zIndex: 10,
        backgroundColor: 'var(--color-bg-elevated)',
        padding: '3px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)'
      }}>
        <button
          className="btn-icon"
          title="Zoom In"
          onClick={() => setZoom(z => Math.min(2.5, z * 1.15))}
        >
          <ZoomIn size={14} />
        </button>
        <button
          className="btn-icon"
          title="Zoom Out"
          onClick={() => setZoom(z => Math.max(0.4, z * 0.85))}
        >
          <ZoomOut size={14} />
        </button>
        <button
          className="btn-icon"
          title="Reset View"
          onClick={() => { setZoom(1); setPan({ x: 30, y: 30 }); }}
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <svg width="100%" height="100%">
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((e, idx) => {
            const pathD = `M ${e.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
            return (
              <path
                key={`edge_${idx}`}
                d={pathD}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const isEps = n.symbol === 'ε';
            return (
              <g
                key={`node_${n.id}`}
                transform={`translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`}
              >
                <rect
                  width={n.width}
                  height={n.height}
                  rx={n.isTerminal ? 15 : 6}
                  fill={
                    isEps
                      ? 'var(--color-bg-elevated)'
                      : n.isTerminal
                      ? 'var(--color-success-subtle)'
                      : 'var(--color-primary-subtle)'
                  }
                  stroke={
                    isEps
                      ? 'var(--color-border)'
                      : n.isTerminal
                      ? 'var(--color-success)'
                      : 'var(--color-primary)'
                  }
                  strokeWidth={1.5}
                />
                <text
                  x={n.width / 2}
                  y={n.height / 2 + 4}
                  textAnchor="middle"
                  fill={
                    isEps
                      ? 'var(--color-text-muted)'
                      : n.isTerminal
                      ? 'var(--color-success)'
                      : 'var(--color-primary)'
                  }
                  fontSize="12"
                  fontWeight="600"
                  fontFamily={n.isTerminal ? 'var(--font-mono)' : 'var(--font-sans)'}
                >
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
