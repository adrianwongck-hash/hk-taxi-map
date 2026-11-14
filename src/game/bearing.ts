import type { GraphEdge, GraphNode, RoadGraph } from "../sim/types";

/** Compass bearing in degrees: 0 = north, 90 = east. */
export function bearingDeg(from: GraphNode, to: GraphNode): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function edgeBearing(graph: RoadGraph, edge: GraphEdge): number {
  const a = graph.nodes[edge.from];
  const b = graph.nodes[edge.to];
  if (!a || !b) return 0;
  return bearingDeg(a, b);
}

/** Relative turn: negative = left, positive = right, ~0 = straight. */
export function relativeTurnDeg(headingDeg: number, targetDeg: number): number {
  let d = targetDeg - headingDeg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export type TurnKind =
  | "left"
  | "slight-left"
  | "straight"
  | "slight-right"
  | "right"
  | "uturn";

export function classifyTurn(relativeDeg: number): TurnKind {
  const a = Math.abs(relativeDeg);
  if (a >= 150) return "uturn";
  if (a <= 25) return "straight";
  if (a <= 55) return relativeDeg < 0 ? "slight-left" : "slight-right";
  return relativeDeg < 0 ? "left" : "right";
}

export function headingAtNode(
  graph: RoadGraph,
  arrivedVia: GraphEdge | null,
  fallbackEdge: GraphEdge | null,
): number {
  if (arrivedVia) return edgeBearing(graph, arrivedVia);
  if (fallbackEdge) return edgeBearing(graph, fallbackEdge);
  return 0;
}
