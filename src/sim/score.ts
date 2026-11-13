import { calculateFare } from "./fare";
import { pathEdges } from "./graph";
import type { EdgeId, Grade, RoadGraph, TaxiMode, TripScore } from "./types";

export function gradeFromExcess(excessRatio: number): Grade {
  if (excessRatio <= 0.001) return "perfect";
  if (excessRatio <= 0.05) return "good";
  if (excessRatio <= 0.15) return "fair";
  return "detour";
}

export function scoreTrip(
  graph: RoadGraph,
  mode: TaxiMode,
  playerEdgeIds: EdgeId[],
  optimalEdgeIds: EdgeId[],
  waitingSeconds = 0,
): TripScore {
  const playerEdges = pathEdges(graph, playerEdgeIds);
  const optimalEdges = pathEdges(graph, optimalEdgeIds);
  const playerM = playerEdges.reduce((s, e) => s + e.lengthM, 0);
  const optimalM = optimalEdges.reduce((s, e) => s + e.lengthM, 0);
  const excessRatio = optimalM > 0 ? (playerM - optimalM) / optimalM : 0;

  return {
    playerM,
    optimalM,
    excessRatio,
    grade: gradeFromExcess(excessRatio),
    playerFare: calculateFare(mode, playerEdges, waitingSeconds),
    optimalFare: calculateFare(mode, optimalEdges, 0),
  };
}
