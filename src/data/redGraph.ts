import type { RoadGraph } from "../sim/types";
import generated from "./generated/redGraph.json";

/** Red (Urban) graph: corridor skeleton + OSM-derived landmark spurs. */
export const redGraph = generated as RoadGraph;

export const redGraphMeta = (
  generated as { meta?: Record<string, unknown> }
).meta;
