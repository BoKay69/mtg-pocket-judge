// ─── Card Types ──────────────────────────────────────────────────────────────

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: ManaColor[];
  color_identity: ManaColor[];
  keywords: string[];
  legalities: Record<Format, Legality>;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
  };
  rulings_uri: string;
  power?: string;
  toughness?: string;
  set: string;
  set_name: string;
}

export interface ScryfallRuling {
  source: string;
  published_at: string;
  comment: string;
}

export type ManaColor = "W" | "U" | "B" | "R" | "G";

export type Format =
  | "standard"
  | "modern"
  | "legacy"
  | "commander"
  | "pioneer"
  | "pauper"
  | "vintage"
  | "historic"
  | "alchemy";

export type Legality = "legal" | "not_legal" | "banned" | "restricted";

// ─── Stack Types ─────────────────────────────────────────────────────────────

export type StackItemType =
  | "instant"
  | "sorcery"
  | "creature"
  | "triggered"
  | "activated"
  | "static"
  | "phase";

export interface StackItem {
  id: string;
  card: string;
  owner: "Player A" | "Player B";
  type: StackItemType;
  target: string;
  color: string;
  imageUri?: string;
}

export interface ResolutionStep {
  step: number;
  text: string;
  itemId?: string;
}

export interface StackScenario {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: StackItem[];
  resolution: ResolutionStep[];
}

// ─── Keyword / Glossary Types ────────────────────────────────────────────────

export interface KeywordEntry {
  name: string;
  rule: string;
  example: string;
  tip: string;
  related: string[];
  formatNotes?: Partial<Record<Format, string>>;
}

export type KeywordCategory =
  | "Evergreen"
  | "Spell Types"
  | "Stack & Priority"
  | "Combat"
  | "Zones"
  | "Turn Structure";

// ─── Format Types ────────────────────────────────────────────────────────────

export interface FormatInfo {
  id: Format;
  label: string;
  icon: string;
  description: string;
  minDeckSize: number;
  maxCopies: number;
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  selectedFormat: Format;
  activeTab: "stack" | "builder" | "glossary" | "search";
}
