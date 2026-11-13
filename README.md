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

- Vite + React + TypeScript scaffold
- Sim core: graph, legal exits, shortest path, meter fare, scoring
- Playable **Red** mode on a tiny sample Kowloon/harbour graph (schematic map)
- Green / Blue modes listed, locked until region content ships
