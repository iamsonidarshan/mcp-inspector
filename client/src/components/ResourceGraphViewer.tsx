/**
 * Resource Graph Viewer - SVG-based visualization of tool executions and resources
 */

import { useMemo } from "react";
import { VisualizationData, ResourceNode } from "@/lib/hooks/useAgentStream";

interface ResourceGraphViewerProps {
  data: VisualizationData;
}

interface PositionedNode extends ResourceNode {
  x: number;
  y: number;
}

export default function ResourceGraphViewer({
  data,
}: ResourceGraphViewerProps) {
  const { nodes, edges } = data;

  // Calculate node positions using a simple layered layout
  const positionedNodes = useMemo(() => {
    if (nodes.length === 0) return [];

    const toolNodes = nodes.filter((n) => n.type === "tool");
    const resourceNodes = nodes.filter((n) => n.type === "resource");

    const result: PositionedNode[] = [];
    const padding = 60;
    const nodeWidth = 160;
    const nodeHeight = 50;
    const layerGap = 120;

    // Position tool nodes in a column on the left
    toolNodes.forEach((node, i) => {
      result.push({
        ...node,
        x: padding,
        y: padding + i * (nodeHeight + 30),
      });
    });

    // Position resource nodes on the right, grouped by source tool
    const toolNodeMap = new Map(result.map((n) => [n.id, n]));

    resourceNodes.forEach((node, i) => {
      // Find the edge that connects to this resource
      const edge = edges.find((e) => e.target === node.id);
      const sourceNode = edge ? toolNodeMap.get(edge.source) : null;

      result.push({
        ...node,
        x: padding + nodeWidth + layerGap,
        y: sourceNode ? sourceNode.y : padding + i * (nodeHeight + 30),
      });
    });

    return result;
  }, [nodes, edges]);

  // Calculate SVG dimensions
  const svgWidth = useMemo(() => {
    if (positionedNodes.length === 0) return 400;
    return Math.max(...positionedNodes.map((n) => n.x)) + 200;
  }, [positionedNodes]);

  const svgHeight = useMemo(() => {
    if (positionedNodes.length === 0) return 300;
    return Math.max(...positionedNodes.map((n) => n.y)) + 100;
  }, [positionedNodes]);

  // Node color based on status
  const getNodeFill = (node: ResourceNode) => {
    if (node.type === "resource") return "#E5E7EB"; // gray-200

    switch (node.status) {
      case "completed":
        return "#86EFAC"; // green-300
      case "running":
        return "#93C5FD"; // blue-300
      case "failed":
        return "#FCA5A5"; // red-300
      case "skipped":
        return "#FDE047"; // yellow-300
      case "pending":
        return "#D1D5DB"; // gray-300
      default:
        return "#E5E7EB";
    }
  };

  const getNodeStroke = (node: ResourceNode) => {
    if (node.type === "resource") return "#9CA3AF"; // gray-400

    switch (node.status) {
      case "completed":
        return "#22C55E"; // green-500
      case "running":
        return "#3B82F6"; // blue-500
      case "failed":
        return "#EF4444"; // red-500
      case "skipped":
        return "#EAB308"; // yellow-500
      case "pending":
        return "#6B7280"; // gray-500
      default:
        return "#9CA3AF";
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10" strokeWidth="1" />
            <path d="M12 6v6l4 2" strokeWidth="1" />
          </svg>
          <p>Graph will appear when agent starts executing</p>
        </div>
      </div>
    );
  }

  // Create a map for quick node lookup
  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="min-w-full min-h-full"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);

          if (!source || !target) return null;

          const sourceX = source.x + 150; // right side of source
          const sourceY = source.y + 25; // center vertically
          const targetX = target.x; // left side of target
          const targetY = target.y + 25;

          return (
            <g key={edge.id}>
              <line
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
                stroke="#9CA3AF"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
              {edge.paramName && (
                <text
                  x={(sourceX + targetX) / 2}
                  y={(sourceY + targetY) / 2 - 5}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-500"
                >
                  {edge.paramName}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positionedNodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            {node.type === "tool" ? (
              // Tool node - rounded rectangle
              <rect
                width={150}
                height={50}
                rx={8}
                fill={getNodeFill(node)}
                stroke={getNodeStroke(node)}
                strokeWidth={2}
              />
            ) : (
              // Resource node - circle
              <ellipse
                cx={75}
                cy={25}
                rx={70}
                ry={22}
                fill={getNodeFill(node)}
                stroke={getNodeStroke(node)}
                strokeWidth={1.5}
              />
            )}

            <text
              x={75}
              y={node.type === "tool" ? 20 : 22}
              textAnchor="middle"
              className="text-xs font-medium fill-gray-700"
            >
              {node.name.length > 18
                ? node.name.slice(0, 18) + "..."
                : node.name}
            </text>

            {node.type === "tool" && (
              <text
                x={75}
                y={38}
                textAnchor="middle"
                className="text-[10px] fill-gray-500"
              >
                {node.status}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          Legend
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-300 border border-green-500" />
            <span className="text-xs text-gray-600">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-300 border border-blue-500" />
            <span className="text-xs text-gray-600">Running</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-300 border border-yellow-500" />
            <span className="text-xs text-gray-600">Skipped</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-300 border border-red-500" />
            <span className="text-xs text-gray-600">Failed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-200 border border-gray-400" />
            <span className="text-xs text-gray-600">Resource</span>
          </div>
        </div>
      </div>
    </div>
  );
}
