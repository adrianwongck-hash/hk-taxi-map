# Red map data — highways + landmarks

Green / Blue modes stay **To be updated**. Red uses a **full OSM highway graph** for HKI + Kowloon plus a curated landmark seed.

## Pipeline

```bash
# 1) Download HK extract once (~36MB)
curl.exe -L -o src/data/generated/hong-kong.osm.pbf ^
  https://download.geofabrik.de/asia/china/hong-kong-latest.osm.pbf

# 2) Build routable graph + snap landmarks
npm run build:red-highways
```

Output: `src/data/generated/redGraph.json` → `src/data/redGraph.ts`.

### What the builder does

1. Read Geofabrik PBF; keep highways in the Red bbox (motorway→residential + links).
2. Build directed edges (one-ways / roundabouts respected).
3. Keep the largest connected component; simplify degree-2 chains.
4. Snap seed landmarks to the nearest junction (short spur only if >45 m away).

### Landmark sources

Curated seed (`scripts/red-landmark-seed.mjs`): hospitals, schools/unis, tourist spots, malls, MTR exits, estates, named street drop-offs.

Optional older Overpass POI merge: `npm run fetch:red-landmarks` (not required once highways are built).

Trip picker (`generateTrip`) randomly samples landmark pairs with shortest path ≥ 800 m (heap Dijkstra).

## Growing further

| Need | Approach |
|------|----------|
| More POIs | Expand `red-landmark-seed.mjs`, re-run `build:red-highways` |
| Turn restrictions | Import OSM `type=restriction` relations into `turnRestrictions` |
| NT / Lantau | Same pipeline with Green/Blue bboxes + seeds |
