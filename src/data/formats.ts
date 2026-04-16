import type { FormatInfo } from "@/types";

export const FORMATS: FormatInfo[] = [
  {
    id: "standard",
    label: "Standard",
    icon: "⬡",
    description: "Current 2-year rotation of sets",
    minDeckSize: 60,
    maxCopies: 4,
  },
  {
    id: "pioneer",
    label: "Pioneer",
    icon: "▲",
    description: "Return to Ravnica forward, no fetch lands",
    minDeckSize: 60,
    maxCopies: 4,
  },
  {
    id: "modern",
    label: "Modern",
    icon: "◆",
    description: "8th Edition forward, powerful and diverse",
    minDeckSize: 60,
    maxCopies: 4,
  },
  {
    id: "legacy",
    label: "Legacy",
    icon: "☆",
    description: "All sets with a curated ban list",
    minDeckSize: 60,
    maxCopies: 4,
  },
  {
    id: "commander",
    label: "Commander",
    icon: "♛",
    description: "100-card singleton, multiplayer",
    minDeckSize: 100,
    maxCopies: 1,
  },
  {
    id: "pauper",
    label: "Pauper",
    icon: "○",
    description: "Commons only, surprisingly deep",
    minDeckSize: 60,
    maxCopies: 4,
  },
];
