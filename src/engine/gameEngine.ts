import type {
  GameState,
  PlayerId,
  EngineStackItem,
  GameEvent,
  LogEntry,
  UserAction,
  TurnStep,
  Permanent,
  TriggerDefinition,
} from "./types";
import {
  TURN_STEP_ORDER,
  PRIORITY_STEPS,
  STEP_LABELS,
} from "./types";
import { detectTriggers, createTriggerLogEntry } from "./triggers";
import { generateId, getOpponent } from "./utils";

// ─── Initial State Factory ───────────────────────────────────────────────────

export interface GameConfig {
  format?: string;
  playerCount?: 2 | 4;
  startingLife?: number;
  activePlayer?: PlayerId;
}

const PLAYER_LABELS: Record<PlayerId, string> = {
  player_a: "Player 1",
  player_b: "Player 2",
  player_c: "Player 3",
  player_d: "Player 4",
};

export function createInitialState(
  config: GameConfig | PlayerId = "player_a"
): GameState {
  // Backwards compatible — accept just a PlayerId
  const cfg: GameConfig =
    typeof config === "string" ? { activePlayer: config } : config;

  const format = cfg.format || "modern";
  const isCommander = format === "commander";
  const playerCount = cfg.playerCount || (isCommander ? 4 : 2);
  const startingLife = cfg.startingLife ?? (isCommander ? 40 : 20);
  const activePlayer = cfg.activePlayer || "player_a";

  const playerIds: PlayerId[] =
    playerCount === 4
      ? ["player_a", "player_b", "player_c", "player_d"]
      : ["player_a", "player_b"];

  const players: Partial<Record<PlayerId, import("./types").Player>> = {};
  const graveyards: Partial<Record<PlayerId, string[]>> = {};
  const hasPassed: Partial<Record<PlayerId, boolean>> = {};

  for (const pid of playerIds) {
    players[pid] = { id: pid, label: PLAYER_LABELS[pid], life: startingLife };
    graveyards[pid] = [];
    hasPassed[pid] = false;
  }

  return {
    players,
    playerOrder: playerIds,
    turnNumber: 1,
    activePlayer,
    currentStep: "main",
    battlefield: [],
    stack: [],
    graveyards,
    exile: [],
    priority: {
      state: "waiting_for_action",
      activePlayer,
      priorityHolder: activePlayer,
      hasPassed,
      splitSecondActive: false,
      playerOrder: playerIds,
    },
    pendingTriggers: [],
    eventLog: [],
    actionLog: [],
    stepCount: 0,
    format,
  };
}

// ─── State History for Undo ──────────────────────────────────────────────────

const stateHistory: GameState[] = [];
const MAX_HISTORY = 50;

function saveHistory(state: GameState): void {
  stateHistory.push(structuredClone(state));
  if (stateHistory.length > MAX_HISTORY) {
    stateHistory.shift();
  }
}

export function canUndo(): boolean {
  return stateHistory.length > 0;
}

export function undo(): GameState | null {
  return stateHistory.pop() ?? null;
}

// ─── Core Action Processor ──────────────────────────────────────────────────

export function processAction(
  currentState: GameState,
  action: UserAction
): GameState {
  // Save current state for undo
  saveHistory(currentState);

  // Deep clone to avoid mutation
  const state = structuredClone(currentState);
  state.stepCount++;

  switch (action.type) {
    case "cast_spell":
      return handleCastSpell(state, action.spell);
    case "activate_ability":
      return handleActivateAbility(state, action.ability);
    case "pass_priority":
      return handlePassPriority(state);
    case "advance_phase":
      return handleAdvancePhase(state);
    case "add_permanent":
      return handleAddPermanent(state, action.permanent);
    case "remove_permanent":
      return handleRemovePermanent(state, action.permanentId);
    case "set_life":
      return handleSetLife(state, action.player, action.amount);
    case "deal_damage":
      return handleDealDamage(state, action.targetId, action.amount, action.sourceId);
    case "undo":
      return undo() ?? state;
    default:
      return state;
  }
}

// ─── Cast Spell ──────────────────────────────────────────────────────────────

function handleCastSpell(
  state: GameState,
  spell: Omit<EngineStackItem, "id" | "timestamp">
): GameState {
  // Check if split second is active
  if (state.priority.splitSecondActive && !spell.isManaAbility) {
    addLog(state, "explanation", undefined,
      "Cannot cast spells while a split second spell is on the stack.",
      undefined, true
    );
    return state;
  }

  const stackItem: EngineStackItem = {
    ...spell,
    id: generateId(),
    timestamp: state.stepCount,
  };

  // Add to stack
  state.stack.push(stackItem);

  // Log it
  const playerLabel = state.players[spell.controller]!.label;
  addLog(state, "cast_spell", spell.controller,
    `${playerLabel} casts ${spell.name}`,
    spell.targets.length > 0
      ? `Targeting: ${spell.targets.map((t) => t.name).join(", ")}`
      : undefined,
    true
  );

  // Check for split second
  if (spell.hasSplitSecond) {
    state.priority.splitSecondActive = true;
    addLog(state, "explanation", undefined,
      `${spell.name} has split second — players cannot cast spells or activate abilities in response.`,
      "Triggered abilities still trigger. Mana abilities can still be activated.",
      true
    );
  }

  // Create cast event for trigger checking
  const castEvent: GameEvent = {
    id: generateId(),
    type: "cast_spell",
    timestamp: state.stepCount,
    sourceId: stackItem.id,
    sourceName: spell.name,
    sourceController: spell.controller,
    data: { spellType: spell.spellType },
  };
  state.eventLog.push(castEvent);

  // Check for triggers from the cast event
  const triggers = detectTriggers(state, castEvent);
  if (triggers.length > 0) {
    placeTriggers(state, triggers, castEvent);
  }

  // Reset priority — both players get a chance to respond
  resetPriority(state);

  // Active player gets priority first after casting
  state.priority.priorityHolder = state.activePlayer;
  addLog(state, "priority_receive", state.activePlayer,
    `${state.players[state.activePlayer]!.label} receives priority`,
    "May cast an instant, activate an ability, or pass."
  );

  return state;
}

// ─── Activate Ability ────────────────────────────────────────────────────────

function handleActivateAbility(
  state: GameState,
  ability: Omit<EngineStackItem, "id" | "timestamp">
): GameState {
  // Mana abilities don't use the stack
  if (ability.isManaAbility) {
    addLog(state, "activate_ability", ability.controller,
      `${state.players[ability.controller]!.label} activates mana ability: ${ability.name}`,
      "Mana abilities resolve immediately and don't use the stack."
    );
    return state;
  }

  // Check split second
  if (state.priority.splitSecondActive) {
    addLog(state, "explanation", undefined,
      "Cannot activate abilities while a split second spell is on the stack.",
      "Only mana abilities can be activated."
    );
    return state;
  }

  const stackItem: EngineStackItem = {
    ...ability,
    id: generateId(),
    timestamp: state.stepCount,
  };

  state.stack.push(stackItem);

  const playerLabel = state.players[ability.controller]!.label;
  addLog(state, "activate_ability", ability.controller,
    `${playerLabel} activates ${ability.name}`,
    ability.effect || undefined,
    true
  );

  // Reset priority
  resetPriority(state);
  state.priority.priorityHolder = state.activePlayer;
  addLog(state, "priority_receive", state.activePlayer,
    `${state.players[state.activePlayer]!.label} receives priority`
  );

  return state;
}

// ─── Pass Priority ──────────────────────────────────────────────────────────

function handlePassPriority(state: GameState): GameState {
  const holder = state.priority.priorityHolder;
  const playerLabel = state.players[holder]!.label;
  const playerOrder = state.playerOrder;

  // Mark this player as having passed
  state.priority.hasPassed[holder] = true;

  addLog(state, "priority_pass", holder,
    `${playerLabel} passes priority`
  );

  // Check if ALL players have passed
  const allPassed = playerOrder.every((pid) => state.priority.hasPassed[pid]);

  if (allPassed) {
    // Everyone passed — resolve top of stack or advance phase
    if (state.stack.length > 0) {
      return resolveTopOfStack(state);
    } else {
      // Stack is empty, all passed — advance to next step
      addLog(state, "explanation", undefined,
        "All players have passed with an empty stack.",
        "The game advances to the next step."
      );
      return advanceStep(state);
    }
  } else {
    // Pass priority to next player in turn order
    const nextPlayer = getNextPlayer(holder, playerOrder);
    state.priority.priorityHolder = nextPlayer;
    addLog(state, "priority_receive", nextPlayer,
      `${state.players[nextPlayer]!.label} receives priority`,
      state.stack.length > 0
        ? `Stack has ${state.stack.length} item${state.stack.length > 1 ? "s" : ""}. May respond or pass.`
        : "May cast a spell, activate an ability, or pass."
    );

    return state;
  }
}

// ─── Resolve Top of Stack ────────────────────────────────────────────────────

function resolveTopOfStack(state: GameState): GameState {
  if (state.stack.length === 0) return state;

  const item = state.stack.pop()!;
  state.priority.state = "resolving";

  // Check if targets are still legal
  const illegalTargets = item.targets.filter((t) => !t.isLegal);
  const allTargetsIllegal =
    item.targets.length > 0 && item.targets.every((t) => !t.isLegal);

  if (allTargetsIllegal) {
    // Spell fizzles
    addLog(state, "fizzle", item.controller,
      `${item.name} fizzles`,
      "All targets are now illegal. The spell is removed from the stack without resolving.",
      true
    );

    // Check for more items on stack
    return afterResolution(state, item);
  }

  if (illegalTargets.length > 0) {
    addLog(state, "explanation", undefined,
      `Some targets of ${item.name} are no longer legal.`,
      `${item.name} still resolves, affecting only the remaining legal targets.`
    );
  }

  // Log resolution
  const playerLabel = state.players[item.controller]!.label;
  addLog(state, "resolve", item.controller,
    `${item.name} resolves`,
    item.effect || `${item.name} has its effect.`,
    true
  );

  // Handle resolution based on type
  if (item.type === "spell" && isPermamentSpell(item.spellType)) {
    // Creature/artifact/enchantment/planeswalker enters the battlefield
    handlePermanentEnters(state, item);
  }

  // Clear split second if the resolving spell had it
  if (item.hasSplitSecond) {
    state.priority.splitSecondActive = false;
  }

  return afterResolution(state, item);
}

function isPermamentSpell(spellType?: string): boolean {
  return ["creature", "artifact", "enchantment", "planeswalker"].includes(
    spellType || ""
  );
}

function handlePermanentEnters(
  state: GameState,
  item: EngineStackItem
): void {
  const permanent: Permanent = {
    id: generateId(),
    name: item.name,
    types: item.spellType ? [item.spellType as any] : [],
    controller: item.controller,
    owner: item.controller,
    damageMarked: 0,
    keywords: [],
    triggers: [],
    tapped: false,
    summoningSick: true,
    counters: {},
  };

  state.battlefield.push(permanent);

  addLog(state, "game_event", item.controller,
    `${item.name} enters the battlefield under ${state.players[item.controller]!.label}'s control`
  );

  // Generate ETB event
  const etbEvent: GameEvent = {
    id: generateId(),
    type: "enters_battlefield",
    timestamp: state.stepCount,
    sourceId: permanent.id,
    sourceName: item.name,
    sourceController: item.controller,
    data: { type: item.spellType },
  };
  state.eventLog.push(etbEvent);

  // Check ETB triggers
  const triggers = detectTriggers(state, etbEvent);
  if (triggers.length > 0) {
    placeTriggers(state, triggers, etbEvent);
  }
}

// ─── After Resolution — check SBAs, triggers, then give priority ─────────

function afterResolution(
  state: GameState,
  resolvedItem: EngineStackItem
): GameState {
  // Check state-based actions
  state.priority.state = "checking_state_based";
  checkStateBasedActions(state);

  // Check for new triggers
  state.priority.state = "checking_triggers";

  // Reset priority for the next round
  resetPriority(state);

  if (state.stack.length > 0) {
    // More items on stack — active player gets priority
    state.priority.state = "waiting_for_action";
    state.priority.priorityHolder = state.activePlayer;
    addLog(state, "priority_receive", state.activePlayer,
      `${state.players[state.activePlayer]!.label} receives priority`,
      `Stack has ${state.stack.length} item${state.stack.length > 1 ? "s" : ""} remaining.`
    );
  } else {
    // Stack is empty
    state.priority.state = "waiting_for_action";
    state.priority.priorityHolder = state.activePlayer;
    addLog(state, "explanation", undefined,
      "The stack is now empty.",
      "Active player receives priority."
    );
  }

  return state;
}

// ─── State-Based Actions ─────────────────────────────────────────────────────

function checkStateBasedActions(state: GameState): void {
  let actionsPerformed = true;

  // SBAs are checked repeatedly until none are performed
  while (actionsPerformed) {
    actionsPerformed = false;

    // Check player life totals
    for (const player of Object.values(state.players)) {
      if (player.life <= 0) {
        addLog(state, "state_based_action", player.id,
          `${player.label} has ${player.life} life — they lose the game`,
          undefined, true
        );
        state.priority.state = "game_over";
        actionsPerformed = true;
      }
    }

    // Check creatures with lethal damage or 0 toughness
    const toDestroy: Permanent[] = [];
    for (const perm of state.battlefield) {
      if (perm.types.includes("creature")) {
        const toughness = perm.currentToughness ?? perm.baseToughness ?? 0;

        // Lethal damage check
        if (perm.damageMarked >= toughness && toughness > 0) {
          if (!perm.keywords.includes("indestructible")) {
            toDestroy.push(perm);
          }
        }

        // 0 or less toughness
        if (toughness <= 0) {
          toDestroy.push(perm);
        }
      }
    }

    for (const perm of toDestroy) {
      destroyPermanent(state, perm);
      actionsPerformed = true;
    }
  }
}

function destroyPermanent(state: GameState, permanent: Permanent): void {
  // Remove from battlefield
  state.battlefield = state.battlefield.filter((p) => p.id !== permanent.id);

  // Add to graveyard
  state.graveyards[permanent.owner].push(permanent.name);

  addLog(state, "state_based_action", undefined,
    `${permanent.name} dies`,
    `Moved from the battlefield to ${state.players[permanent.owner]!.label}'s graveyard.`,
    true
  );

  // Generate dies event
  const diesEvent: GameEvent = {
    id: generateId(),
    type: "dies",
    timestamp: state.stepCount,
    sourceId: permanent.id,
    sourceName: permanent.name,
    sourceController: permanent.controller,
  };
  state.eventLog.push(diesEvent);

  // Check dies triggers (including the dying permanent's own triggers)
  const triggers = detectTriggers(state, diesEvent);
  if (triggers.length > 0) {
    placeTriggers(state, triggers, diesEvent);
  }
}

// ─── Place Triggers on Stack ─────────────────────────────────────────────────

function placeTriggers(
  state: GameState,
  triggers: TriggerDefinition[],
  event: GameEvent
): void {
  if (triggers.length === 0) return;

  addLog(state, "explanation", undefined,
    `${triggers.length} trigger${triggers.length > 1 ? "s" : ""} detected`,
    triggers.length > 1
      ? "Ordered by APNAP: active player's triggers go on the stack first (resolve last), then non-active player's (resolve first)."
      : undefined
  );

  for (const trigger of triggers) {
    // Find the source permanent to get its image
    const sourcePerm = state.battlefield.find((p) => p.id === trigger.sourceId)
      || state.battlefield.find((p) => p.name === trigger.sourceName);

    const stackItem: EngineStackItem = {
      id: generateId(),
      type: "triggered_ability",
      name: `${trigger.sourceName} trigger`,
      controller: trigger.controller,
      targets: [],
      triggerSource: trigger.sourceName,
      triggerEvent: trigger.event,
      effect: trigger.effect,
      isManaAbility: false,
      hasSplitSecond: false,
      timestamp: state.stepCount,
      imageUri: sourcePerm?.imageUri,
    };

    state.stack.push(stackItem);

    addLog(state, "trigger", trigger.controller,
      `${trigger.sourceName}'s ability triggers`,
      `${trigger.condition || "Triggered"} → ${trigger.effect}`,
      true
    );
  }
}

// ─── Advance Phase/Step ──────────────────────────────────────────────────────

function handleAdvancePhase(state: GameState): GameState {
  if (state.stack.length > 0) {
    addLog(state, "explanation", undefined,
      "Cannot advance phases while the stack is not empty.",
      "Resolve all items on the stack first."
    );
    return state;
  }

  return advanceStep(state);
}

function advanceStep(state: GameState): GameState {
  const currentIdx = TURN_STEP_ORDER.indexOf(state.currentStep);
  const nextIdx = currentIdx + 1;

  if (nextIdx >= TURN_STEP_ORDER.length) {
    // End of turn — start new turn, advance to next player in order
    state.turnNumber++;
    state.activePlayer = getNextPlayer(state.activePlayer, state.playerOrder);
    state.currentStep = TURN_STEP_ORDER[0];
    addLog(state, "phase_change", undefined,
      `Turn ${state.turnNumber} — ${state.players[state.activePlayer]!.label}'s turn`,
      undefined, true
    );
  } else {
    state.currentStep = TURN_STEP_ORDER[nextIdx];
  }

  addLog(state, "phase_change", undefined,
    `→ ${STEP_LABELS[state.currentStep]}`,
    undefined
  );

  // Check for beginning-of-step triggers
  if (PRIORITY_STEPS.includes(state.currentStep)) {
    const phaseEvent: GameEvent = {
      id: generateId(),
      type: "beginning_of_phase",
      timestamp: state.stepCount,
      sourceController: state.activePlayer,
      data: { step: state.currentStep },
    };
    state.eventLog.push(phaseEvent);

    const triggers = detectTriggers(state, phaseEvent);
    if (triggers.length > 0) {
      placeTriggers(state, triggers, phaseEvent);
    }
  }

  // Reset priority for new step
  resetPriority(state);
  state.priority.priorityHolder = state.activePlayer;

  // Handle steps without priority
  if (!PRIORITY_STEPS.includes(state.currentStep)) {
    // Untap step: no priority, just advance
    if (state.currentStep === "untap") {
      handleUntapStep(state);
      return advanceStep(state);
    }
    // Cleanup: damage wears off, no priority (usually)
    if (state.currentStep === "cleanup") {
      handleCleanupStep(state);
      return advanceStep(state);
    }
  }

  return state;
}

function handleUntapStep(state: GameState): void {
  let untapped = 0;
  for (const perm of state.battlefield) {
    if (perm.controller === state.activePlayer && perm.tapped) {
      perm.tapped = false;
      untapped++;
    }
    if (perm.controller === state.activePlayer) {
      perm.summoningSick = false;
    }
  }
  if (untapped > 0) {
    addLog(state, "game_event", state.activePlayer,
      `${state.players[state.activePlayer]!.label} untaps ${untapped} permanent${untapped > 1 ? "s" : ""}`
    );
  }
}

function handleCleanupStep(state: GameState): void {
  // Remove all damage
  for (const perm of state.battlefield) {
    if (perm.damageMarked > 0) {
      perm.damageMarked = 0;
    }
  }
}

// ─── Board Setup Actions ─────────────────────────────────────────────────────

function handleAddPermanent(
  state: GameState,
  permanent: Omit<Permanent, "id">
): GameState {
  const newPerm: Permanent = {
    ...permanent,
    id: generateId(),
  };
  state.battlefield.push(newPerm);
  addLog(state, "game_event", permanent.controller,
    `${permanent.name} added to the battlefield`
  );
  return state;
}

function handleRemovePermanent(
  state: GameState,
  permanentId: string
): GameState {
  const perm = state.battlefield.find((p) => p.id === permanentId);
  if (perm) {
    destroyPermanent(state, perm);
  }
  return state;
}

function handleSetLife(
  state: GameState,
  player: PlayerId,
  amount: number
): GameState {
  const oldLife = state.players[player]!.life;
  state.players[player]!.life = amount;
  addLog(state, "game_event", player,
    `${state.players[player]!.label}'s life total: ${oldLife} → ${amount}`
  );
  return state;
}

function handleDealDamage(
  state: GameState,
  targetId: string,
  amount: number,
  sourceId?: string
): GameState {
  // Check if target is a player
  if (targetId === "player_a" || targetId === "player_b") {
    const player = state.players[targetId as PlayerId]!;
    player.life -= amount;
    addLog(state, "game_event", undefined,
      `${player.label} takes ${amount} damage (${player.life + amount} → ${player.life})`,
      undefined, true
    );

    // Generate damage event
    const dmgEvent: GameEvent = {
      id: generateId(),
      type: "dealt_damage",
      timestamp: state.stepCount,
      targetId,
      targetName: player.label,
      sourceId,
      data: { amount },
    };
    state.eventLog.push(dmgEvent);

    const triggers = detectTriggers(state, dmgEvent);
    if (triggers.length > 0) {
      placeTriggers(state, triggers, dmgEvent);
    }

    checkStateBasedActions(state);
    return state;
  }

  // Target is a permanent
  const perm = state.battlefield.find((p) => p.id === targetId);
  if (perm) {
    perm.damageMarked += amount;
    const source = sourceId
      ? state.battlefield.find((p) => p.id === sourceId)
      : undefined;

    addLog(state, "game_event", undefined,
      `${perm.name} takes ${amount} damage (${perm.damageMarked} total marked)`,
      source ? `Source: ${source.name}` : undefined,
      true
    );

    // Check for lifelink on source
    if (source?.keywords.includes("lifelink")) {
      const owner = state.players[source.controller]!;
      owner.life += amount;
      addLog(state, "game_event", source.controller,
        `Lifelink: ${owner.label} gains ${amount} life (now ${owner.life})`
      );
    }

    // Generate damage event
    const dmgEvent: GameEvent = {
      id: generateId(),
      type: "deals_damage",
      timestamp: state.stepCount,
      sourceId: sourceId,
      sourceName: source?.name,
      sourceController: source?.controller,
      targetId: perm.id,
      targetName: perm.name,
      data: { amount },
    };
    state.eventLog.push(dmgEvent);

    const triggers = detectTriggers(state, dmgEvent);
    if (triggers.length > 0) {
      placeTriggers(state, triggers, dmgEvent);
    }

    // Check SBAs (might kill the creature)
    checkStateBasedActions(state);
  }

  return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetPriority(state: GameState): void {
  const hasPassed: Partial<Record<PlayerId, boolean>> = {};
  for (const pid of state.playerOrder) {
    hasPassed[pid] = false;
  }
  state.priority.hasPassed = hasPassed;
  state.priority.state = "waiting_for_action";
}

function getNextPlayer(current: PlayerId, playerOrder: PlayerId[]): PlayerId {
  const idx = playerOrder.indexOf(current);
  return playerOrder[(idx + 1) % playerOrder.length];
}

function addLog(
  state: GameState,
  type: LogEntry["type"],
  player: PlayerId | undefined,
  text: string,
  detail?: string,
  highlight?: boolean
): void {
  state.actionLog.push({
    id: generateId(),
    timestamp: state.stepCount,
    type,
    player,
    text,
    detail,
    highlight,
  });
}
