/**
 * Build Red (HKI + Kowloon) highway graph from a local Geofabrik OSM PBF,
 * simplify degree-2 chains, snap curated landmarks, write redGraph.json.
 *
 * Prep (once):
 *   curl.exe -L -o src/data/generated/hong-kong.osm.pbf ^
 *     https://download.geofabrik.de/asia/china/hong-kong-latest.osm.pbf
 *
 * Usage:
 *   node scripts/build-red-highway-graph.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import through from "through2";
import parseOSM from "osm-pbf-parser";
import { SEED_POIS } from "./red-landmark-seed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pbfPath = path.join(root, "src/data/generated/hong-kong.osm.pbf");
const outPath = path.join(root, "src/data/generated/redGraph.json");

/** Red urban bbox (lat/lng). */
const BBOX = { minLat: 22.235, minLng: 114.118, maxLat: 22.355, maxLng: 114.268 };

const HIGHWAYS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

const MAX_LANDMARK_SNAP_M = 700;
/** Keep tiny segments — dropping them fragments the highway network. */
const MIN_EDGE_M = 0.5;

function inBbox(lat, lng) {
  return (
    lat >= BBOX.minLat &&
    lat <= BBOX.maxLat &&
    lng >= BBOX.minLng &&
    lng <= BBOX.maxLng
  );
}

function haversineM(a, b) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function isOneWay(tags = {}) {
  const ow = tags.oneway;
  if (ow === "yes" || ow === "1" || ow === "true") return "forward";
  if (ow === "-1" || ow === "reverse") return "reverse";
  if (
    tags.highway === "motorway" ||
    tags.highway === "motorway_link" ||
    tags.junction === "roundabout"
  )
    return "forward";
  return "both";
}

function roadName(tags = {}) {
  const en = tags["name:en"] || tags.name || tags.highway || "Road";
  const zh =
    tags["name:zh"] ||
    tags["name:zh-Hant"] ||
    (tags.name && /[\u4e00-\u9fff]/.test(tags.name) ? tags.name : en);
  return { nameEn: String(en), nameZh: String(zh) };
}

function flagsFor(tags = {}) {
  const flags = [];
  if (tags.tunnel === "yes") flags.push("tunnel");
  if (tags.bridge === "yes") flags.push("bridge");
  return flags.length ? flags : undefined;
}

function tollFor(tags = {}) {
  const en = tags["name:en"] || "";
  const name = tags.name || "";
  if (/cross-harbour|紅磡海底/i.test(en) || /cross-harbour|紅磡海底/i.test(name))
    return 15;
  return undefined;
}

function readPbf(file) {
  return new Promise((resolve, reject) => {
    const nodes = new Map(); // id -> {lat,lng}
    const ways = [];
    let seen = 0;

    fs.createReadStream(file)
      .pipe(parseOSM())
      .pipe(
        through.obj(
          (items, _enc, next) => {
            for (const item of items) {
              seen++;
              if (item.type === "node") {
                if (inBbox(item.lat, item.lon)) {
                  nodes.set(item.id, { lat: item.lat, lng: item.lon });
                }
              } else if (item.type === "way") {
                const hw = item.tags?.highway;
                if (hw && HIGHWAYS.has(hw)) ways.push(item);
              }
            }
            if (seen % 500000 === 0) console.log(`… scanned ${seen} OSM objects`);
            next();
          },
          (done) => {
            console.log(
              `PBF done: ${nodes.size} nodes in bbox, ${ways.length} highway ways (pre-filter)`,
            );
            resolve({ nodes, ways });
            done();
          },
        ),
      )
      .on("error", reject);
  });
}

function buildRawGraph(osmNodes, ways) {
  const nodes = {};
  const edges = {};
  let edgeSeq = 0;
  let keptWays = 0;
  let segmentCount = 0;

  const ensureNode = (osmId) => {
    const id = `n${osmId}`;
    if (nodes[id]) return id;
    const c = osmNodes.get(osmId);
    if (!c) return null;
    nodes[id] = { id, lat: c.lat, lng: c.lng };
    return id;
  };

  for (const way of ways) {
    const refs = way.refs || way.nodes || [];
    if (refs.length < 2) continue;
    if (!refs.some((id) => osmNodes.has(id))) continue;
    keptWays++;
    const tags = way.tags || {};
    const { nameEn, nameZh } = roadName(tags);
    const dir = isOneWay(tags);
    const flags = flagsFor(tags);
    const tollHkd = tollFor(tags);

    const addEdge = (fromOsm, toOsm) => {
      const from = ensureNode(fromOsm);
      const to = ensureNode(toOsm);
      if (!from || !to) return;
      const lengthM = haversineM(nodes[from], nodes[to]);
      if (lengthM < MIN_EDGE_M) return;
      segmentCount++;
      const id = `e${edgeSeq++}`;
      edges[id] = {
        id,
        from,
        to,
        lengthM: Math.round(lengthM * 10) / 10,
        nameEn,
        nameZh,
        taxiTypes: ["red"],
        ...(tollHkd != null ? { tollHkd } : {}),
        ...(flags ? { flags } : {}),
      };
    };

    for (let i = 0; i < refs.length - 1; i++) {
      const a = refs[i];
      const b = refs[i + 1];
      if (dir === "forward") addEdge(a, b);
      else if (dir === "reverse") addEdge(b, a);
      else {
        addEdge(a, b);
        addEdge(b, a);
      }
    }
  }

  console.log(
    `Kept ways: ${keptWays}; directed edges: ${Object.keys(edges).length}; segments touched: ${segmentCount}; road nodes: ${Object.keys(nodes).length}`,
  );
  return { nodes, edges };
}

function adjacency(edges) {
  const out = new Map();
  const inn = new Map();
  for (const e of Object.values(edges)) {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inn.has(e.to)) inn.set(e.to, []);
    out.get(e.from).push(e);
    inn.get(e.to).push(e);
  }
  return { out, inn };
}

function simplifyGraph(graph) {
  const { nodes, edges } = graph;
  const { out, inn } = adjacency(edges);
  const used = new Set();
  const newEdges = {};
  let seq = 0;

  const isChainNode = (id) => {
    const o = out.get(id) || [];
    const i = inn.get(id) || [];
    if (o.length === 1 && i.length === 1) {
      return i[0].nameEn === o[0].nameEn && i[0].from !== o[0].to;
    }
    if (o.length === 2 && i.length === 2) {
      const names = new Set([...o, ...i].map((e) => e.nameEn));
      return names.size === 1;
    }
    return false;
  };

  for (const e of Object.values(edges)) {
    if (used.has(e.id)) continue;
    if (isChainNode(e.from)) continue;
    used.add(e.id);
    const chain = [e];
    let cur = e.to;
    let guard = 0;
    while (isChainNode(cur) && guard++ < 8000) {
      const nexts = (out.get(cur) || []).filter((x) => !used.has(x.id));
      if (nexts.length !== 1) break;
      const next = nexts[0];
      if (next.nameEn !== e.nameEn) break;
      chain.push(next);
      used.add(next.id);
      cur = next.to;
    }
    const first = chain[0];
    const last = chain[chain.length - 1];
    const id = `s${seq++}`;
    newEdges[id] = {
      id,
      from: first.from,
      to: last.to,
      lengthM: Math.round(chain.reduce((s, x) => s + x.lengthM, 0) * 10) / 10,
      nameEn: first.nameEn,
      nameZh: first.nameZh,
      taxiTypes: ["red"],
      ...(first.tollHkd != null ? { tollHkd: first.tollHkd } : {}),
      ...(first.flags ? { flags: first.flags } : {}),
    };
  }

  for (const e of Object.values(edges)) {
    if (used.has(e.id)) continue;
    const id = `s${seq++}`;
    newEdges[id] = { ...e, id, taxiTypes: ["red"] };
  }

  const usedNodes = new Set();
  for (const e of Object.values(newEdges)) {
    usedNodes.add(e.from);
    usedNodes.add(e.to);
  }
  const newNodes = {};
  for (const id of usedNodes) {
    if (nodes[id]) newNodes[id] = nodes[id];
  }
  return { nodes: newNodes, edges: newEdges };
}

function nearestNode(lat, lng, nodes) {
  let best = null;
  let bestD = Infinity;
  for (const n of Object.values(nodes)) {
    const d = haversineM({ lat, lng }, n);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return { node: best, distM: bestD };
}

function snapLandmarks(nodes, edges) {
  const landmarks = [];
  const seen = new Set();
  let spurSeq = 0;
  const outNodes = { ...nodes };
  const outEdges = { ...edges };

  for (const poi of SEED_POIS) {
    const key = poi.nameEn.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { node, distM } = nearestNode(poi.lat, poi.lng, nodes);
    if (!node || distM > MAX_LANDMARK_SNAP_M) continue;

    if (distM <= 45) {
      landmarks.push({
        id: `lm-${node.id}-${landmarks.length}`,
        nodeId: node.id,
        nameEn: poi.nameEn,
        nameZh: poi.nameZh,
        taxiTypes: ["red"],
        category: poi.category,
      });
      continue;
    }

    const spurId = `poi_${spurSeq++}`;
    outNodes[spurId] = {
      id: spurId,
      lat: poi.lat,
      lng: poi.lng,
      nameEn: poi.nameEn,
      nameZh: poi.nameZh,
    };
    const spurM = Math.round(distM);
    for (const [from, to] of [
      [spurId, node.id],
      [node.id, spurId],
    ]) {
      const eid = `${from}-${to}`;
      outEdges[eid] = {
        id: eid,
        from,
        to,
        lengthM: spurM,
        nameEn: `Access · ${poi.nameEn}`,
        nameZh: `通道 · ${poi.nameZh}`,
        taxiTypes: ["red"],
      };
    }
    landmarks.push({
      id: `lm-${spurId}`,
      nodeId: spurId,
      nameEn: poi.nameEn,
      nameZh: poi.nameZh,
      taxiTypes: ["red"],
      category: poi.category,
    });
  }

  return { nodes: outNodes, edges: outEdges, landmarks };
}

function pruneToLargestComponent(nodes, edges) {
  const adj = new Map();
  for (const e of Object.values(edges)) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from).add(e.to);
    adj.get(e.to).add(e.from);
  }

  const seen = new Set();
  let bestSet = new Set();
  const sizes = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp = new Set([start]);
    seen.add(start);
    while (stack.length) {
      const u = stack.pop();
      for (const v of adj.get(u) || []) {
        if (!seen.has(v)) {
          seen.add(v);
          comp.add(v);
          stack.push(v);
        }
      }
    }
    sizes.push(comp.size);
    if (comp.size > bestSet.size) bestSet = comp;
  }
  sizes.sort((a, b) => b - a);
  console.log(
    `Components: ${sizes.length}; top sizes: ${sizes.slice(0, 5).join(", ")}`,
  );

  const newNodes = {};
  for (const id of bestSet) {
    if (nodes[id]) newNodes[id] = nodes[id];
  }
  const newEdges = {};
  for (const [id, e] of Object.entries(edges)) {
    if (bestSet.has(e.from) && bestSet.has(e.to)) newEdges[id] = e;
  }
  return { nodes: newNodes, edges: newEdges, componentSize: bestSet.size };
}

async function main() {
  if (!fs.existsSync(pbfPath)) {
    console.error(`Missing ${pbfPath}`);
    console.error(
      "Download: curl.exe -L -o src/data/generated/hong-kong.osm.pbf https://download.geofabrik.de/asia/china/hong-kong-latest.osm.pbf",
    );
    process.exit(1);
  }

  console.log("Reading", pbfPath);
  const { nodes: osmNodes, ways } = await readPbf(pbfPath);

  console.log("Building raw directed graph…");
  let graph = buildRawGraph(osmNodes, ways);
  console.log(
    `Raw: ${Object.keys(graph.nodes).length} nodes, ${Object.keys(graph.edges).length} edges`,
  );

  console.log("Pruning to largest connected component…");
  const pruned = pruneToLargestComponent(graph.nodes, graph.edges);
  graph = { nodes: pruned.nodes, edges: pruned.edges };
  console.log(
    `Component: ${pruned.componentSize} nodes, ${Object.keys(graph.edges).length} edges`,
  );

  console.log("Simplifying degree-2 chains…");
  graph = simplifyGraph(graph);
  console.log(
    `Simple: ${Object.keys(graph.nodes).length} nodes, ${Object.keys(graph.edges).length} edges`,
  );

  console.log("Snapping landmarks…");
  const snapped = snapLandmarks(graph.nodes, graph.edges);

  // Drop landmarks whose nodes were outside component (shouldn't happen for spurs)
  const landmarks = snapped.landmarks.filter((l) => snapped.nodes[l.nodeId]);

  const out = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "Geofabrik hong-kong OSM PBF highways + curated landmark seed",
      bbox: BBOX,
      nodeCount: Object.keys(snapped.nodes).length,
      edgeCount: Object.keys(snapped.edges).length,
      landmarkCount: landmarks.length,
      note: "Full urban highway graph (simplified). Landmarks snap to nearest junction; short spur only if >45m.",
    },
    nodes: snapped.nodes,
    edges: snapped.edges,
    turnRestrictions: [],
    landmarks,
  };

  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`Wrote ${outPath}`);
  console.log(out.meta);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
