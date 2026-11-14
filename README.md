# Hong Kong Taxi Map

Responsive web taxi navigation game. Pick **Red / Green / Blue** by service region, choose legal roads at each junction, beat the shortest path, and watch the meter tick.

## Design

- Junction choices only (legal exits filtered by road rules)
- Training-lite: score vs shortest legal distance on the game graph
- Live meter fare per taxi type
- Playable in the browser on phone and desktop

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full plan.

## Dev

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run build
```

## Status

- Playable **Red** mode on a real HK basemap (heading-up MapLibre)
- Full OSM highway graph for HKI + Kowloon (~36k nodes) + ~170 landmarks
- Green / Blue: **To be updated**
- Rebuild map data: see [docs/LANDMARKS.md](docs/LANDMARKS.md) (`npm run build:red-highways`)
