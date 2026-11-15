import { useEffect, useMemo, useRef, useState } from "react";
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
  edgeBearing,
  headingAtNode,
  relativeTurnDeg,
  turnLabel,
} from "../game/bearing";
import { bestRoadNameAlong, displayRoadName } from "../game/roadName";
import { extendForcedPath, pathLengthM, positionAlongPath } from "../sim";
import type { GraphEdge, NodeId, RoadGraph, TaxiMode } from "../sim/types";
import { JunctionMinimap, choiceAccent } from "./JunctionMinimap";
import "./MapDriveView.css";

interface Props {
  graph: RoadGraph;
  mode: TaxiMode;
  currentNode: NodeId;
  destinationNode: NodeId;
  modeColor: string;
  destinationLabel: string;
  choices: GraphEdge[];
  arrivedVia: GraphEdge | null;
  traversed: string[];
  moving: boolean;
  moveProgress: number;
  activePath: GraphEdge[];
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

function placeLabel(graph: RoadGraph, nodeId: NodeId): string | null {
  const node = graph.nodes[nodeId];
  if (node?.nameEn && !/^n\d+$/i.test(node.nameEn)) return node.nameEn;
  const lm = graph.landmarks.find((l) => l.nodeId === nodeId);
  if (lm) return lm.nameEn;
  return null;
}

function pathCoords(
  graph: RoadGraph,
  edges: GraphEdge[],
): [number, number][] {
  const coords: [number, number][] = [];
  for (const edge of edges) {
    const a = graph.nodes[edge.from];
    const b = graph.nodes[edge.to];
    if (!a || !b) continue;
    if (coords.length === 0) coords.push([a.lng, a.lat]);
    coords.push([b.lng, b.lat]);
  }
  return coords;
}

/** Point + bearing a fraction of the way along an edge chain. */
function pointAlongEdges(
  graph: RoadGraph,
  edges: GraphEdge[],
  fraction: number,
): { lng: number; lat: number; bearing: number } | null {
  if (edges.length === 0) return null;
  const pos = positionAlongPath(graph, edges, fraction);
  return { lng: pos.lng, lat: pos.lat, bearing: pos.bearing };
}

export function MapDriveView({
  graph,
  mode,
  currentNode,
  destinationNode,
  modeColor,
  destinationLabel,
  choices,
  arrivedVia,
  traversed,
  moving,
  moveProgress,
  activePath,
  phase,
  optimalEdgeIds = [],
  onChoose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const taxiMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const choiceMarkersRef = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;

  const along =
    moving && activePath.length > 0
      ? positionAlongPath(graph, activePath, moveProgress)
      : null;

  const heading = useMemo(() => {
    const fallback = choices[0] ?? activePath[activePath.length - 1] ?? null;
    return headingAtNode(graph, arrivedVia, fallback);
  }, [graph, arrivedVia, choices, activePath]);

  const arrowChoices = useMemo(() => {
    const sorted = choices
      .map((edge) => {
        const bearing = edgeBearing(graph, edge);
        const rel = relativeTurnDeg(heading, bearing);
        const kind = classifyTurn(rel);
        const chain = extendForcedPath(graph, mode, edge, destinationNode);
        const roadEn = bestRoadNameAlong(chain);
        const endLabel = placeLabel(graph, chain[chain.length - 1]!.to);
        // Only keep a place hint when it adds something the road name doesn't.
        const placeHint =
          endLabel &&
          endLabel.toLowerCase() !== roadEn.toLowerCase() &&
          !/^ahead$/i.test(endLabel)
            ? endLabel
            : null;
        return {
          edge,
          chain,
          rel,
          kind,
          bearing,
          action: turnLabel(kind),
          lengthM: pathLengthM(chain),
          roadEn,
          placeHint,
        };
      })
      .sort((a, b) => a.rel - b.rel);

    return sorted.map((c, index) => ({
      ...c,
      index,
      accent: choiceAccent(index),
      letter: String.fromCharCode(65 + index),
    }));
  }, [choices, graph, heading, mode, destinationNode]);

  const taxiLngLat = useMemo((): [number, number] => {
    if (along) return [along.lng, along.lat];
    const n = graph.nodes[currentNode];
    return n ? [n.lng, n.lat] : [114.1694, 22.3193];
  }, [along, graph, currentNode]);

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
    const marker = new Marker({
      element: el,
      rotationAlignment: "viewport",
      pitchAlignment: "viewport",
    })
      .setLngLat(taxiLngLat)
      .setRotation(0)
      .addTo(map);
    taxiMarkerRef.current = marker;

    const destEl = document.createElement("div");
    destEl.className = "map-dest";
    destEl.innerHTML =
      '<span class="map-dest__pin" aria-hidden="true"></span>' +
      '<span class="map-dest__label"></span>';
    const destNode = graph.nodes[destinationNode];
    const destMarker = new Marker({
      element: destEl,
      anchor: "bottom",
      pitchAlignment: "viewport",
      rotationAlignment: "viewport",
    })
      .setLngLat(
        destNode ? [destNode.lng, destNode.lat] : taxiLngLat,
      )
      .addTo(map);
    destMarkerRef.current = destMarker;
    const destLabelEl = destEl.querySelector(".map-dest__label");
    if (destLabelEl) destLabelEl.textContent = destinationLabel;

    const resize = () => map.resize();
    map.on("load", () => {
      readyRef.current = true;
      setMapReady(true);
      resize();
      ensureLayers(map);
      updateLayers(map, graph, layerStateFrom(
        traversed,
        arrowChoices,
        destinationNode,
        destinationLabel,
        phase === "debrief" ? optimalEdgeIds : [],
        activePath,
      ));
    });
    map.on("error", (e) => {
      console.error("MapLibre error", e.error);
    });
    requestAnimationFrame(resize);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      for (const m of choiceMarkersRef.current) m.remove();
      choiceMarkersRef.current = [];
      marker.remove();
      destMarker.remove();
      map.remove();
      mapRef.current = null;
      taxiMarkerRef.current = null;
      destMarkerRef.current = null;
      readyRef.current = false;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const el = taxiMarkerRef.current?.getElement();
    el?.style.setProperty("--taxi", modeColor);
  }, [modeColor]);

  // Keep destination pin on the map at the landmark coordinates.
  useEffect(() => {
    const marker = destMarkerRef.current;
    const node = graph.nodes[destinationNode];
    if (!marker || !node) return;
    marker.setLngLat([node.lng, node.lat]);
    const labelEl = marker.getElement().querySelector(".map-dest__label");
    if (labelEl) labelEl.textContent = destinationLabel;
  }, [graph, destinationNode, destinationLabel]);

  // Letter+arrow markers on each choice corridor (HTML — always visible).
  useEffect(() => {
    const map = mapRef.current;
    for (const m of choiceMarkersRef.current) m.remove();
    choiceMarkersRef.current = [];
    if (!map || !mapReady) return;
    if (phase !== "drive" || moving || arrowChoices.length === 0) return;

    for (const c of arrowChoices) {
      const alongM = Math.min(55, Math.max(18, pathLengthM(c.chain) * 0.35));
      const frac = Math.min(0.7, alongM / Math.max(pathLengthM(c.chain), 1));
      const tip =
        pointAlongEdges(graph, c.chain, frac) ??
        pointAlongEdges(graph, [c.edge], 0.6);
      if (!tip) continue;

      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-choice-arrow";
      el.style.setProperty("--accent", c.accent);
      el.setAttribute("aria-label", `Option ${c.letter}: ${c.action}`);
      el.innerHTML =
        `<span class="map-choice-arrow__badge">${c.letter}</span>` +
        `<span class="map-choice-arrow__shaft" aria-hidden="true"></span>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onChooseRef.current(c.edge);
      });

      const marker = new Marker({
        element: el,
        anchor: "center",
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat([tip.lng, tip.lat])
        .setRotation(tip.bearing)
        .addTo(map);
      choiceMarkersRef.current.push(marker);
    }

    return () => {
      for (const m of choiceMarkersRef.current) m.remove();
      choiceMarkersRef.current = [];
    };
  }, [graph, arrowChoices, phase, moving, mapReady]);

  // Keep taxi on the driven polyline; snap while moving, ease when stopped.
  useEffect(() => {
    const map = mapRef.current;
    const marker = taxiMarkerRef.current;
    if (!map || !marker) return;

    const travelBearing = moving && along ? along.bearing : heading;
    marker.setLngLat(taxiLngLat);
    marker.setRotation(0);

    if (moving) {
      map.jumpTo({
        center: taxiLngLat,
        bearing: travelBearing,
        zoom: Math.max(map.getZoom(), 15.6),
      });
    } else {
      map.easeTo({
        center: taxiLngLat,
        bearing: travelBearing,
        zoom: Math.max(map.getZoom(), 15.1),
        duration: 420,
        essential: true,
      });
    }
  }, [taxiLngLat, moving, along, heading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    ensureLayers(map);
    updateLayers(
      map,
      graph,
      layerStateFrom(
        traversed,
        arrowChoices,
        destinationNode,
        destinationLabel,
        phase === "debrief" ? optimalEdgeIds : [],
        activePath,
      ),
    );
  }, [
    graph,
    traversed,
    arrowChoices,
    destinationNode,
    destinationLabel,
    optimalEdgeIds,
    phase,
    activePath,
  ]);

  return (
    <div className="map-drive">
      <div ref={containerRef} className="map-drive__canvas" />

      {phase === "drive" && !moving && arrowChoices.length > 0 && (
        <JunctionMinimap
          graph={graph}
          currentNode={currentNode}
          headingDeg={heading}
          choices={arrowChoices.map((c) => ({
            edge: c.edge,
            index: c.index,
            accent: c.accent,
          }))}
        />
      )}

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
              <span className="map-drive__choice-top">
                <span className="map-drive__letter">{c.letter}</span>
                <span className="map-drive__action">{c.action}</span>
              </span>
              <span className="map-drive__road">{c.roadEn}</span>
              {c.placeHint && (
                <span className="map-drive__toward">{c.placeHint}</span>
              )}
              <span className="map-drive__meta">
                {(c.lengthM / 1000).toFixed(2)} km
              </span>
            </button>
          ))}
        </div>
      )}

      {moving && activePath.length > 0 && (
        <div className="map-drive__moving" aria-live="polite">
          {displayRoadName((along?.edge ?? activePath[0])!.nameEn)}
        </div>
      )}
    </div>
  );
}

type ChoiceLayer = {
  edge: GraphEdge;
  chain: GraphEdge[];
  accent: string;
  index: number;
  letter: string;
  bearing: number;
};

function layerStateFrom(
  traversed: string[],
  arrowChoices: ChoiceLayer[],
  destinationNode: NodeId,
  destinationLabel: string,
  optimalEdgeIds: string[],
  activePath: GraphEdge[],
) {
  return {
    traversed,
    choices: arrowChoices.map((c) => ({
      edge: c.edge,
      chain: c.chain,
      accent: c.accent,
      index: c.index,
      letter: c.letter,
      bearing: c.bearing,
    })),
    destinationNode,
    destinationLabel,
    optimalEdgeIds,
    activePath,
  };
}

function ensureLayers(map: MapLibreMap) {
  if (!map.getSource("trip-player")) {
    map.addSource("trip-player", { type: "geojson", data: emptyFc() });
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

  if (!map.getSource("trip-active")) {
    map.addSource("trip-active", { type: "geojson", data: emptyFc() });
    map.addLayer({
      id: "trip-active-line",
      type: "line",
      source: "trip-active",
      paint: {
        "line-color": "#ff7043",
        "line-width": 7,
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getSource("trip-optimal")) {
    map.addSource("trip-optimal", { type: "geojson", data: emptyFc() });
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
    map.addSource("trip-choices", { type: "geojson", data: emptyFc() });
    map.addLayer({
      id: "trip-choices-casing",
      type: "line",
      source: "trip-choices",
      paint: {
        "line-color": "#111",
        "line-width": 10,
        "line-opacity": 0.35,
      },
    });
    map.addLayer({
      id: "trip-choices-line",
      type: "line",
      source: "trip-choices",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getSource("trip-points")) {
    map.addSource("trip-points", { type: "geojson", data: emptyFc() });
    map.addLayer({
      id: "trip-dest-halo",
      type: "circle",
      source: "trip-points",
      filter: ["==", ["get", "kind"], "dest"],
      paint: {
        "circle-radius": 16,
        "circle-color": "#111",
        "circle-opacity": 0.2,
      },
    });
    map.addLayer({
      id: "trip-dest",
      type: "circle",
      source: "trip-points",
      filter: ["==", ["get", "kind"], "dest"],
      paint: {
        "circle-radius": 9,
        "circle-color": "#111",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#fff",
      },
    });
  }
}

function updateLayers(
  map: MapLibreMap,
  graph: RoadGraph,
  state: {
    traversed: string[];
    choices: ChoiceLayer[];
    destinationNode: NodeId;
    destinationLabel: string;
    optimalEdgeIds: string[];
    activePath: GraphEdge[];
  },
) {
  setSource(map, "trip-player", edgesGeoJson(graph, state.traversed));
  setSource(map, "trip-optimal", edgesGeoJson(graph, state.optimalEdgeIds));
  setSource(
    map,
    "trip-active",
    state.activePath.length
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: pathCoords(graph, state.activePath),
              },
            },
          ],
        }
      : emptyFc(),
  );

  const choiceLineFeatures: GeoJSON.Feature[] = [];

  for (const c of state.choices) {
    // Preview only the near stretch so the arrow sits on a clear coloured road.
    const previewLen = Math.min(120, Math.max(40, pathLengthM(c.chain) * 0.25));
    let used = 0;
    const preview: GraphEdge[] = [];
    for (const e of c.chain) {
      preview.push(e);
      used += e.lengthM;
      if (used >= previewLen) break;
    }
    const coords = pathCoords(graph, preview.length ? preview : [c.edge]);
    if (coords.length >= 2) {
      choiceLineFeatures.push({
        type: "Feature",
        properties: { color: c.accent, label: c.letter },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  setSource(map, "trip-choices", {
    type: "FeatureCollection",
    features: choiceLineFeatures,
  });

  const dest = graph.nodes[state.destinationNode];
  const pointFeatures: GeoJSON.Feature[] = [];
  if (dest) {
    pointFeatures.push({
      type: "Feature",
      properties: {
        kind: "dest",
        label: state.destinationLabel,
      },
      geometry: { type: "Point", coordinates: [dest.lng, dest.lat] },
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
  const coords: [number, number][] = [];
  let lastTo: string | null = null;

  for (const id of edgeIds) {
    const e = graph.edges[id];
    if (!e) continue;
    const a = graph.nodes[e.from];
    const b = graph.nodes[e.to];
    if (!a || !b) continue;
    if (lastTo !== e.from || coords.length === 0) {
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords.slice() },
        });
      }
      coords.length = 0;
      coords.push([a.lng, a.lat]);
    }
    coords.push([b.lng, b.lat]);
    lastTo = e.to;
  }
  if (coords.length >= 2) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords.slice() },
    });
  }
  return { type: "FeatureCollection", features };
}
