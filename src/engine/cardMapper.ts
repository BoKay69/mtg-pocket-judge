import type { ScryfallCard, ScryfallCardFace } from "@/types";
import type {
  Permanent,
  EngineStackItem,
  SpellType,
  PermanentType,
  KeywordAbility,
  PlayerId,
  CardFaceData,
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

function hasStormKeyword(card: ScryfallCard): boolean {
  if (card.keywords.some((k) => k.toLowerCase() === "storm")) return true;
  // Fallback: look for "Storm" as a standalone keyword line in oracle text
  return /(?:^|\n)storm(?:\n|$)/i.test(card.oracle_text || "");
}

// ─── Image URI Helper ────────────────────────────────────────────────────────

function getImageUri(card: ScryfallCard): string | undefined {
  return (
    card.image_uris?.normal ||
    card.image_uris?.small ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.small
  );
}

// ─── DFC / Transform Helpers ─────────────────────────────────────────────────

function extractKeywordsFromOracle(text: string): KeywordAbility[] {
  const keywords: KeywordAbility[] = [];
  const lower = text.toLowerCase();
  for (const [kw, ability] of Object.entries(SCRYFALL_KEYWORD_MAP)) {
    if (lower.includes(kw)) keywords.push(ability);
  }
  return keywords;
}

function buildFaceData(
  face: ScryfallCardFace,
  permanentId: string,
  controller: PlayerId
): CardFaceData {
  const oracleText = face.oracle_text || "";
  const types = extractPermanentTypes(face.type_line);
  const imageUri = face.image_uris?.normal || face.image_uris?.small;
  const basePower = face.power ? (parseInt(face.power) || 0) : undefined;
  const baseToughness = face.toughness ? (parseInt(face.toughness) || 0) : undefined;
  const keywords = extractKeywordsFromOracle(oracleText);
  const triggers = parseTriggersFromOracle(oracleText, permanentId, face.name, controller);
  return { name: face.name, types, oracleText, imageUri, basePower, baseToughness, keywords, triggers };
}

// ─── Main Conversion Functions ───────────────────────────────────────────────

/**
 * Convert a Scryfall card into a Permanent for the battlefield.
 * For double-faced cards, stores both face data and starts on face 0.
 */
export function cardToPermanent(
  card: ScryfallCard,
  controller: PlayerId
): Omit<Permanent, "id"> {
  const permId = "pending"; // Will be replaced with real ID when added to state
  const isDFC = !!(card.card_faces && card.card_faces.length >= 2);
  const frontFace = isDFC ? card.card_faces![0] : null;
  const backFace = isDFC ? card.card_faces![1] : null;

  // For DFC cards use front face oracle text; fall back to card-level oracle_text
  const oracleText = frontFace?.oracle_text || card.oracle_text || "";
  const sourceName = frontFace?.name || card.name;
  const keywords = extractKeywords(card);
  console.log("[CARD_TO_PERM]", sourceName, "oracleText:", JSON.stringify(oracleText?.slice(0, 120)));
  const triggers = parseTriggersFromOracle(oracleText, permId, sourceName, controller);

  // Build two-face data for DFC permanents
  let cardFaces: [CardFaceData, CardFaceData] | undefined;
  let hasDayNightMechanic: boolean | undefined;

  if (isDFC && frontFace && backFace) {
    cardFaces = [
      buildFaceData(frontFace, permId, controller),
      buildFaceData(backFace, permId, controller),
    ];
    hasDayNightMechanic =
      card.keywords.some((k) => k.toLowerCase() === "daybound") ||
      oracleText.toLowerCase().includes("daybound") ||
      (backFace.oracle_text || "").toLowerCase().includes("nightbound") ||
      undefined;
  }

  const typeLine = frontFace?.type_line || card.type_line;
  const powerStr = frontFace?.power ?? card.power;
  const toughnessStr = frontFace?.toughness ?? card.toughness;
  const imageUri =
    frontFace?.image_uris?.normal ||
    frontFace?.image_uris?.small ||
    getImageUri(card);

  return {
    name: sourceName,
    types: extractPermanentTypes(typeLine),
    controller,
    owner: controller,
    basePower: powerStr ? parseInt(powerStr) || 0 : undefined,
    baseToughness: toughnessStr ? parseInt(toughnessStr) || 0 : undefined,
    currentPower: powerStr ? parseInt(powerStr) || 0 : undefined,
    currentToughness: toughnessStr ? parseInt(toughnessStr) || 0 : undefined,
    damageMarked: 0,
    keywords,
    triggers,
    tapped: false,
    summoningSick: true,
    counters: {},
    oracleText,
    imageUri,
    currentFace: isDFC ? 0 : undefined,
    cardFaces,
    hasDayNightMechanic: hasDayNightMechanic || undefined,
  };
}

/**
 * Convert a Scryfall card into a Stack Item for casting.
 * For double-faced permanents, carries face data so the Permanent is complete on resolution.
 */
export function cardToStackItem(
  card: ScryfallCard,
  controller: PlayerId,
  targets: EngineStackItem["targets"] = [],
  xValue?: number
): Omit<EngineStackItem, "id" | "timestamp"> {
  const isDFC = !!(card.card_faces && card.card_faces.length >= 2);
  const frontFace = isDFC ? card.card_faces![0] : null;
  const backFace = isDFC ? card.card_faces![1] : null;

  const typeLine = frontFace?.type_line || card.type_line;
  const spellType = extractSpellType(typeLine);
  const oracleText = frontFace?.oracle_text || card.oracle_text || "";

  const hasXCost =
    (card.mana_cost || "").toUpperCase().includes("{X}") ||
    /\{x\}/i.test(oracleText);

  const hasStorm = hasStormKeyword(card);

  // Carry DFC data for permanents so handlePermanentEnters can use it
  let cardFaces: [CardFaceData, CardFaceData] | undefined;
  let hasDayNightMechanic: boolean | undefined;
  if (isDFC && frontFace && backFace && isPermanentType(typeLine)) {
    cardFaces = [
      buildFaceData(frontFace, "pending", controller),
      buildFaceData(backFace, "pending", controller),
    ];
    hasDayNightMechanic =
      card.keywords.some((k) => k.toLowerCase() === "daybound") || undefined;
  }

  const powerStr = frontFace?.power ?? card.power;
  const toughnessStr = frontFace?.toughness ?? card.toughness;

  return {
    type: "spell",
    spellType,
    name: frontFace?.name || card.name,
    controller,
    targets,
    effect: oracleText || undefined,
    isManaAbility: false,
    hasSplitSecond: hasSplitSecond(card),
    imageUri: getImageUri(card),
    hasXCost,
    xValue: hasXCost ? xValue : undefined,
    basePower: powerStr !== undefined && powerStr !== null ? (parseInt(powerStr) || 0) : undefined,
    baseToughness: toughnessStr !== undefined && toughnessStr !== null ? (parseInt(toughnessStr) || 0) : undefined,
    hasStorm: hasStorm || undefined,
    cardFaces,
    hasDayNightMechanic,
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
    // Cost should contain mana symbols {X}, tap symbol {T}, words like "Sacrifice"/"Pay"/"Discard",
    // or a planeswalker loyalty cost: +N, -N, −N (Unicode minus U+2212), 0, +X, -X
    const costLower = cost.toLowerCase();
    const isLoyaltyAbility = /^[+\-−]\d+$|^0$|^[+\-−]x$/i.test(cost.trim());
    const looksLikeAbility =
      isLoyaltyAbility ||
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
    imageUri: getImageUri(card),
    hasXCost,
    xValue: hasXCost ? xValue : undefined,
  };
}
