import type { EdgeId, NodeId, RoadGraph } from "../sim/types";
import "./SchematicMap.css";

interface Props {
  graph: RoadGraph;
  currentNode: NodeId;
  destinationNode: NodeId;
  traversed: EdgeId[];
  highlightOptimal?: EdgeId[];
  modeColor: string;
}

function project(graph: RoadGraph) {
  const nodes = Object.values(graph.nodes);
  const lats = nodes.map((n) => n.lat);
  const lngs = nodes.map((n) => n.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 24;
  const w = 320;
  const h = 280;
  const toX = (lng: number) =>
    pad + ((lng - minLng) / Math.max(maxLng - minLng, 1e-6)) * (w - pad * 2);
  const toY = (lat: number) =>
    pad + ((maxLat - lat) / Math.max(maxLat - minLat, 1e-6)) * (h - pad * 2);
  return { w, h, toX, toY };
}

function undirectedKey(from: NodeId, to: NodeId): string {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

export function SchematicMap({
  graph,
  currentNode,
  destinationNode,
  traversed,
  highlightOptimal = [],
  modeColor,
}: Props) {
  const { w, h, toX, toY } = project(graph);

  const playerPairs = new Set(
    traversed.map((id) => {
      const e = graph.edges[id];
      return e ? undirectedKey(e.from, e.to) : "";
    }),
  );
  const optimalPairs = new Set(
    highlightOptimal.map((id) => {
      const e = graph.edges[id];
      return e ? undirectedKey(e.from, e.to) : "";
    }),
  );

  const drawn = new Set<string>();

  return (
    <svg
      className="schematic-map"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Trip map"
    >
      {Object.values(graph.edges).map((edge) => {
        const key = undirectedKey(edge.from, edge.to);
        if (drawn.has(key)) return null;
        drawn.add(key);
        const a = graph.nodes[edge.from];
        const b = graph.nodes[edge.to];
        if (!a || !b) return null;

        const isPlayer = playerPairs.has(key);
        const isOpt = optimalPairs.has(key);
        let stroke = "var(--road)";
        let width = 3;
        if (isOpt) {
          stroke = "#2e7d32";
          width = 5;
        }
        if (isPlayer) {
          stroke = "#f9a825";
          width = 5;
        }

        return (
          <line
            key={key}
            x1={toX(a.lng)}
            y1={toY(a.lat)}
            x2={toX(b.lng)}
            y2={toY(b.lat)}
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="round"
          />
        );
      })}
      {Object.values(graph.nodes).map((node) => (
        <circle
          key={node.id}
          cx={toX(node.lng)}
          cy={toY(node.lat)}
          r={node.id === destinationNode ? 7 : 4}
          fill={node.id === destinationNode ? "#111" : "var(--node)"}
        />
      ))}
      {(() => {
        const taxi = graph.nodes[currentNode];
        if (!taxi) return null;
        return (
          <g transform={`translate(${toX(taxi.lng)}, ${toY(taxi.lat)})`}>
            <rect
              x={-10}
              y={-6}
              width={20}
              height={12}
              rx={2}
              fill={modeColor}
              stroke="#111"
              strokeWidth={1}
            />
          </g>
        );
      })()}
    </svg>
  );
}
