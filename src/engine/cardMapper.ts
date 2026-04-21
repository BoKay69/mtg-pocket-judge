import type { ScryfallCard } from "@/types";
import type {
  Permanent,
  EngineStackItem,
  SpellType,
  PermanentType,
  KeywordAbility,
  PlayerId,
} from "./types";
import { parseTriggersFromOracle } from "./triggers";
import { generateId } from "./utils";

// ─── Keyword Mapping ─────────────────────────────────────────────────────────

const SCRYFALL_KEYWORD_MAP: Record<string, KeywordAbility> = {
  deathtouch: "deathtouch",
  defender: "defender",
  "double strike": "double_strike",
  "first strike": "first_strike",
  flash: "flash",
  flying: "flying",
  haste: "haste",
  hexproof: "hexproof",
  indestructible: "indestructible",
  lifelink: "lifelink",
  menace: "menace",
  reach: "reach",
  shroud: "shroud",
  trample: "trample",
  vigilance: "vigilance",
  ward: "ward",
};

// ─── Type Extraction ─────────────────────────────────────────────────────────

function extractPermanentTypes(typeLine: string): PermanentType[] {
  const lower = typeLine.toLowerCase();
  const types: PermanentType[] = [];
  if (lower.includes("creature")) types.push("creature");
  if (lower.includes("artifact")) types.push("artifact");
  if (lower.includes("enchantment")) types.push("enchantment");
  if (lower.includes("planeswalker")) types.push("planeswalker");
  if (lower.includes("land")) types.push("land");
  return types;
}

function extractSpellType(typeLine: string): SpellType {
  const lower = typeLine.toLowerCase();
  if (lower.includes("instant")) return "instant";
  if (lower.includes("sorcery")) return "sorcery";
  if (lower.includes("creature")) return "creature";
  if (lower.includes("artifact")) return "artifact";
  if (lower.includes("enchantment")) return "enchantment";
  if (lower.includes("planeswalker")) return "planeswalker";
  return "instant"; // fallback
}

function isPermanentType(typeLine: string): boolean {
  const lower = typeLine.toLowerCase();
  return (
    lower.includes("creature") ||
    lower.includes("artifact") ||
    lower.includes("enchantment") ||
    lower.includes("planeswalker") ||
    lower.includes("land")
  );
}

function isInstantSpeed(card: ScryfallCard): boolean {
  const lower = card.type_line.toLowerCase();
  if (lower.includes("instant")) return true;
  if (card.keywords.some((k) => k.toLowerCase() === "flash")) return true;
  return false;
}

// ─── Extract Keywords ────────────────────────────────────────────────────────

function extractKeywords(card: ScryfallCard): KeywordAbility[] {
  const keywords: KeywordAbility[] = [];
  for (const kw of card.keywords) {
    const mapped = SCRYFALL_KEYWORD_MAP[kw.toLowerCase()];
    if (mapped) keywords.push(mapped);
  }
  return keywords;
}

// ─── Check for Split Second ──────────────────────────────────────────────────

function hasSplitSecond(card: ScryfallCard): boolean {
  return (card.oracle_text || "").toLowerCase().includes("split second");
}

// ─── Main Conversion Functions ───────────────────────────────────────────────

/**
 * Convert a Scryfall card into a Permanent for the battlefield.
 */
export function cardToPermanent(
  card: ScryfallCard,
  controller: PlayerId
): Omit<Permanent, "id"> {
  const permId = "pending"; // Will be replaced with real ID when added to state
  const keywords = extractKeywords(card);
  const triggers = parseTriggersFromOracle(
    card.oracle_text || "",
    permId,
    card.name,
    controller
  );

  return {
    name: card.name,
    types: extractPermanentTypes(card.type_line),
    controller,
    owner: controller,
    basePower: card.power ? parseInt(card.power) || 0 : undefined,
    baseToughness: card.toughness ? parseInt(card.toughness) || 0 : undefined,
    currentPower: card.power ? parseInt(card.power) || 0 : undefined,
    currentToughness: card.toughness ? parseInt(card.toughness) || 0 : undefined,
    damageMarked: 0,
    keywords,
    triggers,
    tapped: false,
    summoningSick: true,
    counters: {},
    oracleText: card.oracle_text,
    imageUri: card.image_uris?.small,
  };
}

/**
 * Convert a Scryfall card into a Stack Item for casting.
 */
export function cardToStackItem(
  card: ScryfallCard,
  controller: PlayerId,
  targets: EngineStackItem["targets"] = []
): Omit<EngineStackItem, "id" | "timestamp"> {
  const spellType = extractSpellType(card.type_line);

  return {
    type: "spell",
    spellType,
    name: card.name,
    controller,
    targets,
    effect: card.oracle_text || undefined,
    isManaAbility: false,
    hasSplitSecond: hasSplitSecond(card),
    imageUri: card.image_uris?.normal || card.image_uris?.small,
  };
}

/**
 * Get a human-readable summary of what the card does.
 */
export function getCardSummary(card: ScryfallCard): {
  type: string;
  stats: string | null;
  keywords: string[];
  abilities: string[];
  isInstant: boolean;
  isPermanent: boolean;
} {
  const type = card.type_line;
  const stats =
    card.power && card.toughness ? `${card.power}/${card.toughness}` : null;
  const keywords = card.keywords || [];
  const abilities = (card.oracle_text || "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const isInstant = isInstantSpeed(card);
  const isPerm = isPermanentType(card.type_line);

  return { type, stats, keywords, abilities, isInstant, isPermanent: isPerm };
}

// ─── Target Detection ────────────────────────────────────────────────────────

export interface TargetRequirement {
  required: boolean;
  description: string; // e.g. "target creature", "target player", "target artifact or enchantment"
  type: "creature" | "player" | "permanent" | "spell" | "any";
}

/**
 * Analyze a card's oracle text to determine if it requires a target.
 * Returns null if no target is needed, or a TargetRequirement describing what's needed.
 */
export function detectTargetRequirement(card: ScryfallCard): TargetRequirement | null {
  const text = (card.oracle_text || "").toLowerCase();

  // No oracle text = no target (vanilla creatures, lands)
  if (!text) return null;

  // Permanent spells generally don't target (exceptions handled below)
  if (isPermanentType(card.type_line)) {
    // Auras target on cast
    if (text.includes("enchant creature")) {
      return { required: true, description: "Enchant creature", type: "creature" };
    }
    if (text.includes("enchant permanent")) {
      return { required: true, description: "Enchant permanent", type: "permanent" };
    }
    if (text.includes("enchant artifact")) {
      return { required: true, description: "Enchant artifact", type: "permanent" };
    }
    if (text.includes("enchant player")) {
      return { required: true, description: "Enchant player", type: "player" };
    }
    // ETB targets are handled by triggers, not the spell itself
    return null;
  }

  // Instants and sorceries — check for "target" keyword
  if (!text.includes("target")) {
    return null; // No targeting (board wipes, draw spells, etc.)
  }

  // Parse what kind of target
  if (text.includes("target creature or player") || text.includes("any target")) {
    return { required: true, description: "Target creature or player", type: "any" };
  }
  if (text.includes("target creature or planeswalker")) {
    return { required: true, description: "Target creature or planeswalker", type: "creature" };
  }
  if (text.includes("target creature")) {
    return { required: true, description: "Target creature", type: "creature" };
  }
  if (text.includes("target player") || text.includes("target opponent")) {
    return { required: true, description: "Target player", type: "player" };
  }
  if (text.includes("target artifact or enchantment")) {
    return { required: true, description: "Target artifact or enchantment", type: "permanent" };
  }
  if (text.includes("target artifact")) {
    return { required: true, description: "Target artifact", type: "permanent" };
  }
  if (text.includes("target enchantment")) {
    return { required: true, description: "Target enchantment", type: "permanent" };
  }
  if (text.includes("target permanent")) {
    return { required: true, description: "Target permanent", type: "permanent" };
  }
  if (text.includes("target spell")) {
    return { required: true, description: "Target spell", type: "spell" };
  }
  if (text.includes("target instant") || text.includes("target instant or sorcery")) {
    return { required: true, description: "Target instant or sorcery spell", type: "spell" };
  }
  if (text.includes("target land")) {
    return { required: true, description: "Target land", type: "permanent" };
  }
  if (text.includes("target planeswalker")) {
    return { required: true, description: "Target planeswalker", type: "permanent" };
  }

  // Generic "target" found but couldn't parse specifics
  return { required: true, description: "Target (see card text)", type: "any" };
}
