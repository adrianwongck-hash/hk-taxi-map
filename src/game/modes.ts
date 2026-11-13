import type { TaxiMode } from "../sim/types";

export interface ModeInfo {
  id: TaxiMode;
  titleEn: string;
  titleZh: string;
  regionEn: string;
  regionZh: string;
  blurb: string;
  color: string;
  playable: boolean;
}

export const MODES: ModeInfo[] = [
  {
    id: "red",
    titleEn: "Urban Taxi",
    titleZh: "市區的士",
    regionEn: "Hong Kong Island & Kowloon",
    regionZh: "港島及九龍",
    blurb: "Dense junctions, harbour crossings, Nathan Road corridors.",
    color: "#c62828",
    playable: true,
  },
  {
    id: "green",
    titleEn: "NT Taxi",
    titleZh: "新界的士",
    regionEn: "New Territories",
    regionZh: "新界",
    blurb: "Town-to-town arterials across the New Territories.",
    color: "#2e7d32",
    playable: false,
  },
  {
    id: "blue",
    titleEn: "Lantau Taxi",
    titleZh: "大嶼山的士",
    regionEn: "Lantau Island",
    regionZh: "大嶼山",
    blurb: "Sparser network around Tung Chung and the airport.",
    color: "#1565c0",
    playable: false,
  },
];
