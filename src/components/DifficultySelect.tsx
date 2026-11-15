import { DIFFICULTIES, type Difficulty } from "../game/difficulty";
import "./ModeSelect.css";
import "./DifficultySelect.css";

interface Props {
  taxiTitle: string;
  onSelect: (difficulty: Difficulty) => void;
  onBack: () => void;
}

export function DifficultySelect({ taxiTitle, onSelect, onBack }: Props) {
  return (
    <div className="mode-select difficulty-select">
      <header className="mode-select__hero">
        <button type="button" className="difficulty-select__back" onClick={onBack}>
          ← Taxi
        </button>
        <p className="mode-select__eyebrow">{taxiTitle}</p>
        <h1>Choose difficulty</h1>
        <p className="mode-select__sub">
          Normal lets you revert junction options. Hard does not.
        </p>
      </header>
      <div className="difficulty-select__grid">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`difficulty-card difficulty-card--${d.id}`}
            onClick={() => onSelect(d.id)}
          >
            <strong>
              {d.titleEn}
              <span>{d.titleZh}</span>
            </strong>
            <p>{d.blurb}</p>
            <span className="difficulty-card__cta">Play</span>
          </button>
        ))}
      </div>
    </div>
  );
}
