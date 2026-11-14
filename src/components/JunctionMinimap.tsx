import { useMemo } from "react";
import type { GraphEdge, NodeId, RoadGraph } from "../sim/types";
import "./JunctionMinimap.css";

interface ChoiceMark {
  edge: GraphEdge;
  index: number;
  accent: string;
}

interface Props {
  graph: RoadGraph;
  currentNode: NodeId;
  choices: ChoiceMark[];
  headingDeg: number;
}

const ACCENTS = ["#ffd54f", "#81d4fa", "#ce93d8", "#a5d6a7", "#ffab91"];

export function choiceAccent(index: number): string {
  return ACCENTS[index % ACCENTS.length]!;
}

/** Top-down local map of the junction so same-named roads are visually distinct. */
export function JunctionMinimap({
  graph,
  currentNode,
  choices,
  headingDeg,
}: Props) {
  const drawing = useMemo(() => {
    const node = graph.nodes[currentNode];
    if (!node) return null;

    const related = new Set<NodeId>([currentNode]);
    for (const c of choices) related.add(c.edge.to);
    for (const e of Object.values(graph.edges)) {
      if (e.from === currentNode || e.to === currentNode) {
        related.add(e.from);
        related.add(e.to);
      }
    }

    const pts = [...related]
      .map((id) => graph.nodes[id])
      .filter((n): n is NonNullable<typeof n> => !!n);

    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 18;
    const size = 160;
    const spanLat = Math.max(maxLat - minLat, 0.0008);
    const spanLng = Math.max(maxLng - minLng, 0.0008);

    const toXY = (lat: number, lng: number) => ({
      x: pad + ((lng - minLng) / spanLng) * (size - pad * 2),
      y: pad + ((maxLat - lat) / spanLat) * (size - pad * 2),
    });

    const here = toXY(node.lat, node.lng);

    const contextLines = Object.values(graph.edges)
      .filter((e) => related.has(e.from) && related.has(e.to) && e.from < e.to)
      .map((e) => {
        const a = graph.nodes[e.from]!;
        const b = graph.nodes[e.to]!;
        return { id: e.id, p1: toXY(a.lat, a.lng), p2: toXY(b.lat, b.lng) };
      });

    const choiceLines = choices.map((c) => {
      const dest = graph.nodes[c.edge.to]!;
      return {
        id: c.edge.id,
        p1: here,
        p2: toXY(dest.lat, dest.lng),
        accent: c.accent,
        index: c.index,
        labelAt: toXY(dest.lat, dest.lng),
      };
    });

    return { size, here, contextLines, choiceLines, headingDeg };
  }, [graph, currentNode, choices, headingDeg]);

  if (!drawing) return null;

  const rad = ((drawing.headingDeg - 90) * Math.PI) / 180;
  const hx = drawing.here.x + Math.cos(rad) * 14;
  const hy = drawing.here.y + Math.sin(rad) * 14;

  return (
    <div className="jminimap" aria-hidden>
      <svg viewBox={`0 0 ${drawing.size} ${drawing.size}`}>
        <rect
          width={drawing.size}
          height={drawing.size}
          rx={12}
          fill="rgba(12,14,18,0.72)"
        />
        {drawing.contextLines.map((line) => (
          <line
            key={line.id}
            x1={line.p1.x}
            y1={line.p1.y}
            x2={line.p2.x}
            y2={line.p2.y}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}
        {drawing.choiceLines.map((line) => (
          <g key={line.id}>
            <line
              x1={line.p1.x}
              y1={line.p1.y}
              x2={line.p2.x}
              y2={line.p2.y}
              stroke={line.accent}
              strokeWidth={4.5}
              strokeLinecap="round"
            />
            <circle
              cx={line.labelAt.x}
              cy={line.labelAt.y}
              r={9}
              fill={line.accent}
            />
            <text
              x={line.labelAt.x}
              y={line.labelAt.y + 3.5}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#111"
            >
              {String.fromCharCode(65 + line.index)}
            </text>
          </g>
        ))}
        <circle
          cx={drawing.here.x}
          cy={drawing.here.y}
          r={6}
          fill="#fff"
          stroke="#111"
          strokeWidth={1.5}
        />
        <line
          x1={drawing.here.x}
          y1={drawing.here.y}
          x2={hx}
          y2={hy}
          stroke="#fff"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      <span className="jminimap__label">Junction</span>
    </div>
  );
}
