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
  if (lower.includes("land")) return "land";
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
    imageUri: card.image_uris?.normal || card.image_uris?.small,
  };
}

/**
 * Convert a Scryfall card into a Stack Item for casting.
 */
export function cardToStackItem(
  card: ScryfallCard,
  controller: PlayerId,
  targets: EngineStackItem["targets"] = [],
  xValue?: number
): Omit<EngineStackItem, "id" | "timestamp"> {
  const spellType = extractSpellType(card.type_line);
  const hasXCost =
    (card.mana_cost || "").toUpperCase().includes("{X}") ||
    // Some cards have X in activated/modal costs described in oracle text
    /\{x\}/i.test(card.oracle_text || "");

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
    hasXCost,
    xValue: hasXCost ? xValue : undefined,
    basePower: card.power !== undefined && card.power !== null ? (parseInt(card.power) || 0) : undefined,
    baseToughness: card.toughness !== undefined && card.toughness !== null ? (parseInt(card.toughness) || 0) : undefined,
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

// ─── Activated Ability Parsing ───────────────────────────────────────────────

export interface ActivatedAbilityInfo {
  cost: string; // e.g. "{T}", "{2}{B}, Sacrifice a creature"
  effect: string; // e.g. "Draw a card"
  fullText: string; // The complete line
  requiresTarget: boolean;
  targetDescription?: string;
}

/**
 * Parse activated abilities from oracle text.
 * Activated abilities have the pattern: "Cost: Effect"
 * Excludes keyword abilities, reminder text, and triggered abilities.
 */
export function parseActivatedAbilities(card: ScryfallCard): ActivatedAbilityInfo[] {
  const text = card.oracle_text || "";
  const lines = text.split("\n");
  const abilities: ActivatedAbilityInfo[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip lines that start with trigger words (these are triggered abilities, not activated)
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("when") || lower.startsWith("at the") || lower.startsWith("if ")) continue;

    // Skip pure keyword lines (flying, deathtouch, etc.)
    const knownKeywords = Object.keys(SCRYFALL_KEYWORD_MAP);
    if (knownKeywords.some((kw) => lower === kw || lower === kw + ".")) continue;

    // Skip lines that are just keyword lists like "Flying, vigilance, trample"
    const parts = lower.split(",").map((p) => p.trim().replace(".", ""));
    if (parts.every((p) => knownKeywords.includes(p))) continue;

    // Look for the colon that separates cost from effect
    // Must have a colon that's NOT inside reminder text (parentheses)
    // And NOT a mana ability indicator like "Add {G}" without a meaningful colon
    const colonIdx = findAbilityColon(trimmed);
    if (colonIdx === -1) continue;

    const cost = trimmed.slice(0, colonIdx).trim();
    const effect = trimmed.slice(colonIdx + 1).trim();

    // Validate this looks like an activated ability
    // Cost should contain mana symbols {X}, tap symbol {T}, or words like "Sacrifice", "Pay", "Discard", "Exile", "Remove"
    const costLower = cost.toLowerCase();
    const looksLikeAbility =
      cost.includes("{") ||
      costLower.includes("sacrifice") ||
      costLower.includes("pay") ||
      costLower.includes("discard") ||
      costLower.includes("exile") ||
      costLower.includes("remove") ||
      costLower.includes("tap") ||
      costLower.includes("untap");

    if (!looksLikeAbility) continue;

    // Skip mana abilities (they don't use the stack)
    const effectLower = effect.toLowerCase();
    if (effectLower.startsWith("add {") || effectLower.startsWith("add one mana")) continue;

    // Check if target is required
    const requiresTarget = effectLower.includes("target");
    let targetDescription: string | undefined;
    if (requiresTarget) {
      // Extract target type
      const targetMatch = effectLower.match(/target\s+([\w\s]+?)(?:\.|,|$)/);
      if (targetMatch) {
        targetDescription = "Target " + targetMatch[1].trim();
      } else {
        targetDescription = "Target (see ability text)";
      }
    }

    abilities.push({
      cost,
      effect,
      fullText: trimmed,
      requiresTarget,
      targetDescription,
    });
  }

  return abilities;
}

/**
 * Find the colon that separates cost from effect in an activated ability.
 * Skips colons inside reminder text (parentheses).
 */
function findAbilityColon(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;
    if (text[i] === ":" && depth === 0) return i;
  }
  return -1;
}

/**
 * Convert a parsed activated ability into a stack item.
 */
export function abilityToStackItem(
  card: ScryfallCard,
  ability: ActivatedAbilityInfo,
  controller: PlayerId,
  targets: EngineStackItem["targets"] = [],
  xValue?: number
): Omit<EngineStackItem, "id" | "timestamp"> {
  const hasXCost = ability.cost.toUpperCase().includes("{X}");
  return {
    type: "activated_ability",
    name: `${card.name}: ${ability.cost}`,
    controller,
    targets,
    effect: ability.effect,
    isManaAbility: false,
    hasSplitSecond: false,
    imageUri: card.image_uris?.normal || card.image_uris?.small,
    hasXCost,
    xValue: hasXCost ? xValue : undefined,
  };
}
