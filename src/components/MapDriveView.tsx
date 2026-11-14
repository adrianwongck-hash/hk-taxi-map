import { useEffect, useMemo, useRef } from "react";
import {
  Marker,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  classifyTurn,
  compassLabel,
  edgeBearing,
  headingAtNode,
  relativeTurnDeg,
  turnLabel,
} from "../game/bearing";
import type { GraphEdge, NodeId, RoadGraph } from "../sim/types";
import { choiceAccent } from "./JunctionMinimap";
import "./MapDriveView.css";

interface Props {
  graph: RoadGraph;
  currentNode: NodeId;
  destinationNode: NodeId;
  modeColor: string;
  destinationLabel: string;
  choices: GraphEdge[];
  arrivedVia: GraphEdge | null;
  traversed: string[];
  moving: boolean;
  moveProgress: number;
  activeEdge: GraphEdge | null;
  phase: "drive" | "debrief";
  optimalEdgeIds?: string[];
  onChoose: (edge: GraphEdge) => void;
}

/** Free raster basemap — no API key (Carto Voyager now watermarks without one). */
const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom",
    },
  },
  layers: [
    {
      id: "esri",
      type: "raster",
      source: "esri",
    },
  ],
};

function placeLabel(graph: RoadGraph, nodeId: NodeId): string {
  const node = graph.nodes[nodeId];
  if (node?.nameEn && !/^n\d+$/i.test(node.nameEn)) return node.nameEn;
  const lm = graph.landmarks.find((l) => l.nodeId === nodeId);
  if (lm) return lm.nameEn;
  return "ahead";
}

export function MapDriveView({
  graph,
  currentNode,
  destinationNode,
  modeColor,
  destinationLabel,
  choices,
  arrivedVia,
  traversed,
  moving,
  moveProgress,
  activeEdge,
  phase,
  optimalEdgeIds = [],
  onChoose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const taxiMarkerRef = useRef<Marker | null>(null);
  const readyRef = useRef(false);

  const heading = useMemo(() => {
    const fallback = choices[0] ?? activeEdge;
    return headingAtNode(graph, arrivedVia, fallback);
  }, [graph, arrivedVia, choices, activeEdge]);

  const arrowChoices = useMemo(() => {
    const sorted = choices
      .map((edge) => {
        const bearing = edgeBearing(graph, edge);
        const rel = relativeTurnDeg(heading, bearing);
        const kind = classifyTurn(rel);
        const toward = graph.nodes[edge.to];
        const towardEn = placeLabel(graph, edge.to);
        return {
          edge,
          rel,
          kind,
          bearing,
          towardEn,
          towardZh: toward?.nameZh,
          action: turnLabel(kind),
          compass: compassLabel(bearing),
        };
      })
      .sort((a, b) => a.rel - b.rel);

    return sorted.map((c, index) => ({
      ...c,
      index,
      accent: choiceAccent(index),
    }));
  }, [choices, graph, heading]);

  const taxiLngLat = useMemo((): [number, number] => {
    if (moving && activeEdge) {
      const a = graph.nodes[activeEdge.from];
      const b = graph.nodes[activeEdge.to];
      if (a && b) {
        const t = moveProgress;
        return [
          a.lng + (b.lng - a.lng) * t,
          a.lat + (b.lat - a.lat) * t,
        ];
      }
    }
    const n = graph.nodes[currentNode];
    return n ? [n.lng, n.lat] : [114.1694, 22.3193];
  }, [moving, activeEdge, moveProgress, graph, currentNode]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: taxiLngLat,
      zoom: 15.2,
      pitch: 0,
      bearing: 0,
    });
    map.addControl(new NavigationControl({ showCompass: true }), "top-left");
    mapRef.current = map;

    const el = document.createElement("div");
    el.className = "map-taxi";
    el.style.setProperty("--taxi", modeColor);
    // Viewport-aligned: nose always toward top of screen; map bearing does the rotating.
    const marker = new Marker({
      element: el,
      rotationAlignment: "viewport",
      pitchAlignment: "viewport",
    })
      .setLngLat(taxiLngLat)
      .setRotation(0)
      .addTo(map);
    taxiMarkerRef.current = marker;

    const resize = () => map.resize();
    map.on("load", () => {
      readyRef.current = true;
      resize();
      ensureLayers(map, graph);
      updateLayers(map, graph, {
        traversed,
        choices: arrowChoices.map((c) => ({
          edge: c.edge,
          accent: c.accent,
          index: c.index,
        })),
        destinationNode,
        optimalEdgeIds: phase === "debrief" ? optimalEdgeIds : [],
      });
    });
    map.on("error", (e) => {
      console.error("MapLibre error", e.error);
    });
    // Layout can settle after first paint
    requestAnimationFrame(resize);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      marker.remove();
      map.remove();
      mapRef.current = null;
      taxiMarkerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Taxi colour
  useEffect(() => {
    const el = taxiMarkerRef.current?.getElement();
    el?.style.setProperty("--taxi", modeColor);
  }, [modeColor]);

  // Move taxi + rotate map so travel direction is screen-up (nose to top)
  useEffect(() => {
    const map = mapRef.current;
    const marker = taxiMarkerRef.current;
    if (!map || !marker) return;

    const travelBearing =
      moving && activeEdge ? edgeBearing(graph, activeEdge) : heading;

    marker.setLngLat(taxiLngLat);
    marker.setRotation(0);

    map.easeTo({
      center: taxiLngLat,
      bearing: travelBearing,
      zoom: Math.max(map.getZoom(), moving ? 15.6 : 15.1),
      duration: moving ? 90 : 420,
      essential: true,
    });
  }, [taxiLngLat, moving, activeEdge, graph, heading]);

  // Graph layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    ensureLayers(map, graph);
    updateLayers(map, graph, {
      traversed,
      choices: arrowChoices.map((c) => ({
        edge: c.edge,
        accent: c.accent,
        index: c.index,
      })),
      destinationNode,
      optimalEdgeIds: phase === "debrief" ? optimalEdgeIds : [],
    });
  }, [
    graph,
    traversed,
    arrowChoices,
    destinationNode,
    optimalEdgeIds,
    phase,
  ]);

  return (
    <div className="map-drive">
      <div ref={containerRef} className="map-drive__canvas" />

      <div className="map-drive__dest">
        <span>Destination</span>
        <strong>{destinationLabel}</strong>
      </div>

      {phase === "drive" && !moving && arrowChoices.length > 0 && (
        <div
          className="map-drive__choices"
          role="group"
          aria-label="Junction choices"
        >
          {arrowChoices.map((c) => (
            <button
              key={c.edge.id}
              type="button"
              className="map-drive__choice"
              style={{ ["--accent" as string]: c.accent }}
              onClick={() => onChoose(c.edge)}
            >
              <span className="map-drive__letter">
                {String.fromCharCode(65 + c.index)}
              </span>
              <span className="map-drive__action">{c.action}</span>
              <span className="map-drive__road">{c.edge.nameEn}</span>
              <span className="map-drive__toward">
                toward {c.towardEn}
                {c.towardZh ? ` · ${c.towardZh}` : ""}
              </span>
              <span className="map-drive__meta">
                {c.compass} · {(c.edge.lengthM / 1000).toFixed(2)} km
              </span>
            </button>
          ))}
        </div>
      )}

      {moving && activeEdge && (
        <div className="map-drive__moving" aria-live="polite">
          {activeEdge.nameEn} →{" "}
          {graph.nodes[activeEdge.to]?.nameEn ?? ""}
        </div>
      )}
    </div>
  );
}

function ensureLayers(map: MapLibreMap, _graph: RoadGraph) {
  // Basemap already shows real streets — only overlay route/choices (full highway graph is huge).
  if (!map.getSource("trip-player")) {
    map.addSource("trip-player", {
      type: "geojson",
      data: emptyFc(),
    });
    map.addLayer({
      id: "trip-player-line",
      type: "line",
      source: "trip-player",
      paint: {
        "line-color": "#f9a825",
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getSource("trip-optimal")) {
    map.addSource("trip-optimal", {
      type: "geojson",
      data: emptyFc(),
    });
    map.addLayer({
      id: "trip-optimal-line",
      type: "line",
      source: "trip-optimal",
      paint: {
        "line-color": "#2e7d32",
        "line-width": 5,
        "line-opacity": 0.85,
        "line-dasharray": [1.2, 1.2],
      },
    });
  }

  if (!map.getSource("trip-choices")) {
    map.addSource("trip-choices", {
      type: "geojson",
      data: emptyFc(),
    });
    map.addLayer({
      id: "trip-choices-line",
      type: "line",
      source: "trip-choices",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 7,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getSource("trip-points")) {
    map.addSource("trip-points", {
      type: "geojson",
      data: emptyFc(),
    });
    map.addLayer({
      id: "trip-dest",
      type: "circle",
      source: "trip-points",
      filter: ["==", ["get", "kind"], "dest"],
      paint: {
        "circle-radius": 8,
        "circle-color": "#111",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
    });
    map.addLayer({
      id: "trip-choice-labels",
      type: "symbol",
      source: "trip-points",
      filter: ["==", ["get", "kind"], "choice"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 14,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#111",
        "text-halo-color": ["get", "color"],
        "text-halo-width": 3,
      },
    });
  }
}

function updateLayers(
  map: MapLibreMap,
  graph: RoadGraph,
  state: {
    traversed: string[];
    choices: { edge: GraphEdge; accent: string; index: number }[];
    destinationNode: NodeId;
    optimalEdgeIds: string[];
  },
) {
  setSource(map, "trip-player", edgesGeoJson(graph, state.traversed));
  setSource(map, "trip-optimal", edgesGeoJson(graph, state.optimalEdgeIds));

  const choiceFc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: state.choices.map((c) => {
      const a = graph.nodes[c.edge.from]!;
      const b = graph.nodes[c.edge.to]!;
      return {
        type: "Feature",
        properties: { color: c.accent, label: String.fromCharCode(65 + c.index) },
        geometry: {
          type: "LineString",
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
      };
    }),
  };
  setSource(map, "trip-choices", choiceFc);

  const dest = graph.nodes[state.destinationNode];
  const pointFeatures: GeoJSON.Feature[] = [];
  if (dest) {
    pointFeatures.push({
      type: "Feature",
      properties: { kind: "dest" },
      geometry: { type: "Point", coordinates: [dest.lng, dest.lat] },
    });
  }
  for (const c of state.choices) {
    const b = graph.nodes[c.edge.to];
    if (!b) continue;
    pointFeatures.push({
      type: "Feature",
      properties: {
        kind: "choice",
        label: String.fromCharCode(65 + c.index),
        color: c.accent,
      },
      geometry: {
        type: "Point",
        coordinates: [
          (graph.nodes[c.edge.from]!.lng + b.lng) / 2,
          (graph.nodes[c.edge.from]!.lat + b.lat) / 2,
        ],
      },
    });
  }
  setSource(map, "trip-points", {
    type: "FeatureCollection",
    features: pointFeatures,
  });
}

function setSource(
  map: MapLibreMap,
  id: string,
  data: GeoJSON.FeatureCollection,
) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData(data);
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function edgesGeoJson(
  graph: RoadGraph,
  edgeIds: string[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const id of edgeIds) {
    const e = graph.edges[id];
    if (!e) continue;
    const a = graph.nodes[e.from];
    const b = graph.nodes[e.to];
    if (!a || !b) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
