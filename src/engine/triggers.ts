import type {
  GameEvent,
  GameState,
  TriggerDefinition,
  Permanent,
  PlayerId,
  LogEntry,
} from "./types";
import { generateId } from "./utils";

// ─── Trigger Detection ──────────────────────────────────────────────────────

/**
 * Given a game event, scan all permanents on the battlefield
 * and return any triggers that match, in APNAP order.
 */
export function detectTriggers(
  state: GameState,
  event: GameEvent
): TriggerDefinition[] {
  const matched: TriggerDefinition[] = [];

  for (const permanent of state.battlefield) {
    for (const trigger of permanent.triggers) {
      if (triggerMatchesEvent(trigger, event, permanent, state)) {
        matched.push(trigger);
      }
    }
  }

  return apnapSort(matched, state.activePlayer);
}

/**
 * Check if a specific trigger matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent,
  state: GameState
): boolean {
  // Must match event type exactly
  if (trigger.event !== event.type) return false;

  // Dies/LTB triggers fire even if source just left the battlefield
  if (trigger.event === "dies" || trigger.event === "leaves_battlefield") {
    return true;
  }

  // All other triggers require the source to still be on the battlefield
  if (!state.battlefield.some((p) => p.id === source.id)) return false;

  // Run condition-specific checks
  switch (trigger.event) {
    case "enters_battlefield":
      return checkETBCondition(trigger, event);
    case "cast_spell":
      return checkCastCondition(trigger, event, source, state);
    case "deals_damage":
      return event.sourceId === source.id || !trigger.condition;
    case "life_gained":
    case "life_lost":
      return event.sourceController === source.controller;
    case "attacks":
    case "blocks":
      return event.sourceId === source.id || !trigger.condition;
    case "beginning_of_phase":
    case "end_of_phase":
      return checkPhaseCondition(trigger, event, source);
    case "draw_card":
      return checkDrawCondition(trigger, event, source);
    default:
      return false;
  }
}

// ─── Condition Checkers ──────────────────────────────────────────────────────

function checkETBCondition(
  trigger: TriggerDefinition,
  event: GameEvent
): boolean {
  return true; // All ETB triggers fire when the event type matches
}

function checkCastCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent,
  state: GameState
): boolean {
  if (!trigger.condition) return true;
  const cond = trigger.condition.toLowerCase();

  // "Whenever an opponent casts a spell" — must be a different player
  if (cond.includes("opponent")) {
    if (event.sourceController === source.controller) return false;
  }

  // "Whenever you cast" — must be the controller
  if (cond.includes("you cast")) {
    if (event.sourceController !== source.controller) return false;
  }

  // Check spell type restrictions
  const spellType = (event.data?.spellType as string)?.toLowerCase() || "";
  if (cond.includes("instant or sorcery") || cond.includes("noncreature")) {
    if (spellType !== "instant" && spellType !== "sorcery") return false;
  } else if (cond.includes("creature spell")) {
    if (spellType !== "creature") return false;
  }

  return true;
}

function checkPhaseCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (trigger.condition?.toLowerCase().includes("your")) {
    return event.sourceController === source.controller;
  }
  return true;
}

function checkDrawCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  const cond = (trigger.condition || "").toLowerCase();

  // "Whenever an opponent draws" — must be opponent
  if (cond.includes("opponent")) {
    return event.sourceController !== source.controller;
  }
  // "Whenever you draw" — must be controller
  if (cond.includes("you draw")) {
    return event.sourceController === source.controller;
  }
  return true;
}

// ─── APNAP Sorting ──────────────────────────────────────────────────────────

function apnapSort(
  triggers: TriggerDefinition[],
  activePlayer: PlayerId
): TriggerDefinition[] {
  const active = triggers.filter((t) => t.controller === activePlayer);
  const nonActive = triggers.filter((t) => t.controller !== activePlayer);
  return [...active, ...nonActive];
}

// ─── Oracle Text Parsing ─────────────────────────────────────────────────────

/**
 * Parse oracle text to extract trigger definitions.
 * 
 * CRITICAL: Only check for trigger keywords in the CONDITION part of the text
 * (before the first comma), NOT in the effect. This prevents false matches like
 * Rhystic Study ("whenever an opponent casts a spell, you may DRAW a card")
 * incorrectly creating a draw_card trigger.
 */
export function parseTriggersFromOracle(
  oracleText: string,
  permanentId: string,
  permanentName: string,
  controller: PlayerId
): TriggerDefinition[] {
  const triggers: TriggerDefinition[] = [];
  const lines = oracleText.split("\n");

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Must start with a trigger word
    if (!lower.startsWith("when") && !lower.startsWith("at the")) continue;

    // Split into condition (before comma) and effect (after comma)
    const commaIdx = line.indexOf(",");
    const conditionPart = commaIdx !== -1
      ? lower.slice(0, commaIdx)
      : lower;
    const effectPart = commaIdx !== -1
      ? line.slice(commaIdx + 1).trim()
      : line;

    // Now match based on what's in the CONDITION part only

    // ETB: "When ~ enters the battlefield" / "Whenever a creature enters"
    if (conditionPart.includes("enters the battlefield") || conditionPart.includes("enters under")) {
      triggers.push({
        id: generateId(),
        event: "enters_battlefield",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue; // Only one trigger per line
    }

    // Dies: "When ~ dies" / "Whenever a creature dies"
    if (conditionPart.includes("dies")) {
      triggers.push({
        id: generateId(),
        event: "dies",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Deals damage: "Whenever ~ deals damage" / "Whenever ~ deals combat damage"
    if (conditionPart.includes("deals") && conditionPart.includes("damage")) {
      triggers.push({
        id: generateId(),
        event: "deals_damage",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Beginning of phase: "At the beginning of your upkeep"
    if (conditionPart.includes("at the beginning of")) {
      triggers.push({
        id: generateId(),
        event: "beginning_of_phase",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Cast spell: "Whenever an opponent casts a spell" / "Whenever you cast"
    if (conditionPart.includes("cast")) {
      triggers.push({
        id: generateId(),
        event: "cast_spell",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Draw card: "Whenever an opponent draws a card" / "Whenever you draw"
    if (conditionPart.includes("draw")) {
      triggers.push({
        id: generateId(),
        event: "draw_card",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Gain life: "Whenever you gain life"
    if (conditionPart.includes("gain") && conditionPart.includes("life")) {
      triggers.push({
        id: generateId(),
        event: "life_gained",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }

    // Attacks: "Whenever ~ attacks"
    if (conditionPart.includes("attacks")) {
      triggers.push({
        id: generateId(),
        event: "attacks",
        condition: conditionPart.trim(),
        effect: effectPart,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
      continue;
    }
  }

  return triggers;
}

// ─── Log Entry Helper ────────────────────────────────────────────────────────

export function createTriggerLogEntry(
  trigger: TriggerDefinition,
  event: GameEvent,
  stepCount: number
): LogEntry {
  return {
    id: generateId(),
    timestamp: stepCount,
    type: "trigger",
    player: trigger.controller,
    text: `${trigger.sourceName}'s trigger fires`,
    detail: `${trigger.condition || "Triggered"}: ${trigger.effect}`,
    highlight: true,
  };
}
