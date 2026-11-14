import { redGraph } from "../src/data/redGraph.ts";
import { generateTrip } from "../src/sim/trip.ts";

const t0 = performance.now();
const trip = generateTrip(redGraph, "red", 42, 800);
console.log("ms", (performance.now() - t0).toFixed(1));
console.log(
  trip && {
    from: trip.origin.nameEn,
    to: trip.destination.nameEn,
    km: (trip.optimal.lengthM / 1000).toFixed(2),
    edges: trip.optimal.edgeIds.length,
  },
);
console.log(
  "landmarks",
  redGraph.landmarks.length,
  "nodes",
  Object.keys(redGraph.nodes).length,
  "edges",
  Object.keys(redGraph.edges).length,
);
