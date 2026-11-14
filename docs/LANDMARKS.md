# Red landmark pool — how it is generated

Green / Blue modes stay **To be updated**. Red (HKI + Kowloon) uses a generated pool.

## Pipeline

```bash
npm run fetch:red-landmarks           # try Overpass, merge with seed
npm run fetch:red-landmarks -- --seed-only   # curated seed only (offline)
```

Output: `src/data/generated/redGraph.json` (imported by `src/data/redGraph.ts`).

### Sources

1. **Curated seed** (`scripts/red-landmark-seed.mjs`) — hospitals, schools/universities, tourist spots, malls, MTR exits, public/private estates, named street drop-offs.
2. **OpenStreetMap Overpass** (when reachable) — same categories inside an HKI+Kowloon bbox, capped per category, merged by name.

### How a POI becomes a playable destination

1. Find the nearest **corridor skeleton** node (Nathan Rd / harbour / Island north anchors, etc.).
2. Add a **spur node** at the POI’s real lat/lng.
3. Add bidirectional **spur edges** (access road) to that anchor so Dijkstra can route to it.
4. Register a **landmark** pointing at the spur node.

Trip picker (`generateTrip`) randomly samples landmark pairs with shortest path ≥ 800 m.

## Growing the pool further

| Need | Approach |
|------|----------|
| More hospitals / schools / malls | Expand seed list, or re-run Overpass when API is healthy |
| Public estates | OSM `landuse=residential` + `building=apartments` with `name`; HK Housing Authority estate lists |
| Private estates | Named complexes in OSM / Centamap-style gazetteers (manual or licensed data) |
| Streets | Named `highway=*` midpoints or junctions as drop-offs |
| Tourist spots | OSM `tourism=*`, plus HKTB lists folded into the seed |
| True street-following | Replace spur-to-skeleton with a full OSM highway graph for Red |

Private single houses are usually **not** good taxi destinations (no stable public name) — prefer named blocks/estates.
