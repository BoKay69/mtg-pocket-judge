import type {
  GameEvent,
  GameState,
  TriggerDefinition,
  Permanent,
  PlayerId,
  TriggerEvent,
  LogEntry,
} from "./types";
import { generateId } from "./utils";

// ─── Trigger Pattern Matching ────────────────────────────────────────────────

/**
 * Given a game event, scan all permanents on the battlefield
 * and return any triggers that match, in APNAP order.
 */
export function detectTriggers(
  state: GameState,
  event: GameEvent
): TriggerDefinition[] {
  const matched: TriggerDefinition[] = [];

  console.log("[DETECT TRIGGERS] Event:", event.type, "| Permanents on battlefield:", state.battlefield.length);

  for (const permanent of state.battlefield) {
    console.log("[DETECT TRIGGERS] Checking", permanent.name, "| triggers:", permanent.triggers.length, permanent.triggers.map(t => t.event));
    for (const trigger of permanent.triggers) {
      const matches = triggerMatchesEvent(trigger, event, permanent, state);
      console.log("[DETECT TRIGGERS]  ->", trigger.event, "vs", event.type, "| condition:", trigger.condition, "| matches:", matches);
      if (matches) {
        matched.push(trigger);
      }
    }
  }

  // APNAP ordering: active player's triggers go on stack first
  // (which means they resolve LAST — non-active player's triggers resolve first)
  return apnapSort(matched, state.activePlayer);
}

/**
 * Check if a specific trigger definition matches a game event.
 */
function triggerMatchesEvent(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent,
  state: GameState
): boolean {
  // Basic event type match
  if (trigger.event !== event.type) return false;

  // Source must still be on the battlefield (or just left for LTB/dies triggers)
  if (trigger.event === "dies" || trigger.event === "leaves_battlefield") {
    // Dies/LTB triggers can fire even if the source itself died
    // (e.g., Blood Artist sees its own death)
    return true;
  }

  // For other triggers, source must be on the battlefield
  const sourceOnBattlefield = state.battlefield.some(
    (p) => p.id === source.id
  );
  if (!sourceOnBattlefield) return false;

  // Check conditions based on trigger type
  switch (trigger.event) {
    case "enters_battlefield":
      return checkETBCondition(trigger, event);
    case "cast_spell":
      return checkCastCondition(trigger, event, source, state);
    case "deals_damage":
      return checkDamageCondition(trigger, event, source);
    case "life_gained":
    case "life_lost":
      return checkLifeCondition(trigger, event, source);
    case "attacks":
    case "blocks":
      return checkCombatCondition(trigger, event, source);
    case "beginning_of_phase":
    case "end_of_phase":
      return checkPhaseCondition(trigger, event, source);
    case "draw_card":
      return checkDrawCondition(trigger, event, source);
    case "dies":
    case "leaves_battlefield":
      return true; // Already checked source above
    default:
      return false; // Unknown event type — don't trigger
  }
}

// ─── Condition Checkers ──────────────────────────────────────────────────────

function checkETBCondition(
  trigger: TriggerDefinition,
  event: GameEvent
): boolean {
  // "Whenever a creature enters the battlefield" — check if entering permanent is a creature
  // "Whenever ~ enters the battlefield" — check if it's the source entering
  if (trigger.condition) {
    const cond = trigger.condition.toLowerCase();
    if (cond.includes("a creature") || cond.includes("another creature")) {
      // The entering thing should be a creature
      return event.data?.type === "creature" || true; // Simplified for MVP
    }
  }
  return true;
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
  if (cond.includes("you cast") || cond.includes("whenever you cast")) {
    if (event.sourceController !== source.controller) return false;
  }

  // Check spell type restrictions: "whenever a player casts an instant or sorcery"
  if (cond.includes("instant") || cond.includes("sorcery")) {
    const spellType = (event.data?.spellType as string)?.toLowerCase() || "";
    if (cond.includes("instant or sorcery") || cond.includes("instant and sorcery")) {
      if (spellType !== "instant" && spellType !== "sorcery") return false;
    } else if (cond.includes("instant") && !cond.includes("sorcery")) {
      if (spellType !== "instant") return false;
    } else if (cond.includes("sorcery") && !cond.includes("instant")) {
      if (spellType !== "sorcery") return false;
    }
  }

  // "Whenever a player casts a creature spell"
  if (cond.includes("creature spell")) {
    const spellType = (event.data?.spellType as string)?.toLowerCase() || "";
    if (spellType !== "creature") return false;
  }

  return true;
}

function checkDamageCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  // "Whenever ~ deals damage" — source must be the one dealing damage
  if (
    trigger.condition?.toLowerCase().includes("this creature") ||
    !trigger.condition
  ) {
    return event.sourceId === source.id;
  }
  return true;
}

function checkLifeCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  // "Whenever you gain life" — controller must be the one gaining
  return event.sourceController === source.controller;
}

function checkDrawCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  const cond = (trigger.condition || "").toLowerCase();

  // "Whenever an opponent draws a card" — must be opponent drawing
  if (cond.includes("opponent")) {
    return event.sourceController !== source.controller;
  }
  // "Whenever you draw a card" — must be controller
  if (cond.includes("you draw")) {
    return event.sourceController === source.controller;
  }
  // "Whenever a player draws a card" — anyone
  return true;
}

function checkCombatCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  // "Whenever ~ attacks" — source must be the attacker
  if (!trigger.condition || trigger.condition.includes("this")) {
    return event.sourceId === source.id;
  }
  // "Whenever a creature attacks" — any creature
  return true;
}

function checkPhaseCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  // "At the beginning of your upkeep" — must be controller's turn
  if (trigger.condition?.toLowerCase().includes("your")) {
    return event.sourceController === source.controller;
  }
  return true;
}

// ─── APNAP Sorting ──────────────────────────────────────────────────────────

/**
 * Sort triggers in Active Player, Non-Active Player order.
 * Active player's triggers go on the stack FIRST (bottom),
 * so they resolve LAST. Non-active player's resolve first.
 */
function apnapSort(
  triggers: TriggerDefinition[],
  activePlayer: PlayerId
): TriggerDefinition[] {
  const active = triggers.filter((t) => t.controller === activePlayer);
  const nonActive = triggers.filter((t) => t.controller !== activePlayer);

  // Active player's triggers first (bottom of stack), then non-active (top)
  return [...active, ...nonActive];
}

// ─── Oracle Text Parsing ─────────────────────────────────────────────────────

/**
 * Parse oracle text from Scryfall to extract trigger definitions.
 * This handles the most common trigger patterns.
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

    // "When ~ enters the battlefield" / "Whenever ~ enters"
    if (
      lower.includes("enters the battlefield") &&
      (lower.startsWith("when") || lower.includes("whenever"))
    ) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "enters_battlefield",
        condition: extractCondition(line, "enters the battlefield"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "When ~ dies" / "Whenever a creature dies"
    if (
      lower.includes("dies") &&
      (lower.startsWith("when") || lower.includes("whenever"))
    ) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "dies",
        condition: extractCondition(line, "dies"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "Whenever ~ deals damage" / "Whenever ~ deals combat damage"
    if (
      lower.includes("deals") &&
      lower.includes("damage") &&
      lower.includes("whenever")
    ) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "deals_damage",
        condition: extractCondition(line, "deals"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "At the beginning of your upkeep/end step"
    if (lower.includes("at the beginning of")) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "beginning_of_phase",
        condition: line.split(",")[0].trim(),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "Whenever you gain life"
    if (lower.includes("whenever") && lower.includes("gain") && lower.includes("life")) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "life_gained",
        condition: extractCondition(line, "gain"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "Whenever you cast" / "Whenever a player casts"
    if (lower.includes("whenever") && lower.includes("cast")) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "cast_spell",
        condition: extractCondition(line, "cast"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "Whenever ~ attacks"
    if (lower.includes("whenever") && lower.includes("attacks")) {
      const effect = extractEffect(line);
      triggers.push({
        id: generateId(),
        event: "attacks",
        condition: extractCondition(line, "attacks"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }

    // "Whenever an opponent draws a card" / "Whenever a player draws"
    if (lower.includes("whenever") && lower.includes("draw")) {
      const effect = extractEffect(line);
      console.log("[TRIGGER PARSER] Found draw trigger on", permanentName, ":", line);
      triggers.push({
        id: generateId(),
        event: "draw_card",
        condition: extractCondition(line, "draw"),
        effect,
        sourceId: permanentId,
        sourceName: permanentName,
        controller,
      });
    }
  }

  return triggers;
}

// ─── Text Extraction Helpers ─────────────────────────────────────────────────

function extractEffect(line: string): string {
  // Effect typically comes after the comma or after the trigger condition
  const commaIdx = line.indexOf(",");
  if (commaIdx !== -1) {
    return line.slice(commaIdx + 1).trim();
  }
  return line;
}

function extractCondition(line: string, keyword: string): string {
  const idx = line.toLowerCase().indexOf(keyword);
  if (idx === -1) return "";
  // Grab everything from start of trigger word to the keyword
  const start = line.toLowerCase().indexOf("when");
  if (start === -1) return "";
  return line.slice(start, idx + keyword.length).trim();
}

// ─── Generate Log Entry for Trigger ──────────────────────────────────────────

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
