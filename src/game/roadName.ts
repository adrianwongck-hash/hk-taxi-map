import type { GraphEdge } from "../sim/types";

/** OSM highway=* fallbacks that leaked in as edge names. */
const OSM_CLASS_LABELS: Record<string, string> = {
  motorway: "Expressway",
  motorway_link: "Highway ramp",
  trunk: "Trunk road",
  trunk_link: "Slip road",
  primary: "Main road",
  primary_link: "Slip road",
  secondary: "Road",
  secondary_link: "Slip road",
  tertiary: "Road",
  tertiary_link: "Slip road",
  unclassified: "Road",
  residential: "Local road",
  living_street: "Local street",
  service: "Service road",
  road: "Road",
  track: "Track",
  path: "Path",
  footway: "Path",
  cycleway: "Cycle path",
};

export function isOsmClassName(name: string): boolean {
  if (!name) return true;
  return Object.prototype.hasOwnProperty.call(
    OSM_CLASS_LABELS,
    name.toLowerCase(),
  );
}

/** Human label for a single edge name (fixes secondary_link etc.). */
export function displayRoadName(nameEn: string | undefined): string {
  if (!nameEn) return "Road";
  const mapped = OSM_CLASS_LABELS[nameEn.toLowerCase()];
  if (mapped) return mapped;
  return nameEn;
}

/**
 * Best street label along a choice corridor: prefer a real OSM name,
 * otherwise a friendly class label.
 */
export function bestRoadNameAlong(edges: GraphEdge[]): string {
  for (const e of edges) {
    if (e.nameEn && !isOsmClassName(e.nameEn) && !/^Access\s*·/i.test(e.nameEn)) {
      return e.nameEn;
    }
  }
  for (const e of edges) {
    if (e.nameEn && !isOsmClassName(e.nameEn)) return e.nameEn;
  }
  return displayRoadName(edges[0]?.nameEn);
}
