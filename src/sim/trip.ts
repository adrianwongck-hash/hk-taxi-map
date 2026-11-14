import { shortestPath } from "./graph";
import type { Landmark, RoadGraph, TaxiMode, TripBrief } from "./types";

function landmarksForMode(graph: RoadGraph, mode: TaxiMode): Landmark[] {
  return graph.landmarks.filter((l) => l.taxiTypes.includes(mode));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a random valid origin→destination from the landmark pool.
 * Avoids O(n²) pair materialization so large Red pools stay snappy.
 */
export function generateTrip(
  graph: RoadGraph,
  mode: TaxiMode,
  seed = Date.now(),
  minM = 800,
): TripBrief | null {
  const pool = landmarksForMode(graph, mode);
  if (pool.length < 2) return null;

  const rand = mulberry32(Math.abs(seed) || 1);
  const maxAttempts = Math.min(80, pool.length * 4);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const i = Math.floor(rand() * pool.length);
    let j = Math.floor(rand() * pool.length);
    if (j === i) j = (j + 1) % pool.length;
    const origin = pool[i]!;
    const destination = pool[j]!;
    if (origin.nodeId === destination.nodeId) continue;

    const optimal = shortestPath(
      graph,
      mode,
      origin.nodeId,
      destination.nodeId,
    );
    if (!optimal || optimal.lengthM < minM) continue;
    return { mode, origin, destination, optimal };
  }

  return null;
}
