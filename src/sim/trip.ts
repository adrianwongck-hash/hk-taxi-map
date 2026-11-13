import { shortestPath } from "./graph";
import type { Landmark, RoadGraph, TaxiMode, TripBrief } from "./types";

function landmarksForMode(graph: RoadGraph, mode: TaxiMode): Landmark[] {
  return graph.landmarks.filter((l) => l.taxiTypes.includes(mode));
}

/** Deterministic pick from landmarks with a finite shortest path ≥ minM. */
export function generateTrip(
  graph: RoadGraph,
  mode: TaxiMode,
  seed = Date.now(),
  minM = 800,
): TripBrief | null {
  const pool = landmarksForMode(graph, mode);
  if (pool.length < 2) return null;

  const pairs: TripBrief[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      const origin = pool[i]!;
      const destination = pool[j]!;
      const optimal = shortestPath(
        graph,
        mode,
        origin.nodeId,
        destination.nodeId,
      );
      if (!optimal || optimal.lengthM < minM) continue;
      pairs.push({ mode, origin, destination, optimal });
    }
  }
  if (pairs.length === 0) return null;
  const index = Math.abs(seed) % pairs.length;
  return pairs[index] ?? null;
}
