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

/**
 * Heading-up extract of the current junction: local roads + lettered exits,
 * rotated so travel direction is screen-up (matches the main map).
 */
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

    // Local ENU metres approx, then rotate so heading is +Y (screen up).
    const meters = (lat: number, lng: number) => {
      const x = (lng - node.lng) * 111320 * Math.cos((node.lat * Math.PI) / 180);
      const y = (lat - node.lat) * 110540;
      return { x, y };
    };
    const rot = (-headingDeg * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const orient = (lat: number, lng: number) => {
      const p = meters(lat, lng);
      return {
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos,
      };
    };

    const oriented = pts.map((p) => orient(p.lat, p.lng));
    const xs = oriented.map((p) => p.x);
    const ys = oriented.map((p) => p.y);
    const maxAbs = Math.max(
      25,
      ...xs.map(Math.abs),
      ...ys.map(Math.abs),
    );

    const pad = 22;
    const size = 168;
    const mid = size / 2;
    const scale = (size / 2 - pad) / maxAbs;

    const toXY = (lat: number, lng: number) => {
      const p = orient(lat, lng);
      return {
        x: mid + p.x * scale,
        y: mid - p.y * scale, // +Y (ahead) → up on screen
      };
    };

    const here = { x: mid, y: mid };

    const contextLines = Object.values(graph.edges)
      .filter((e) => related.has(e.from) && related.has(e.to) && e.from < e.to)
      .map((e) => {
        const a = graph.nodes[e.from]!;
        const b = graph.nodes[e.to]!;
        return { id: e.id, p1: toXY(a.lat, a.lng), p2: toXY(b.lat, b.lng) };
      });

    const choiceLines = choices.map((c) => {
      const dest = graph.nodes[c.edge.to]!;
      const p2 = toXY(dest.lat, dest.lng);
      const dx = p2.x - here.x;
      const dy = p2.y - here.y;
      const len = Math.hypot(dx, dy) || 1;
      // Arrow tip a bit before the letter disc
      const tip = {
        x: here.x + (dx / len) * Math.max(len - 14, len * 0.55),
        y: here.y + (dy / len) * Math.max(len - 14, len * 0.55),
      };
      const ang = Math.atan2(dy, dx);
      return {
        id: c.edge.id,
        p1: here,
        p2,
        tip,
        ang,
        accent: c.accent,
        index: c.index,
        labelAt: p2,
      };
    });

    return { size, here, contextLines, choiceLines };
  }, [graph, currentNode, choices, headingDeg]);

  if (!drawing) return null;

  return (
    <div className="jminimap" aria-label="Junction road view">
      <svg viewBox={`0 0 ${drawing.size} ${drawing.size}`}>
        <rect
          width={drawing.size}
          height={drawing.size}
          rx={14}
          fill="rgba(12,14,18,0.82)"
        />
        {/* Ahead wedge */}
        <path
          d={`M ${drawing.here.x} ${drawing.here.y}
              L ${drawing.here.x - 10} ${drawing.here.y - 22}
              L ${drawing.here.x + 10} ${drawing.here.y - 22} Z`}
          fill="rgba(255,255,255,0.12)"
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
        {drawing.choiceLines.map((line) => {
          const ah = 7;
          const ax = line.tip.x - Math.cos(line.ang) * ah;
          const ay = line.tip.y - Math.sin(line.ang) * ah;
          const lx = ax + Math.cos(line.ang + Math.PI / 2) * 4.5;
          const ly = ay + Math.sin(line.ang + Math.PI / 2) * 4.5;
          const rx = ax + Math.cos(line.ang - Math.PI / 2) * 4.5;
          const ry = ay + Math.sin(line.ang - Math.PI / 2) * 4.5;
          return (
            <g key={line.id}>
              <line
                x1={line.p1.x}
                y1={line.p1.y}
                x2={line.tip.x}
                y2={line.tip.y}
                stroke={line.accent}
                strokeWidth={4.5}
                strokeLinecap="round"
              />
              <polygon
                points={`${line.tip.x},${line.tip.y} ${lx},${ly} ${rx},${ry}`}
                fill={line.accent}
              />
              <circle
                cx={line.labelAt.x}
                cy={line.labelAt.y}
                r={10}
                fill={line.accent}
                stroke="#111"
                strokeWidth={1}
              />
              <text
                x={line.labelAt.x}
                y={line.labelAt.y + 3.5}
                textAnchor="middle"
                fontSize="11"
                fontWeight="800"
                fill="#111"
              >
                {String.fromCharCode(65 + line.index)}
              </text>
            </g>
          );
        })}
        <circle
          cx={drawing.here.x}
          cy={drawing.here.y}
          r={7}
          fill="#fff"
          stroke="#111"
          strokeWidth={1.5}
        />
        {/* Nose always up in this extract */}
        <line
          x1={drawing.here.x}
          y1={drawing.here.y}
          x2={drawing.here.x}
          y2={drawing.here.y - 16}
          stroke="#fff"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      <span className="jminimap__label">Junction</span>
    </div>
  );
}
