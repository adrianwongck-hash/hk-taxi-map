/**
 * Fetch Red-taxi (HKI + Kowloon) POIs from OpenStreetMap Overpass,
 * snap each to the corridor skeleton, and emit a routable graph JSON
 * with spur edges so every landmark is a real trip endpoint.
 *
 * Usage: node scripts/fetch-red-landmarks.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_POIS } from "./red-landmark-seed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "src/data/generated/redGraph.json");

/** Rough urban Red operating area (excludes most of NT / Lantau). */
const BBOX = "22.235,114.118,22.355,114.268"; // s,w,n,e

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CAPS = {
  hospital: 60,
  school: 100,
  university: 20,
  tourist: 80,
  hotel: 60,
  mall: 40,
  mtr: 50,
  estate: 120,
  street: 80,
};

const query = `
[out:json][timeout:120];
(
  nwr["amenity"="hospital"](${BBOX});
  nwr["amenity"="clinic"]["healthcare"="hospital"](${BBOX});
  nwr["amenity"="school"](${BBOX});
  nwr["amenity"="university"](${BBOX});
  nwr["amenity"="college"](${BBOX});
  nwr["tourism"="attraction"](${BBOX});
  nwr["tourism"="museum"](${BBOX});
  nwr["tourism"="zoo"](${BBOX});
  nwr["tourism"="theme_park"](${BBOX});
  nwr["tourism"="viewpoint"](${BBOX});
  nwr["tourism"="hotel"](${BBOX});
  nwr["shop"="mall"](${BBOX});
  nwr["railway"="station"]["station"="subway"](${BBOX});
  nwr["railway"="station"]["subway"="yes"](${BBOX});
  nwr["station"="subway"](${BBOX});
  nwr["landuse"="residential"]["name"](${BBOX});
  nwr["building"="apartments"]["name"](${BBOX});
  nwr["place"="neighbourhood"]["name"](${BBOX});
  way["highway"~"primary|secondary|tertiary"]["name"](${BBOX});
);
out center tags;
`.trim();

/** Corridor skeleton — same topology as sampleGraph (real-ish coords). */
const CORRIDOR = {
  nodes: {
    mk_langham: { id: "mk_langham", lat: 22.3182, lng: 114.1686, nameEn: "Langham Place", nameZh: "朗豪坊" },
    mk_mtr: { id: "mk_mtr", lat: 22.3193, lng: 114.1694, nameEn: "Mong Kok MTR", nameZh: "旺角港鐵站" },
    pe_mtr: { id: "pe_mtr", lat: 22.3246, lng: 114.1682, nameEn: "Prince Edward MTR", nameZh: "太子港鐵站" },
    ymt_temple: { id: "ymt_temple", lat: 22.3115, lng: 114.1702, nameEn: "Temple Street", nameZh: "廟街" },
    jordan_mtr: { id: "jordan_mtr", lat: 22.3049, lng: 114.1717, nameEn: "Jordan MTR", nameZh: "佐敦港鐵站" },
    tst_harbour_city: { id: "tst_harbour_city", lat: 22.2967, lng: 114.1685, nameEn: "Harbour City", nameZh: "海港城" },
    tst_star_ferry: { id: "tst_star_ferry", lat: 22.2939, lng: 114.1685, nameEn: "Star Ferry Pier TST", nameZh: "尖沙咀天星碼頭" },
    tst_chungking: { id: "tst_chungking", lat: 22.2979, lng: 114.1724, nameEn: "Chungking Mansions", nameZh: "重慶大廈" },
    cht_kln: { id: "cht_kln", lat: 22.3028, lng: 114.1821, nameEn: "CHT Kowloon", nameZh: "紅隧九龍入口" },
    cht_hk: { id: "cht_hk", lat: 22.2865, lng: 114.1838, nameEn: "CHT Hong Kong", nameZh: "紅隧港島出口" },
    cwb_times: { id: "cwb_times", lat: 22.2783, lng: 114.1822, nameEn: "Times Square", nameZh: "時代廣場" },
    cwb_soho: { id: "cwb_soho", lat: 22.2805, lng: 114.1848, nameEn: "SOGO CWB", nameZh: "銅鑼灣崇光" },
    // Extra corridor anchors to spread snaps across denser urban Red area
    ssp_mtr: { id: "ssp_mtr", lat: 22.3307, lng: 114.1622, nameEn: "Sham Shui Po MTR", nameZh: "深水埗港鐵站" },
    kt_mtr: { id: "kt_mtr", lat: 22.3128, lng: 114.2258, nameEn: "Kwun Tong MTR", nameZh: "觀塘港鐵站" },
    hunghom: { id: "hunghom", lat: 22.3028, lng: 114.1819, nameEn: "Hung Hom Station", nameZh: "紅磡站" },
    whampoa: { id: "whampoa", lat: 22.3052, lng: 114.1895, nameEn: "Whampoa", nameZh: "黃埔" },
    central: { id: "central", lat: 22.2819, lng: 114.1583, nameEn: "Central MTR", nameZh: "中環港鐵站" },
    admiralty: { id: "admiralty", lat: 22.2783, lng: 114.1647, nameEn: "Admiralty MTR", nameZh: "金鐘港鐵站" },
    wanchai: { id: "wanchai", lat: 22.2776, lng: 114.1731, nameEn: "Wan Chai MTR", nameZh: "灣仔港鐵站" },
    northpoint: { id: "northpoint", lat: 22.2911, lng: 114.2005, nameEn: "North Point MTR", nameZh: "北角港鐵站" },
    quarrying: { id: "quarrying", lat: 22.2830, lng: 114.2140, nameEn: "Quarry Bay MTR", nameZh: "鰂魚涌港鐵站" },
    tsimshatsui_e: { id: "tsimshatsui_e", lat: 22.2950, lng: 114.1765, nameEn: "East Tsim Sha Tsui", nameZh: "尖東" },
  },
  edges: [
    ["mk_langham", "mk_mtr", 280, "Shanghai St", "上海街"],
    ["mk_mtr", "pe_mtr", 650, "Nathan Rd", "彌敦道"],
    ["mk_langham", "ymt_temple", 850, "Shanghai St", "上海街"],
    ["mk_mtr", "ymt_temple", 900, "Nathan Rd", "彌敦道"],
    ["pe_mtr", "jordan_mtr", 2200, "Lai Chi Kok Rd detour", "荔枝角道繞行"],
    ["ymt_temple", "jordan_mtr", 750, "Jordan Rd", "佐敦道"],
    ["ymt_temple", "tst_chungking", 1400, "Nathan Rd", "彌敦道"],
    ["jordan_mtr", "tst_chungking", 850, "Nathan Rd", "彌敦道"],
    ["jordan_mtr", "tst_harbour_city", 1100, "Canton Rd", "廣東道"],
    ["tst_chungking", "tst_harbour_city", 450, "Peking Rd", "北京道"],
    ["tst_harbour_city", "tst_star_ferry", 320, "Salisbury Rd", "梳士巴利道"],
    ["tst_chungking", "tst_star_ferry", 550, "Salisbury Rd", "梳士巴利道"],
    ["tst_chungking", "cht_kln", 1200, "Chatham Rd", "漆咸道"],
    ["jordan_mtr", "cht_kln", 1400, "Gascoigne Rd", "加士居道"],
    ["cht_kln", "cht_hk", 1900, "Cross-Harbour Tunnel", "紅磡海底隧道", 15, ["tunnel"]],
    ["cht_hk", "cwb_times", 1100, "Canal Rd Flyover", "堅拿道天橋"],
    ["cht_hk", "cwb_soho", 1300, "Gloucester Rd", "告士打道"],
    ["cwb_times", "cwb_soho", 400, "Russell St", "羅素街"],
    // Wider Red skeleton
    ["pe_mtr", "ssp_mtr", 1600, "Lai Chi Kok Rd", "荔枝角道"],
    ["ssp_mtr", "mk_langham", 1700, "Cheung Sha Wan Rd", "長沙灣道"],
    ["cht_kln", "hunghom", 200, "Cheong Wan Rd", "暢運道"],
    ["hunghom", "whampoa", 900, "Tak Man St", "德民街"],
    ["whampoa", "kt_mtr", 4200, "Kwun Tong Rd corridor", "觀塘道走廊"],
    ["tst_chungking", "tsimshatsui_e", 500, "Middle Rd", "中間道"],
    ["tsimshatsui_e", "cht_kln", 800, "Hong Chong Rd", "康莊道"],
    ["cht_hk", "wanchai", 1200, "Gloucester Rd", "告士打道"],
    ["wanchai", "admiralty", 900, "Hennessy / Queensway", "軒尼詩道／金鐘道"],
    ["admiralty", "central", 900, "Queensway", "金鐘道"],
    ["cwb_soho", "northpoint", 2800, "King's Rd", "英皇道"],
    ["northpoint", "quarrying", 1600, "King's Rd", "英皇道"],
    ["cwb_times", "wanchai", 1500, "Hennessy Rd", "軒尼詩道"],
  ],
};

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

function elCenter(el) {
  if (el.type === "node") return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function nameOf(tags = {}) {
  const en =
    tags["name:en"] ||
    tags.name ||
    tags["official_name:en"] ||
    tags.official_name ||
    null;
  const zh =
    tags["name:zh"] ||
    tags["name:zh-Hant"] ||
    tags["name:zh-Hans"] ||
    (tags.name && /[\u4e00-\u9fff]/.test(tags.name) ? tags.name : null) ||
    en;
  if (!en && !zh) return null;
  return {
    nameEn: String(en || zh).trim(),
    nameZh: String(zh || en).trim(),
  };
}

function categorize(tags = {}, isHighwayWay) {
  if (isHighwayWay) return "street";
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  if (tags.amenity === "school" || tags.amenity === "kindergarten") return "school";
  if (tags.amenity === "university" || tags.amenity === "college") return "university";
  if (
    tags.tourism === "attraction" ||
    tags.tourism === "museum" ||
    tags.tourism === "zoo" ||
    tags.tourism === "theme_park" ||
    tags.tourism === "viewpoint"
  )
    return "tourist";
  if (tags.tourism === "hotel") return "hotel";
  if (tags.shop === "mall") return "mall";
  if (tags.station === "subway" || tags.subway === "yes" || tags.railway === "station")
    return "mtr";
  if (
    tags.landuse === "residential" ||
    tags.building === "apartments" ||
    tags.place === "neighbourhood"
  )
    return "estate";
  return null;
}

async function fetchOverpass() {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      console.log(`Querying ${url} …`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "hk-taxi-map/0.1 (landmark import; local build script)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn(`Failed ${url}:`, err.message || err);
    }
  }
  throw lastErr;
}

function mergePois(seed, osmPois) {
  const seen = new Set();
  const out = [];
  for (const p of [...seed, ...osmPois]) {
    const key = `${p.nameEn.toLowerCase()}|${p.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function buildBidirectionalEdges(list) {
  const edges = {};
  for (const row of list) {
    const [from, to, lengthM, nameEn, nameZh, tollHkd, flags] = row;
    for (const [a, b] of [
      [from, to],
      [to, from],
    ]) {
      const id = `${a}-${b}`;
      edges[id] = {
        id,
        from: a,
        to: b,
        lengthM,
        nameEn,
        nameZh,
        taxiTypes: ["red"],
        ...(tollHkd != null ? { tollHkd } : {}),
        ...(flags ? { flags } : {}),
      };
    }
  }
  return edges;
}

function nearestCorridor(lat, lng, nodes) {
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

function mainPois(elements) {
  const buckets = Object.fromEntries(Object.keys(CAPS).map((k) => [k, []]));
  const seenNames = new Set();

  for (const el of elements) {
    const tags = el.tags || {};
    const isHighway = el.type === "way" && tags.highway;
    const cat = categorize(tags, isHighway);
    if (!cat || !CAPS[cat]) continue;
    const names = nameOf(tags);
    if (!names) continue;
    // Skip generic street midpoints without a useful name length
    if (cat === "street" && names.nameEn.length < 4) continue;

    const center = elCenter(el);
    if (!center) continue;

    const key = `${names.nameEn.toLowerCase()}|${cat}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    buckets[cat].push({
      ...names,
      lat: center.lat,
      lng: center.lng,
      category: cat,
      osmId: `${el.type}/${el.id}`,
    });
  }

  const picked = [];
  for (const [cat, cap] of Object.entries(CAPS)) {
    const list = buckets[cat] || [];
    // Prefer spread: sort by a coarse grid hash then take cap
    list.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
    const step = Math.max(1, Math.floor(list.length / cap));
    for (let i = 0; i < list.length && picked.filter((p) => p.category === cat).length < cap; i += step) {
      picked.push(list[i]);
    }
  }
  return picked;
}

function buildGraph(pois) {
  const nodes = { ...structuredClone(CORRIDOR.nodes) };
  const edges = buildBidirectionalEdges(CORRIDOR.edges);
  const landmarks = [];

  // Seed landmarks on corridor anchors themselves (specific terminals)
  for (const n of Object.values(CORRIDOR.nodes)) {
    landmarks.push({
      id: `lm-${n.id}`,
      nodeId: n.id,
      nameEn: n.nameEn,
      nameZh: n.nameZh || n.nameEn,
      taxiTypes: ["red"],
      category: "anchor",
    });
  }

  let spur = 0;
  for (const poi of pois) {
    const { node: anchor, distM } = nearestCorridor(poi.lat, poi.lng, CORRIDOR.nodes);
    if (!anchor || distM > 4500) continue; // too far from urban skeleton

    const id = `poi_${slug(poi.nameEn)}_${spur++}`;
    nodes[id] = {
      id,
      lat: poi.lat,
      lng: poi.lng,
      nameEn: poi.nameEn,
      nameZh: poi.nameZh,
    };

    const spurM = Math.max(80, Math.round(distM));
    const road = `Access to ${poi.nameEn}`;
    const roadZh = `往${poi.nameZh}`;
    for (const [from, to] of [
      [id, anchor.id],
      [anchor.id, id],
    ]) {
      const eid = `${from}-${to}`;
      edges[eid] = {
        id: eid,
        from,
        to,
        lengthM: spurM,
        nameEn: road,
        nameZh: roadZh,
        taxiTypes: ["red"],
      };
    }

    landmarks.push({
      id: `lm-${id}`,
      nodeId: id,
      nameEn: poi.nameEn,
      nameZh: poi.nameZh,
      taxiTypes: ["red"],
      category: poi.category,
      osmId: poi.osmId,
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "curated seed + optional OpenStreetMap Overpass",
      bbox: BBOX,
      landmarkCount: landmarks.length,
      nodeCount: Object.keys(nodes).length,
      edgeCount: Object.keys(edges).length,
      caps: CAPS,
      note: "POIs snap to Red corridor skeleton via spur edges. Not a full OSM road graph yet.",
    },
    nodes,
    edges,
    turnRestrictions: [
      {
        at: "jordan_mtr",
        viaEdge: "pe_mtr-jordan_mtr",
        forbiddenTo: "jordan_mtr-pe_mtr",
      },
    ],
    landmarks,
  };
}

const preferSeedOnly = process.argv.includes("--seed-only");
let osmPois = [];
if (!preferSeedOnly) {
  try {
    const data = await fetchOverpass();
    osmPois = mainPois(data.elements || []);
    console.log(`Overpass POIs selected: ${osmPois.length}`);
  } catch (err) {
    console.warn(
      "Overpass unavailable — using curated seed only:",
      err.message || err,
    );
  }
} else {
  console.log("Building from curated seed only (--seed-only).");
}

const pois = mergePois(SEED_POIS, osmPois);
console.log(`Total POIs after merge: ${pois.length} (seed ${SEED_POIS.length})`);
const graph = buildGraph(pois);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(graph, null, 2));
console.log(`Wrote ${outPath}`);
console.log(graph.meta);
