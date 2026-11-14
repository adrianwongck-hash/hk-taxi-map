import { useState } from "react";
import { ModeSelect } from "./components/ModeSelect";
import { TripScreen } from "./components/TripScreen";
import { redGraph } from "./data/redGraph";
import type { TaxiMode } from "./sim/types";
import "./App.css";

export default function App() {
  const [mode, setMode] = useState<TaxiMode | null>(null);

  if (!mode) {
    return (
      <main className="app">
        <ModeSelect onSelect={setMode} />
      </main>
    );
  }

  return (
    <main className="app">
      <TripScreen
        mode={mode}
        graph={redGraph}
        onExit={() => setMode(null)}
      />
    </main>
  );
}
