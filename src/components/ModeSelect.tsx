import type { CSSProperties } from "react";
import { MODES, type ModeInfo } from "../game/modes";
import type { TaxiMode } from "../sim/types";
import "./ModeSelect.css";

interface Props {
  onSelect: (mode: TaxiMode) => void;
}

export function ModeSelect({ onSelect }: Props) {
  return (
    <div className="mode-select">
      <header className="mode-select__hero">
        <p className="mode-select__eyebrow">Hong Kong Taxi Map</p>
        <h1>Choose your taxi</h1>
        <p className="mode-select__sub">
          Legal turns only. Beat the shortest path. Watch the meter.
        </p>
      </header>
      <div className="mode-select__grid">
        {MODES.map((mode) => (
          <ModeCard key={mode.id} mode={mode} onSelect={onSelect} />
        ))}
      </div>
      <p className="mode-select__note">
        Game meter &amp; routes are training approximations — not legal rulings.
      </p>
    </div>
  );
}

function ModeCard({
  mode,
  onSelect,
}: {
  mode: ModeInfo;
  onSelect: (mode: TaxiMode) => void;
}) {
  return (
    <button
      type="button"
      className={`mode-card${mode.playable ? "" : " mode-card--locked"}`}
      style={{ "--mode": mode.color } as CSSProperties}
      disabled={!mode.playable}
      onClick={() => onSelect(mode.id)}
    >
      <span className="mode-card__taxi" aria-hidden />
      <span className="mode-card__titles">
        <strong>{mode.titleEn}</strong>
        <span>{mode.titleZh}</span>
      </span>
      <span className="mode-card__region">
        {mode.regionEn} · {mode.regionZh}
      </span>
      <span className="mode-card__blurb">{mode.blurb}</span>
      <span className="mode-card__cta">
        {mode.playable ? "Play" : "To be updated"}
      </span>
    </button>
  );
}
