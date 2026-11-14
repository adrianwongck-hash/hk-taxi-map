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
- ~190 Red landmarks (hospitals, schools, estates, MTR, malls, tourist, streets)
- Green / Blue: **To be updated**
- Regenerate landmarks: `npm run fetch:red-landmarks` (see [docs/LANDMARKS.md](docs/LANDMARKS.md))
