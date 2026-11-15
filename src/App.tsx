import { useState } from "react";
import { DifficultySelect } from "./components/DifficultySelect";
import { ModeSelect } from "./components/ModeSelect";
import { TripScreen } from "./components/TripScreen";
import { redGraph } from "./data/redGraph";
import { MODES } from "./game/modes";
import type { Difficulty } from "./game/difficulty";
import type { TaxiMode } from "./sim/types";
import "./App.css";

export default function App() {
  const [mode, setMode] = useState<TaxiMode | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  if (!mode) {
    return (
      <main className="app">
        <ModeSelect onSelect={setMode} />
      </main>
    );
  }

  const modeInfo = MODES.find((m) => m.id === mode)!;

  if (!difficulty) {
    return (
      <main className="app">
        <DifficultySelect
          taxiTitle={`${modeInfo.titleEn} · ${modeInfo.titleZh}`}
          onSelect={setDifficulty}
          onBack={() => setMode(null)}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <TripScreen
        mode={mode}
        difficulty={difficulty}
        graph={redGraph}
        onExit={() => {
          setDifficulty(null);
          setMode(null);
        }}
      />
    </main>
  );
}
