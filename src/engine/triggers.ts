import type {
  GameEvent,
  GameState,
  TriggerDefinition,
  TriggerEvent,
  Permanent,
  PlayerId,
  LogEntry,
} from "./types";
import { generateId } from "./utils";

// ─── Trigger Detection ──────────────────────────────────────────────────────

export function detectTriggers(
  state: GameState,
  event: GameEvent
): TriggerDefinition[] {
  const matched: TriggerDefinition[] = [];
  // Doubling-effect triggers are collected separately so they are always appended
  // AFTER all normal triggers. placeTriggers pushes them in array order onto the stack,
  // so the last element ends up on top (LIFO). Doubling triggers must resolve FIRST
  // (before Chatterfang-style triggers) so the xValue update runs before CF resolves.
  const doublingTriggers: TriggerDefinition[] = [];

  for (const permanent of state.battlefield) {
    if (event.type === "tokens_created") {
      console.log(`[DETECT_TRIGGERS_SCAN] permanent="${permanent.name}" triggerCount=${permanent.triggers.length} triggers=[${permanent.triggers.map(t => t.event + ":\"" + t.condition + "\"").join(", ")}]`);
    }
    for (const trigger of permanent.triggers) {
      if (triggerMatchesEvent(trigger, event, permanent, state)) {
        matched.push(trigger);
      }
    }

  }

  // doublingTriggers is always empty now — Doubling Season is handled inline in
  // resolveTopOfStack as a replacement effect, not as a stack trigger.
  if (event.type === "tokens_created") {
    console.log(`[DETECT_TRIGGERS] tokens_created event from "${event.sourceName}" count=${event.data?.count} fromDS=${event.data?.fromDoublingSeason} fromCF=${event.data?.fromChatterfang}`);
    console.log(`[DETECT_TRIGGERS] matched normal triggers: [${matched.map(t => t.sourceName + "(" + t.event + ")").join(", ")}]`);
    console.log(`[DETECT_TRIGGERS] matched doubling triggers: [${doublingTriggers.map(t => t.sourceName + "(isDoubling=" + t.isDoublingEffect + ")").join(", ")}]`);
  }
  return apnapSort([...matched, ...doublingTriggers], state.activePlayer);
}

function triggerMatchesEvent(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent,
  state: GameState
): boolean {
  if (trigger.event !== event.type) return false;

  // Dies / LTB / tokens_created triggers fire regardless of whether source is still on battlefield
  if (
    trigger.event === "dies" ||
    trigger.event === "leaves_battlefield" ||
    trigger.event === "tokens_created"
  ) {
    if (trigger.event === "tokens_created") {
      // Source must still be on battlefield to trigger token creation effects
      if (!state.battlefield.some((p) => p.id === source.id)) return false;
      return checkTokensCreatedCondition(trigger, event, source);
    }
    return checkDiesOrLeavesCondition(trigger, event, source);
  }

  // All other triggers require the source to still be on the battlefield
  if (!state.battlefield.some((p) => p.id === source.id)) return false;

  switch (trigger.event) {
    case "enters_battlefield":
      return checkETBCondition(trigger, event, source);
    case "cast_spell":
      return checkCastCondition(trigger, event, source, state);
    case "deals_damage":
      return checkDealsDamageCondition(trigger, event, source);
    case "dealt_damage":
      return checkDealtDamageCondition(trigger, event, source);
    case "attacks":
      return checkAttacksCondition(trigger, event, source);
    case "blocks":
      return checkBlocksCondition(trigger, event, source);
    case "beginning_of_phase":
    case "end_of_phase":
      return checkPhaseCondition(trigger, event, source);
    case "draw_card":
      return checkDrawCondition(trigger, event, source);
    case "discard":
      return checkDiscardCondition(trigger, event, source);
    case "life_gained":
      return checkLifeCondition(trigger, event, source, "gained");
    case "life_lost":
      return checkLifeCondition(trigger, event, source, "lost");
    case "counter_added":
      return true; // Simple: fire for any counter placement
    case "tapped":
    case "untapped":
      return event.sourceId === source.id || !trigger.condition;
    case "targeted":
      return event.targetId === source.id || !trigger.condition;
    default:
      return true;
  }
}

// ─── Condition Checkers ──────────────────────────────────────────────────────

function checkETBCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return true;
  const cond = trigger.condition.toLowerCase();
  const sourceNameLower = source.name.toLowerCase();
  const eventType = ((event.data?.type as string) || "").toLowerCase();
  const eventController = event.sourceController;

  // Self-referential: condition names the permanent or uses "this"
  const isSelfReferential =
    cond.includes(sourceNameLower) ||
    /\bthis (creature|permanent|artifact|enchantment|planeswalker)\b/.test(cond) ||
    cond.includes("it enters");

  if (isSelfReferential) {
    return event.sourceId === source.id;
  }

  // Type filters
  if (cond.includes("creature") && !eventType.includes("creature")) return false;
  if (cond.includes("artifact") && !cond.includes("creature") && !eventType.includes("artifact")) return false;
  if (cond.includes("enchantment") && !cond.includes("creature") && !eventType.includes("enchantment")) return false;
  if (cond.includes("land") && !cond.includes("creature") && !eventType.includes("land")) return false;
  if (cond.includes("planeswalker") && !cond.includes("creature") && !eventType.includes("planeswalker")) return false;

  // Token vs non-token
  if (cond.includes("nontoken")) {
    if (event.data?.isToken) return false;
  }

  // "Another" — exclude the source itself
  if (cond.includes("another")) {
    if (event.sourceId === source.id) return false;
  }

  // Controller filters
  if (cond.includes("you control") || cond.includes("under your control")) {
    return eventController === source.controller;
  }
  if (cond.includes("opponent controls") || cond.includes("opponent puts") || cond.includes("opponent's")) {
    return eventController !== source.controller && eventController !== undefined;
  }
  if (cond.includes("an opponent")) {
    return eventController !== source.controller && eventController !== undefined;
  }

  return true;
}

function checkDiesOrLeavesCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return true;
  const cond = trigger.condition.toLowerCase();

  // Self-referential
  if (
    cond.includes(source.name.toLowerCase()) ||
    /\bthis (creature|permanent)\b/.test(cond)
  ) {
    return event.sourceId === source.id;
  }

  // Controller filter
  if (cond.includes("you control") || cond.includes("under your control")) {
    return event.sourceController === source.controller;
  }
  if (cond.includes("opponent")) {
    return event.sourceController !== source.controller;
  }

  // Type filter — "whenever a creature dies"
  // We don't have the dying permanent's type at this point (it's gone from battlefield)
  // Best we can do is trust the event type mapping

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
  const spellType = ((event.data?.spellType as string) || "").toLowerCase();
  const xValue = event.data?.xValue as number | undefined;

  // Who cast it
  const casterIsController = event.sourceController === source.controller;
  const casterIsOpponent = event.sourceController !== source.controller;

  if (cond.includes("opponent casts") || cond.includes("an opponent casts")) {
    if (!casterIsOpponent) return false;
  } else if (cond.includes("you cast")) {
    if (!casterIsController) return false;
  } else if (cond.includes("a player casts")) {
    // Any player — always passes
  }
  // No "you/opponent" qualifier → any player

  // Spell type filters
  // "instant or sorcery" — only non-permanent spells
  if (cond.includes("instant or sorcery")) {
    if (spellType !== "instant" && spellType !== "sorcery") return false;
  // "noncreature" / "non-creature" — any spell type except creature
  // (includes instants, sorceries, artifacts, enchantments, planeswalkers)
  } else if (cond.includes("noncreature") || cond.includes("non-creature")) {
    if (spellType === "creature") return false;
  // "creature spell" or "a creature" (without "spell") — only creatures
  } else if (cond.includes("creature spell") || cond.includes("a creature")) {
    if (spellType !== "creature") return false;
  } else if (cond.includes("instant spell") && !cond.includes("sorcery")) {
    if (spellType !== "instant") return false;
  } else if (cond.includes("sorcery spell") && !cond.includes("instant")) {
    if (spellType !== "sorcery") return false;
  } else if (cond.includes("artifact spell")) {
    if (spellType !== "artifact") return false;
  } else if (cond.includes("enchantment spell")) {
    if (spellType !== "enchantment") return false;
  } else if (cond.includes("planeswalker spell")) {
    if (spellType !== "planeswalker") return false;
  }
  // No type qualifier (e.g. "whenever an opponent casts a spell") — any spell type passes,
  // including creatures, since creatures ARE spells on the stack.

  // X cost filter
  if (cond.includes("with {x}") || cond.includes("with x in its mana cost")) {
    if (!xValue && xValue !== 0) return false;
  }

  // CMC/mana value filters (basic support)
  const cmc3Match = cond.match(/mana value (\d+) or less/);
  if (cmc3Match) {
    // We don't track CMC in events currently — pass through
  }

  return true;
}

function checkDealsDamageCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return event.sourceId === source.id;
  const cond = trigger.condition.toLowerCase();

  // Self-trigger: "whenever ~ deals damage"
  if (
    cond.includes(source.name.toLowerCase()) ||
    /\bthis (creature|permanent)\b/.test(cond)
  ) {
    return event.sourceId === source.id;
  }

  // Controller-based: "whenever a source you control deals damage"
  if (cond.includes("you control") || cond.includes("source you control")) {
    return event.sourceController === source.controller;
  }

  // Combat damage specifically — allow all
  if (cond.includes("combat damage")) {
    return true;
  }

  // General damage events
  return event.sourceId === source.id || !trigger.condition;
}

function checkDealtDamageCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return true;
  const cond = trigger.condition.toLowerCase();

  // "Whenever ~ is dealt damage"
  if (
    cond.includes(source.name.toLowerCase()) ||
    /\bthis (creature|permanent)\b/.test(cond)
  ) {
    return event.targetId === source.id;
  }

  return true;
}

function checkAttacksCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return event.sourceId === source.id;
  const cond = trigger.condition.toLowerCase();

  // Self: "whenever ~ attacks"
  if (
    cond.includes(source.name.toLowerCase()) ||
    /\bthis (creature|permanent)\b/.test(cond) ||
    cond === "whenever this creature attacks"
  ) {
    return event.sourceId === source.id;
  }

  // Controller filter: "whenever a creature you control attacks"
  if (cond.includes("you control")) {
    return event.sourceController === source.controller;
  }

  // Opponent filter: "whenever a creature an opponent controls attacks"
  if (cond.includes("opponent")) {
    return event.sourceController !== source.controller;
  }

  // General: "whenever a creature attacks"
  return true;
}

function checkBlocksCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return event.sourceId === source.id;
  const cond = trigger.condition.toLowerCase();

  if (
    cond.includes(source.name.toLowerCase()) ||
    /\bthis (creature|permanent)\b/.test(cond)
  ) {
    return event.sourceId === source.id;
  }

  if (cond.includes("you control")) {
    return event.sourceController === source.controller;
  }

  return true;
}

function checkPhaseCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) return true;
  const cond = trigger.condition.toLowerCase();
  const step = ((event.data?.step as string) || "").toLowerCase();

  // Step-specific filters
  if (cond.includes("upkeep") && !step.includes("upkeep")) return false;
  if (cond.includes("draw step") && !step.includes("draw")) return false;
  if (cond.includes("end step") && !step.includes("end_step") && !step.includes("end step")) return false;
  if (cond.includes("combat") && !step.includes("combat")) return false;
  if (cond.includes("main phase") && !step.includes("main")) return false;
  if (cond.includes("cleanup") && !step.includes("cleanup")) return false;

  // Controller filter
  if (cond.includes("your upkeep") || cond.includes("your draw") || cond.includes("your end step") || cond.includes("your combat")) {
    return event.sourceController === source.controller;
  }
  if (cond.includes("each player")) {
    return true; // Fires for all players
  }
  if (cond.includes("each opponent")) {
    return event.sourceController !== source.controller;
  }
  // "your" without step name
  if (/\byour\b/.test(cond) && !cond.includes("each")) {
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

  // ── Controller check ─────────────────────────────────────────────────────
  let controllerPasses = true;
  if (cond.includes("opponent") || cond.includes("an opponent draws")) {
    controllerPasses = event.sourceController !== source.controller;
  } else if (cond.includes("you draw") || cond.includes("when you draw") || cond.includes("whenever you draw")) {
    controllerPasses = event.sourceController === source.controller;
  } else if (cond.includes("each player") || cond.includes("a player draws")) {
    controllerPasses = true;
  }

  if (!controllerPasses) return false;

  const ordinalMap: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  };

  // ── "except the first" — fires for ALL draws EXCEPT the Nth draw of the draw step ──
  // e.g. Orcish Bowmasters: "except the first one they draw in each of their draw steps"
  const exceptMatch = cond.match(/except\s+the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)/i);
  if (exceptMatch) {
    const exceptN = ordinalMap[exceptMatch[1].toLowerCase()];
    const isDrawStep = event.data?.isDrawStep as boolean | undefined;
    const totalDrawn = (event.data?.totalDrawnThisTurn as number | undefined) ?? 0;
    if (cond.includes("draw step")) {
      // Only suppress the Nth card drawn during the actual draw step; all other draws trigger
      return !(isDrawStep && totalDrawn === exceptN);
    }
    // Generic "except the Nth draw this turn"
    return totalDrawn !== exceptN;
  }

  // ── Nth-card-this-turn check (e.g. "whenever you draw your third card each turn") ──
  const ordinalMatch = cond.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (ordinalMatch) {
    const requiredN = ordinalMap[ordinalMatch[1]];
    const totalDrawn = (event.data?.totalDrawnThisTurn as number | undefined) ?? 0;
    return totalDrawn === requiredN;
  }

  return true;
}

function checkDiscardCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  const cond = (trigger.condition || "").toLowerCase();

  if (cond.includes("you discard")) {
    return event.sourceController === source.controller;
  }
  if (cond.includes("opponent discards") || cond.includes("an opponent discards")) {
    return event.sourceController !== source.controller;
  }
  return true;
}

function checkLifeCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent,
  direction: "gained" | "lost"
): boolean {
  const cond = (trigger.condition || "").toLowerCase();

  // Verify it's the right direction
  if (direction === "gained" && (cond.includes("lose life") || cond.includes("loses life"))) return false;
  if (direction === "lost" && (cond.includes("gain life") || cond.includes("gains life"))) return false;

  if (cond.includes("you gain") || cond.includes("whenever you gain")) {
    return event.sourceController === source.controller;
  }
  if (cond.includes("opponent gains") || cond.includes("an opponent gains")) {
    return event.sourceController !== source.controller;
  }
  if (cond.includes("a player gains") || cond.includes("each player")) {
    return true;
  }

  return event.sourceController === source.controller;
}

function checkTokensCreatedCondition(
  trigger: TriggerDefinition,
  event: GameEvent,
  source: Permanent
): boolean {
  if (!trigger.condition) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" condition=null → true`);
    return true;
  }
  const cond = trigger.condition.toLowerCase();

  // Chatterfang-style triggers must not fire on tokens created by:
  //   • Doubling Season (would re-trigger CF on DS's extra tokens — use xValue update instead)
  //   • Another Chatterfang trigger (prevents exponential CF loops)
  if (event.data?.fromDoublingSeason || event.data?.fromChatterfang) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" blocked: fromDS=${event.data?.fromDoublingSeason} fromCF=${event.data?.fromChatterfang} → false`);
    return false;
  }

  // Controller filter
  if (cond.includes("you create") || cond.includes("tokens you create") || cond.includes("under your control")) {
    const result = event.sourceController === source.controller;
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" controller check: eventCtrl=${event.sourceController} sourceCtrl=${source.controller} → ${result}`);
    return result;
  }
  if (cond.includes("opponent creates") || cond.includes("an opponent creates")) {
    const result = event.sourceController !== source.controller;
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" opponent check → ${result}`);
    return result;
  }

  // Token type filter (e.g., "whenever a creature token enters")
  const tokenType = ((event.data?.tokenType as string) || "").toLowerCase();
  if (cond.includes("creature token") && !tokenType.includes("creature")) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" creature token filter → false`);
    return false;
  }
  if (cond.includes("treasure") && !tokenType.includes("treasure")) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" treasure filter → false`);
    return false;
  }
  if (cond.includes("food") && !tokenType.includes("food")) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" food filter → false`);
    return false;
  }
  if (cond.includes("clue") && !tokenType.includes("clue")) {
    console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" clue filter → false`);
    return false;
  }

  console.log(`[CHECK_TOKENS_COND] source="${source.name}" cond="${cond}" → true (fallthrough)`);
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
 * Parse oracle text to extract ALL trigger definitions.
 * Handles any "When/Whenever/At" line — not just pre-defined patterns.
 * CRITICAL: Only match trigger event type from the CONDITION part (before first comma).
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
    const trimmed = line.trim();
    console.log("[PARSE_ORACLE_LINE]", permanentName, "line:", JSON.stringify(trimmed), "lower:", JSON.stringify(trimmed.toLowerCase()));
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    // Resolve the actual trigger text — handles both plain trigger lines and
    // keyword-ability format: "Landfall — Whenever ...", "Constellation — When ..."
    let triggerText = trimmed;
    let triggerLower = lower;

    if (!lower.startsWith("when") && !lower.startsWith("at the") && !lower.startsWith("at end of")) {
      // Look for em-dash separator used in keyword abilities (e.g. "Landfall — Whenever")
      const emDashIdx = trimmed.indexOf("—");
      if (emDashIdx !== -1) {
        const afterDash = trimmed.slice(emDashIdx + 1).trim();
        const afterDashLower = afterDash.toLowerCase();
        if (
          afterDashLower.startsWith("when") ||
          afterDashLower.startsWith("at the") ||
          afterDashLower.startsWith("at end of")
        ) {
          triggerText = afterDash;
          triggerLower = afterDashLower;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }

    // Split into condition (before first comma) and effect (after)
    const commaIdx = triggerText.indexOf(",");
    const conditionPart = commaIdx !== -1 ? triggerLower.slice(0, commaIdx) : triggerLower;
    const effectPart = commaIdx !== -1 ? triggerText.slice(commaIdx + 1).trim() : triggerText;

    const event = classifyTriggerEvent(conditionPart);
    console.log("[PARSE_ORACLE_CLASSIFY]", permanentName, "conditionPart:", JSON.stringify(conditionPart), "event:", event);
    if (!event) continue;

    // Detect "and whenever/when <secondaryCondition>, <sharedEffect>" pattern
    // e.g. Orcish Bowmasters: "When X enters the battlefield, and whenever an opponent draws a card, effect"
    const andWhenMatch = effectPart.match(/^and\s+(when(?:ever)?\s+.+?),\s*(.+)/i);
    let primaryEffect = effectPart;
    if (andWhenMatch) {
      const secondaryCondRaw = andWhenMatch[1].trim();
      const sharedEffect = andWhenMatch[2].trim();
      // Primary trigger gets just the shared effect
      primaryEffect = sharedEffect;
      // Create secondary trigger for the "and whenever" part
      const secondaryEvent = classifyTriggerEvent(secondaryCondRaw.toLowerCase());
      if (secondaryEvent) {
        triggers.push({
          id: generateId(),
          event: secondaryEvent,
          condition: secondaryCondRaw,
          effect: sharedEffect,
          sourceId: permanentId,
          sourceName: permanentName,
          controller,
        });
      }
    }

    const newTrigger = {
      id: generateId(),
      event,
      condition: conditionPart.trim(),
      effect: primaryEffect,
      sourceId: permanentId,
      sourceName: permanentName,
      controller,
    };
    console.log(`[PARSE_ORACLE] source="${permanentName}" event=${newTrigger.event} condition="${newTrigger.condition}" effect="${newTrigger.effect}"`);
    triggers.push(newTrigger);
  }

  return triggers;
}

/**
 * Given the condition part of a trigger line (before first comma),
 * return the TriggerEvent type it corresponds to.
 * Returns null if unrecognized.
 */
function classifyTriggerEvent(conditionPart: string): TriggerEvent | null {
  const c = conditionPart.toLowerCase();

  // ── Order matters: check more specific patterns first ──

  // TOKENS CREATED — must check before "enters_battlefield" since tokens enter the battlefield
  console.log("[CLASSIFY_CHECK_TOKENS]", "c:", JSON.stringify(c), "hasToken:", c.includes("token"), "hasCreat:", c.includes("creat"));
  if (
    (c.includes("token") && (c.includes("creat") || c.includes("put"))) ||
    c.includes("one or more tokens are created") ||
    c.includes("one or more tokens enter") ||
    c.includes("a token is created") ||
    c.includes("a token enters")
  ) {
    return "tokens_created";
  }

  // DIES — check before leaves_battlefield (dies is a subset)
  if (
    c.includes("dies") ||
    (c.includes("is put into") && c.includes("graveyard")) ||
    (c.includes("goes to") && c.includes("graveyard")) ||
    (c.includes("put into") && c.includes("graveyard") && c.includes("from the battlefield"))
  ) {
    return "dies";
  }

  // LEAVES BATTLEFIELD
  if (
    c.includes("leaves the battlefield") ||
    c.includes("leaves play") ||
    c.includes("is put into exile") ||
    (c.includes("is exiled") && c.includes("from the battlefield"))
  ) {
    return "leaves_battlefield";
  }

  // ENTERS BATTLEFIELD
  // Also handles modern WotC shorthand (post-2023): "whenever a land you control enters"
  // where "the battlefield" is omitted from the trigger condition.
  if (
    c.includes("enters the battlefield") ||
    c.includes("enters under your control") ||
    c.includes("enters tapped") ||
    c.includes("enters play") ||
    /\benters[,.]?\s*$/.test(c.trim())
  ) {
    return "enters_battlefield";
  }

  // DEALS DAMAGE — check before attacks
  if (c.includes("deals") && c.includes("damage")) {
    return "deals_damage";
  }

  // IS DEALT DAMAGE
  if (
    (c.includes("dealt") && c.includes("damage")) ||
    (c.includes("is dealt") && c.includes("damage"))
  ) {
    return "dealt_damage";
  }

  // ATTACKS
  if (c.includes("attacks") || (c.includes("attack") && !c.includes("unattacked"))) {
    return "attacks";
  }

  // BLOCKS
  if (c.includes("blocks") || c.includes("is blocked") || c.includes("becomes blocked")) {
    return "blocks";
  }

  // BEGINNING OF PHASE
  if (c.includes("at the beginning of")) {
    return "beginning_of_phase";
  }

  // END OF PHASE
  if (c.includes("at the end of") || c.includes("at end of")) {
    return "end_of_phase";
  }

  // CAST SPELL
  if (c.includes("cast") || c.includes("is cast")) {
    return "cast_spell";
  }

  // DRAW CARD
  if (c.includes("draw") && c.includes("card")) {
    return "draw_card";
  }
  if (c.includes("draws a card") || c.includes("draw a card")) {
    return "draw_card";
  }

  // DISCARD
  if (c.includes("discard")) {
    return "discard";
  }

  // GAIN LIFE
  if (
    (c.includes("gain") && c.includes("life")) ||
    c.includes("life is gained") ||
    c.includes("gains life")
  ) {
    return "life_gained";
  }

  // LOSE LIFE
  if (
    (c.includes("lose") && c.includes("life")) ||
    c.includes("life is lost") ||
    c.includes("loses life")
  ) {
    return "life_lost";
  }

  // COUNTER ADDED / REMOVED
  if (
    c.includes("counter is placed") ||
    c.includes("counter is put") ||
    c.includes("gets a counter") ||
    c.includes("counter is removed") ||
    c.includes("a counter")
  ) {
    return "counter_added";
  }

  // BECOMES TAPPED
  if (
    c.includes("becomes tapped") ||
    (c.includes("is tapped") && c.includes("for mana")) ||
    (c.includes("tap") && (c.includes("permanent") || c.includes("land")))
  ) {
    return "tapped";
  }

  return null;
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
