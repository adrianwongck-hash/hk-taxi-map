/**
 * Count how many player clicks remain on a named landmark trip
 * after auto-continue through non-decision nodes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(
  readFileSync(join(root, "src/data/generated/redGraph.json"), "utf8"),
);

const UTURN = 150;

function bearing(a, b) {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function edgeBearing(edge) {
  return bearing(graph.nodes[edge.from], graph.nodes[edge.to]);
}

function rel(h, t) {
  let d = t - h;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

const adj = new Map();
for (const e of Object.values(graph.edges)) {
  if (!e.taxiTypes.includes("red")) continue;
  if (!adj.has(e.from)) adj.set(e.from, []);
  adj.get(e.from).push(e);
}

function outs(nodeId) {
  return adj.get(nodeId) || [];
}

function playable(nodeId, arrivedVia) {
  const all = outs(nodeId);
  if (!arrivedVia || all.length <= 1) return all.slice();
  const via = graph.edges[arrivedVia];
  if (!via) return all.slice();
  const heading = edgeBearing(via);
  const forward = all.filter((edge) => {
    if (edge.to === via.from) return false;
    return Math.abs(rel(heading, edgeBearing(edge))) < UTURN;
  });
  return forward.length > 0 ? forward : all.slice();
}

function isDeadEndStub(edge) {
  const next = outs(edge.to);
  return next.every((e) => e.to === edge.from);
}

function decision(nodeId, arrivedVia) {
  const choices = playable(nodeId, arrivedVia);
  const meaningful = choices.filter((e) => !isDeadEndStub(e));
  return meaningful.length > 0 ? meaningful : choices;
}

function autoContinue(nodeId, arrivedVia) {
  const choices = decision(nodeId, arrivedVia);
  return choices.length === 1 ? choices[0] : null;
}

function shortest(from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const heap = [[0, from]];
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [d, id] = heap.shift();
    if (d !== dist.get(id)) continue;
    if (id === to) break;
    for (const edge of outs(id)) {
      const alt = d + edge.lengthM;
      if (!dist.has(edge.to) || alt < dist.get(edge.to)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, edge);
        heap.push([alt, edge.to]);
      }
    }
  }
  if (!dist.has(to)) return null;
  const edges = [];
  let cur = to;
  while (cur !== from) {
    const e = prev.get(cur);
    if (!e) return null;
    edges.unshift(e);
    cur = e.from;
  }
  return { edges, lengthM: dist.get(to) };
}

function findLm(name) {
  const q = name.toLowerCase();
  return (
    graph.landmarks.find((l) => l.nameEn.toLowerCase() === q) ||
    graph.landmarks.find((l) => l.nameEn.toLowerCase().includes(q))
  );
}

const originName = process.argv[2] || "Canossa Hospital";
const destName = process.argv[3] || "The Merton";
const o = findLm(originName);
const d = findLm(destName);
if (!o || !d) {
  console.error("landmarks not found", { originName, destName, o, d });
  process.exit(1);
}

const path = shortest(o.nodeId, d.nodeId);
if (!path) {
  console.error("no path");
  process.exit(1);
}

let clicks = 0;
let autos = 0;
let node = o.nodeId;
let arrived = null;
let i = 0;
const edges = path.edges;

while (node !== d.nodeId && i < edges.length) {
  const auto = autoContinue(node, arrived);
  if (!auto || auto.id !== edges[i].id) {
    clicks++;
    const next = edges[i];
    arrived = next.id;
    node = next.to;
    i++;
    while (node !== d.nodeId && i < edges.length) {
      const cont = autoContinue(node, arrived);
      if (!cont || cont.id !== edges[i].id) break;
      autos++;
      arrived = edges[i].id;
      node = edges[i].to;
      i++;
    }
  } else {
    autos++;
    arrived = edges[i].id;
    node = edges[i].to;
    i++;
  }
}

console.log(
  JSON.stringify(
    {
      from: o.nameEn,
      to: d.nameEn,
      pathEdges: edges.length,
      lengthKm: Math.round((path.lengthM / 1000) * 100) / 100,
      playerClicks: clicks,
      autoSegments: autos,
    },
    null,
    2,
  ),
);
