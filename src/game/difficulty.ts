export type Difficulty = "normal" | "hard";

export interface DifficultyInfo {
  id: Difficulty;
  titleEn: string;
  titleZh: string;
  blurb: string;
}

export const DIFFICULTIES: DifficultyInfo[] = [
  {
    id: "normal",
    titleEn: "Normal",
    titleZh: "普通",
    blurb: "Undo last turn anytime. Revert a bad junction and try again.",
  },
  {
    id: "hard",
    titleEn: "Hard",
    titleZh: "困難",
    blurb: "No undo. Every junction choice sticks until the trip ends.",
  },
];
