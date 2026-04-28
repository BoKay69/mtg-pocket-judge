import type {
  GameState,
  PlayerId,
  EngineStackItem,
  GameEvent,
  LogEntry,
  UserAction,
  TurnStep,
  Permanent,
  PermanentType,
  KeywordAbility,
  TriggerDefinition,
  CardFaceData,
} from "./types";
import {
  TURN_STEP_ORDER,
  PRIORITY_STEPS,
  STEP_LABELS,
} from "./types";
import { detectTriggers, createTriggerLogEntry, parseTriggersFromOracle } from "./triggers";
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
    players[pid] = { id: pid, label: PLAYER_LABELS[pid], life: startingLife, energyCounters: 0 };
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
    dayNight: null,
    spellsCastThisTurn: 0,
    spellsCastLastTurn: 0,
    cardsDrawnThisTurn: {},
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
    case "draw_card":
      return handleDrawCard(state, action.player, action.count || 1);
    case "transform_permanent":
      return handleTransformPermanent(state, action.permanentId);
    case "set_day_night":
      return handleSetDayNight(state, action.state);
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
  const isActivatedAbility = spell.type === "activated_ability";
  const isTriggeredAbility = spell.type === "triggered_ability";
  const isActualSpell = spell.type === "spell";

  addLog(state, isActivatedAbility ? "activate_ability" : "cast_spell", spell.controller,
    isActivatedAbility
      ? `${playerLabel} activates ${spell.name}`
      : `${playerLabel} casts ${spell.name}`,
    [
      spell.targets.length > 0 ? `Targeting: ${spell.targets.map((t) => t.name).join(", ")}` : null,
      spell.effect ? spell.effect.slice(0, 200) + (spell.effect.length > 200 ? "..." : "") : null,
    ].filter(Boolean).join("\n") || undefined,
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

  // Fire cast_spell events for ALL spells (instant, sorcery, creature, artifact, etc.)
  // Creatures ARE spells on the stack — Rhystic Study, Mystic Remora, etc. trigger on them.
  // Only activated and triggered abilities are NOT spells.
  if (isActualSpell) {
    state.spellsCastThisTurn++;
    const isPermanentSpell = isPermamentSpell(spell.spellType);
    const castEvent: GameEvent = {
      id: generateId(),
      type: "cast_spell",
      timestamp: state.stepCount,
      sourceId: stackItem.id,
      sourceName: spell.name,
      sourceController: spell.controller,
      data: {
        spellType: spell.spellType,
        xValue: spell.xValue,
        hasXCost: spell.hasXCost,
        isPermanentSpell,
      },
    };
    state.eventLog.push(castEvent);

    // Check for triggers from the cast event
    const triggers = detectTriggers(state, castEvent);
    if (triggers.length > 0) {
      placeTriggers(state, triggers, castEvent);
    }

    // Handle Storm — copies placed immediately onto the stack (above the original, resolving LIFO first)
    if (stackItem.hasStorm) {
      const stackSpellsBefore = state.stack.slice(0, -1).filter((s) => s.type === "spell").length;
      const priorCount = spell.priorStormCount ?? 0;
      const totalStormCount = stackSpellsBefore + priorCount;

      addLog(
        state,
        "trigger",
        spell.controller,
        `${spell.name}'s Storm triggers`,
        `Storm count: ${totalStormCount} (${stackSpellsBefore} spell${stackSpellsBefore !== 1 ? "s" : ""} on the stack + ${priorCount} cast earlier this turn). ${
          totalStormCount > 0
            ? `Creating ${totalStormCount} cop${totalStormCount !== 1 ? "ies" : "y"} of ${spell.name} on the stack now.`
            : "Storm count is 0 — no copies created."
        }`,
        true
      );

      if (totalStormCount > 0) {
        const { id: _id, timestamp: _ts, stormOriginalItem: _orig, priorStormCount: _prior, hasStorm: _hs, ...spellForCopy } = stackItem;
        for (let i = 0; i < totalStormCount; i++) {
          const copy: EngineStackItem = {
            ...spellForCopy,
            id: generateId(),
            timestamp: state.stepCount + i,
            name: `${spell.name} (Storm Copy ${i + 1})`,
            isStormCopy: true,
            stormCopyIndex: i + 1,
            hasStorm: false,
            priorStormCount: undefined,
          };
          state.stack.push(copy);
        }
        addLog(
          state,
          "game_event",
          spell.controller,
          `Storm places ${totalStormCount} cop${totalStormCount !== 1 ? "ies" : "y"} of ${spell.name} on the stack`,
          `Copy ${totalStormCount} is on top and resolves first. The original ${spell.name} is at the bottom and resolves last.`,
          true
        );
      }
    }
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
    [
      ability.effect || null,
      `Activated abilities are NOT spells — "whenever a spell is cast" effects (e.g. Rhystic Study) do not trigger.`,
    ].filter(Boolean).join("\n\n"),
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

// ─── Effect Parsers ───────────────────────────────────────────────────────────

/** Resolve a word-or-digit count, substituting X with xValue when present. */
function resolveCount(raw: string, xValue?: number): number {
  const numWords: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4,
    five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const lower = raw.toLowerCase();
  if (lower === "x") return xValue ?? 1;
  const n = parseInt(raw);
  return isNaN(n) ? (numWords[lower] ?? 1) : n;
}

function parseDrawsFromEffect(
  effect: string,
  state: GameState,
  resolver: PlayerId,
  xValue?: number
): Array<{ player: PlayerId; count: number }> {
  if (!effect) return [];
  const lower = effect.toLowerCase();
  if (!lower.includes("draw") || !lower.includes("card")) return [];

  function countCards(s: string): number {
    const m = s.match(/draw\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|x)\s+card/i);
    if (!m) return 1;
    return resolveCount(m[1], xValue);
  }

  const draws: Array<{ player: PlayerId; count: number }> = [];

  if (lower.includes("each player draw")) {
    const count = countCards(lower);
    for (const pid of state.playerOrder) draws.push({ player: pid, count });
    return draws;
  }

  if (lower.includes("each opponent draw") || /opponents?\s+draw/.test(lower)) {
    const count = countCards(lower);
    for (const pid of state.playerOrder) {
      if (pid !== resolver) draws.push({ player: pid, count });
    }
    return draws;
  }

  // Can't resolve "target player draws" without knowing who was targeted
  if (lower.includes("target player draw") || lower.includes("target opponent draw")) {
    return draws;
  }

  // Controller draws (handles "draw X cards", "you draw a card", etc.)
  const count = countCards(lower);
  if (count > 0) draws.push({ player: resolver, count });
  return draws;
}

// ─── Token / Damage / Life Parsers ───────────────────────────────────────────

interface TokenResult {
  count: number;
  description: string; // e.g. "1/1 white Human creature tokens"
}

/**
 * Detect token creation in an effect. Returns count + description, or null.
 * Handles "create X tokens", "create three 1/1 Soldier tokens", "put a token onto the battlefield", etc.
 */
function parseTokensFromEffect(effect: string, xValue?: number): TokenResult | null {
  if (!effect) return null;
  const lower = effect.toLowerCase();
  if (!lower.includes("token")) return null;

  // Patterns: "create N <description> token(s)" or "put N <description> token(s)"
  const tokenMatch = lower.match(
    /(?:create|put)\s+(\d+|x|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.*?)\s*tokens?\b/i
  );
  if (!tokenMatch) return null;

  const count = resolveCount(tokenMatch[1], xValue);
  const description = tokenMatch[2].trim();
  return { count, description: `${description} token${count !== 1 ? "s" : ""}` };
}

interface DamageResult {
  amount: number;
  targetType: string; // "any target", "each opponent", "target creature", etc.
}

/**
 * Detect damage-dealing in an effect. Returns array of damage instances.
 * Handles "deals X damage", "deal 3 damage", "X damage to each opponent", etc.
 */
function parseDamageFromEffect(effect: string, xValue?: number): DamageResult[] {
  if (!effect) return [];
  const lower = effect.toLowerCase();
  if (!lower.includes("damage")) return [];

  const results: DamageResult[] = [];
  // Match "deal/deals N damage to <target>" or "N damage to <target>"
  const regex = /deal[s]?\s+(\d+|x)\s+damage(?:\s+to\s+(any target|each opponent|each player|each creature|target [a-z\s]+?))?(?:[.,]|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lower)) !== null) {
    const amount = resolveCount(match[1], xValue);
    const targetType = (match[2] || "target").trim();
    results.push({ amount, targetType });
  }
  return results;
}

/**
 * Detect life gain in an effect. Returns amount, or 0 if not found.
 */
function parseLifeGainFromEffect(effect: string, xValue?: number): number {
  if (!effect) return 0;
  const lower = effect.toLowerCase();
  if (!lower.includes("gain") || !lower.includes("life")) return 0;

  const m = lower.match(/gain\s+(\d+|x)\s+life/i);
  if (!m) return 0;
  return resolveCount(m[1], xValue);
}

// ─── Energy Counter Parser ───────────────────────────────────────────────────

function parseEnergyFromEffect(effect: string): number {
  if (!effect) return 0;
  // Energy is granted via "{E}" symbols: "you get {E}{E}{E}" → 3 energy
  const matches = effect.match(/\{E\}/gi);
  return matches ? matches.length : 0;
}

// ─── Amass Parser ────────────────────────────────────────────────────────────

/**
 * Detect "amass [Type] N" in an effect. Returns the army type and counter count, or null.
 * Covers "amass Orcs 1", "amass Zombies 2", and generic "amass 3" (defaults to Zombie Army).
 */
function parseAmassFromEffect(effect: string, xValue?: number): { count: number; type: string } | null {
  if (!effect) return null;
  if (!effect.toLowerCase().includes("amass")) return null;
  const m = effect.match(/\bamass\s+(?:([A-Za-z]+)\s+)?(\d+|x)\b/i);
  if (!m) return null;
  const rawType = m[1];
  const type = rawType
    ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()
    : "Zombie";
  const count = resolveCount(m[2], xValue);
  return { count, type };
}

// ─── Token Permanent Factory ──────────────────────────────────────────────────

function createTokenPermanent(description: string, controller: PlayerId): Omit<Permanent, "id"> {
  const cleanDesc = description.replace(/\s*tokens?\s*$/, "").trim();
  const lower = cleanDesc.toLowerCase();

  const ptMatch = lower.match(/(\d+)\/(\d+)/);
  const basePower = ptMatch ? parseInt(ptMatch[1]) : undefined;
  const baseToughness = ptMatch ? parseInt(ptMatch[2]) : undefined;

  const types: PermanentType[] = [];
  if (lower.includes("creature")) types.push("creature");
  if (lower.includes("artifact")) types.push("artifact");
  if (lower.includes("enchantment")) types.push("enchantment");
  if (lower.includes("land")) types.push("land");
  if (lower.includes("planeswalker")) types.push("planeswalker");
  if (types.length === 0) types.push("artifact"); // Treasure, Clue, Food, etc.

  const kwMap: [string, KeywordAbility][] = [
    ["flying", "flying"], ["vigilance", "vigilance"], ["trample", "trample"],
    ["haste", "haste"], ["deathtouch", "deathtouch"], ["lifelink", "lifelink"],
    ["menace", "menace"], ["reach", "reach"], ["indestructible", "indestructible"],
    ["hexproof", "hexproof"], ["first strike", "first_strike"],
    ["double strike", "double_strike"], ["shroud", "shroud"],
  ];
  const keywords: KeywordAbility[] = [];
  for (const [word, kw] of kwMap) {
    if (lower.includes(word)) keywords.push(kw);
  }

  const excludeWords = new Set([
    "white", "blue", "black", "red", "green", "colorless", "multicolored",
    "creature", "artifact", "enchantment", "land", "planeswalker",
    "flying", "vigilance", "trample", "haste", "deathtouch", "lifelink",
    "menace", "reach", "indestructible", "hexproof", "first", "strike",
    "double", "shroud", "with", "and", "a", "an", "the",
  ]);

  const subtypeWords = lower
    .replace(/\d+\/\d+/, "")
    .trim()
    .split(/\s+/)
    .filter(w => w && !excludeWords.has(w) && !/^\d+$/.test(w));

  const tokenName = subtypeWords.length > 0
    ? subtypeWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + " Token"
    : "Token";

  return {
    name: tokenName,
    types,
    controller,
    owner: controller,
    basePower,
    baseToughness,
    currentPower: basePower,
    currentToughness: baseToughness,
    damageMarked: 0,
    keywords,
    triggers: [],
    tapped: false,
    summoningSick: true,
    counters: {},
    oracleText: cleanDesc,
    isToken: true,
  };
}

// ─── Amass Handler ───────────────────────────────────────────────────────────

/**
 * Execute an Amass effect: find an Army this player controls, or create a 0/0 Army token,
 * then put N +1/+1 counters on it.
 */
function handleAmass(
  state: GameState,
  controller: PlayerId,
  count: number,
  armyType: string,
  sourceName: string
): void {
  const controllerPlayer = state.players[controller]!;

  // Find an existing Army controlled by this player (any token or permanent named *Army*)
  let army = state.battlefield.find(
    (p) => p.controller === controller && p.name.toLowerCase().includes("army")
  );

  if (!army) {
    // Create a new 0/0 Army token; it immediately gets the counters below
    const tokenId = generateId();
    const armyToken: Permanent = {
      id: tokenId,
      name: `${armyType} Army Token`,
      types: ["creature"],
      controller,
      owner: controller,
      basePower: 0,
      baseToughness: 0,
      currentPower: 0,
      currentToughness: 0,
      damageMarked: 0,
      keywords: [],
      triggers: [],
      tapped: false,
      summoningSick: true,
      counters: {},
      isToken: true,
      oracleText: `${armyType} Army creature token`,
    };
    state.battlefield.push(armyToken);
    army = armyToken;

    addLog(state, "game_event", controller,
      `${controllerPlayer.label} creates a 0/0 ${armyType} Army token`,
      `Created by ${sourceName} (Amass ${armyType} ${count})`,
      true
    );
  }

  // Put N +1/+1 counters on the Army
  army.counters["+1/+1"] = (army.counters["+1/+1"] || 0) + count;
  army.currentPower = (army.currentPower ?? 0) + count;
  army.currentToughness = (army.currentToughness ?? 0) + count;

  addLog(state, "game_event", controller,
    `Amass ${armyType} ${count}: ${army.name} gets ${count} +1/+1 counter${count !== 1 ? "s" : ""} (now ${army.currentPower}/${army.currentToughness})`,
    `Effect of ${sourceName}`,
    true
  );
}

// ─── Counter Effect Helpers ───────────────────────────────────────────────────

function isCounterspell(effect: string): boolean {
  return /counter target/i.test(effect || "");
}

function applyCounterEffect(state: GameState, item: EngineStackItem): void {
  if (item.targets.length === 0) return;

  const targetName = item.targets[0].name.toLowerCase();
  const targetIdx = state.stack.findIndex(
    (s) =>
      s.name.toLowerCase() === targetName ||
      s.name.toLowerCase().includes(targetName) ||
      targetName.includes(s.name.toLowerCase())
  );

  if (targetIdx === -1) {
    addLog(state, "explanation", undefined,
      `${item.name} finds no target on the stack.`,
      "The target spell or ability may have already resolved or been removed."
    );
    return;
  }

  const countered = state.stack.splice(targetIdx, 1)[0];

  if (countered.type === "spell") {
    const gyard = state.graveyards[countered.controller];
    if (gyard) gyard.push(countered.name);
  }

  addLog(state, "counter", item.controller,
    `${countered.name} is countered`,
    `${item.name} counters ${countered.name}. ${
      countered.type === "spell"
        ? `${countered.name} is put into its owner's graveyard.`
        : `${countered.name} is removed from the stack with no effect.`
    }`,
    true
  );
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

  // Log resolution with descriptive text
  const playerLabel = state.players[item.controller]!.label;
  const targetNames = item.targets.map((t) => t.name).join(", ");

  // Build a human-readable description of what happens
  let description = "";
  const xSuffix = item.xValue !== undefined ? ` (X = ${item.xValue})` : "";
  if (item.type === "spell" && isPermamentSpell(item.spellType)) {
    description = `${item.name} enters the battlefield under ${playerLabel}'s control.`;
  } else if (item.type === "triggered_ability") {
    description = item.effect || `${item.triggerSource || item.name}'s triggered ability resolves.`;
  } else if (item.type === "activated_ability") {
    description = item.effect ? item.effect + xSuffix : `${item.name} resolves.`;
  } else if (item.effect) {
    const effectPreview = item.effect.length > 200 ? item.effect.slice(0, 200) + "..." : item.effect;
    description = effectPreview + (item.hasXCost ? xSuffix : "");
  } else {
    description = `${item.name} resolves.`;
  }

  if (targetNames && !description.toLowerCase().includes(targetNames.toLowerCase())) {
    description = `Targeting ${targetNames}: ${description}`;
  }

  addLog(state, "resolve", item.controller,
    `${item.name} resolves`,
    description,
    true
  );

  // If this is a counterspell, remove its target from the stack
  if (item.effect && isCounterspell(item.effect)) {
    applyCounterEffect(state, item);
  }

  // Handle resolution based on type
  if (item.type === "spell" && isPermamentSpell(item.spellType)) {
    // Creature/artifact/enchantment/planeswalker enters the battlefield
    handlePermanentEnters(state, item);
  } else if (item.effect) {
    // ── Draw effects ──────────────────────────────────────────────────────────
    const drawTargets = parseDrawsFromEffect(item.effect, state, item.controller, item.xValue);
    for (const { player, count } of drawTargets) {
      const playerObj = state.players[player];
      if (!playerObj) continue;
      for (let i = 0; i < count; i++) {
        const prevDrawn = state.cardsDrawnThisTurn[player] ?? 0;
        const totalDrawn = prevDrawn + 1;
        state.cardsDrawnThisTurn[player] = totalDrawn;

        addLog(state, "game_event", player,
          `${playerObj.label} draws a card`,
          `Caused by ${item.name} resolving`,
          true
        );
        const drawEvent: GameEvent = {
          id: generateId(),
          type: "draw_card",
          timestamp: state.stepCount,
          sourceController: player,
          sourceName: playerObj.label,
          data: { source: item.name, drawNumber: i + 1, totalDrawnThisTurn: totalDrawn },
        };
        state.eventLog.push(drawEvent);
        const drawTriggers = detectTriggers(state, drawEvent);
        if (drawTriggers.length > 0) {
          placeTriggers(state, drawTriggers, drawEvent);
        }
      }
    }

    // ── Token creation effects ────────────────────────────────────────────────
    const tokenResult = parseTokensFromEffect(item.effect, item.xValue);
    if (tokenResult) {
      const controllerPlayer = state.players[item.controller]!;
      addLog(state, "game_event", item.controller,
        `${controllerPlayer.label} creates ${tokenResult.count} ${tokenResult.description}`,
        `Effect of ${item.name}`,
        true
      );

      // Fire tokens_created event first — triggers "whenever a token is created"
      const tokensEvent: GameEvent = {
        id: generateId(),
        type: "tokens_created",
        timestamp: state.stepCount,
        sourceId: item.id,
        sourceName: item.name,
        sourceController: item.controller,
        data: {
          count: tokenResult.count,
          tokenType: tokenResult.description,
          xValue: item.xValue,
        },
      };
      state.eventLog.push(tokensEvent);
      const tokenTriggers = detectTriggers(state, tokensEvent);
      if (tokenTriggers.length > 0) {
        placeTriggers(state, tokenTriggers, tokensEvent);
      }

      // Create each token as a Permanent and fire enters_battlefield events.
      // MTG rules: each token enters separately, each is its own ETB event.
      for (let i = 0; i < tokenResult.count; i++) {
        const tokenPerm = createTokenPermanent(tokenResult.description, item.controller);
        const tokenId = generateId();
        const newToken: Permanent = { ...tokenPerm, id: tokenId };
        state.battlefield.push(newToken);

        addLog(state, "game_event", item.controller,
          `${tokenPerm.name} enters the battlefield under ${controllerPlayer.label}'s control`
        );

        const etbEvent: GameEvent = {
          id: generateId(),
          type: "enters_battlefield",
          timestamp: state.stepCount,
          sourceId: tokenId,
          sourceName: tokenPerm.name,
          sourceController: item.controller,
          data: { type: tokenPerm.types[0], isToken: true },
        };
        state.eventLog.push(etbEvent);
        const etbTriggers = detectTriggers(state, etbEvent);
        if (etbTriggers.length > 0) {
          placeTriggers(state, etbTriggers, etbEvent);
        }
      }
    }

    // ── Damage effects ────────────────────────────────────────────────────────
    const damageResults = parseDamageFromEffect(item.effect, item.xValue);
    for (const dmg of damageResults) {
      const namedTarget = item.targets.length > 0 ? item.targets[0].name : null;
      const dmgTargetLabel = namedTarget ?? dmg.targetType;
      addLog(state, "game_event", item.controller,
        `${item.name} deals ${dmg.amount} damage to ${dmgTargetLabel}`,
        namedTarget ? undefined : item.requiresTarget ? "Target: any target (player, creature, or planeswalker) — controller must declare" : undefined,
        true
      );
      const dmgEvent: GameEvent = {
        id: generateId(),
        type: "deals_damage",
        timestamp: state.stepCount,
        sourceId: item.id,
        sourceName: item.name,
        sourceController: item.controller,
        data: { amount: dmg.amount, targetType: dmg.targetType },
      };
      state.eventLog.push(dmgEvent);
      const dmgTriggers = detectTriggers(state, dmgEvent);
      if (dmgTriggers.length > 0) {
        placeTriggers(state, dmgTriggers, dmgEvent);
      }
    }

    // ── Life gain effects ─────────────────────────────────────────────────────
    const lifeGain = parseLifeGainFromEffect(item.effect, item.xValue);
    if (lifeGain > 0) {
      const player = state.players[item.controller]!;
      player.life += lifeGain;
      addLog(state, "game_event", item.controller,
        `${player.label} gains ${lifeGain} life (now ${player.life})`,
        `From ${item.name}`,
        true
      );
      const lifeEvent: GameEvent = {
        id: generateId(),
        type: "life_gained",
        timestamp: state.stepCount,
        sourceController: item.controller,
        data: { amount: lifeGain, source: item.name },
      };
      state.eventLog.push(lifeEvent);
      const lifeTriggers = detectTriggers(state, lifeEvent);
      if (lifeTriggers.length > 0) {
        placeTriggers(state, lifeTriggers, lifeEvent);
      }
    }

    // ── Energy counter effects ────────────────────────────────────────────────
    const energyGained = parseEnergyFromEffect(item.effect);
    if (energyGained > 0) {
      const player = state.players[item.controller]!;
      player.energyCounters = (player.energyCounters ?? 0) + energyGained;
      addLog(state, "game_event", item.controller,
        `${player.label} gets ${energyGained} ⚡ (now ${player.energyCounters})`,
        `Energy from ${item.name}`,
        true
      );
    }

    // ── Amass effects ─────────────────────────────────────────────────────────
    const amassResult = parseAmassFromEffect(item.effect, item.xValue);
    if (amassResult) {
      // "they amass" / "that player amasses" means the event's source (e.g. drawing player for Bowmasters)
      const amassController =
        /\b(?:they|that player)\s+amass/i.test(item.effect ?? "") && item.eventSourceController
          ? item.eventSourceController
          : item.controller;
      handleAmass(state, amassController, amassResult.count, amassResult.type, item.name);
    }
  }

  // ── Transform effects from triggered abilities ────────────────────────────
  if (item.type === "triggered_ability" && item.effect && item.triggerSource) {
    const sourcePerm = state.battlefield.find(
      (p) => p.name === item.triggerSource || p.id === item.triggerSource
    );
    if (sourcePerm?.cardFaces) {
      applyTriggerTransformEffect(state, sourcePerm, item.effect);
    }
  }

  // Clear split second if the resolving spell had it
  if (item.hasSplitSecond) {
    state.priority.splitSecondActive = false;
  }

  return afterResolution(state, item);
}

function isPermamentSpell(spellType?: string): boolean {
  return ["creature", "artifact", "enchantment", "planeswalker", "land"].includes(
    spellType || ""
  );
}

function handlePermanentEnters(
  state: GameState,
  item: EngineStackItem
): void {
  const permId = generateId();

  // Parse triggers from oracle text so the permanent has its own triggered abilities
  const triggers = item.effect
    ? parseTriggersFromOracle(item.effect, permId, item.name, item.controller)
    : [];

  // Fix DFC face trigger sourceIds from "pending" → real permId
  const cardFaces = item.cardFaces
    ? item.cardFaces.map((face) => ({
        ...face,
        triggers: face.triggers.map((t) => ({ ...t, sourceId: permId })),
      })) as [CardFaceData, CardFaceData]
    : undefined;

  const permanent: Permanent = {
    id: permId,
    name: item.name,
    types: item.spellType ? [item.spellType as any] : [],
    controller: item.controller,
    owner: item.controller,
    basePower: item.basePower,
    baseToughness: item.baseToughness,
    currentPower: item.basePower,
    currentToughness: item.baseToughness,
    damageMarked: 0,
    keywords: [],
    triggers,
    tapped: false,
    summoningSick: true,
    counters: {},
    oracleText: item.effect,
    imageUri: item.imageUri,
    currentFace: cardFaces ? 0 : undefined,
    cardFaces,
    hasDayNightMechanic: item.hasDayNightMechanic || undefined,
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
  const etbTriggers = detectTriggers(state, etbEvent);
  if (etbTriggers.length > 0) {
    placeTriggers(state, etbTriggers, etbEvent);
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
        const toughness = perm.currentToughness ?? perm.baseToughness;

        // Only run SBA checks when toughness is known — avoid false deaths for
        // stack-resolved creatures whose stats weren't passed through.
        if (toughness === undefined) continue;

        // 0 or less toughness
        if (toughness <= 0) {
          toDestroy.push(perm);
          continue;
        }

        // Lethal damage check
        if (perm.damageMarked >= toughness) {
          if (!perm.keywords.includes("indestructible")) {
            toDestroy.push(perm);
          }
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
  if (!state.graveyards[permanent.owner]) state.graveyards[permanent.owner] = [];
  state.graveyards[permanent.owner]!.push(permanent.name);

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

function effectRequiresTarget(effect: string): boolean {
  if (!effect) return false;
  const lower = effect.toLowerCase();
  return (
    lower.includes("any target") ||
    lower.includes("target creature") ||
    lower.includes("target player") ||
    lower.includes("target opponent") ||
    lower.includes("target permanent") ||
    lower.includes("target artifact") ||
    lower.includes("target enchantment") ||
    lower.includes("target land") ||
    lower.includes("target spell")
  );
}

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

  // Extract X context from the event — e.g., number of tokens created
  let xContext: number | undefined;
  if (event.type === "tokens_created" && typeof event.data?.count === "number") {
    xContext = event.data.count as number;
  } else if (event.type === "deals_damage" && typeof event.data?.amount === "number") {
    xContext = event.data.amount as number;
  } else if (event.type === "cast_spell" && typeof event.data?.xValue === "number") {
    xContext = event.data.xValue as number;
  }

  for (const trigger of triggers) {
    const sourcePerm = state.battlefield.find((p) => p.id === trigger.sourceId)
      || state.battlefield.find((p) => p.name === trigger.sourceName);

    // Build effect text — substitute X context if available
    const effectWithX =
      xContext !== undefined && trigger.effect.toLowerCase().includes("x")
        ? `${trigger.effect} (X = ${xContext})`
        : trigger.effect;

    const stackItem: EngineStackItem = {
      id: generateId(),
      type: "triggered_ability",
      name: `${trigger.sourceName} trigger`,
      controller: trigger.controller,
      targets: [],
      triggerSource: trigger.sourceName,
      triggerEvent: trigger.event,
      effect: effectWithX,
      isManaAbility: false,
      hasSplitSecond: false,
      timestamp: state.stepCount,
      imageUri: sourcePerm?.imageUri,
      xValue: xContext,
      requiresTarget: effectRequiresTarget(effectWithX),
      eventSourceController: event.sourceController,
    };

    state.stack.push(stackItem);

    const causeLabel =
      event.type === "cast_spell"
        ? `caused by ${event.sourceName || "a spell"} being cast${xContext !== undefined ? ` (X = ${xContext})` : ""}`
      : event.type === "tokens_created"
        ? `caused by ${event.data?.count ?? "tokens"} token${(event.data?.count as number) !== 1 ? "s" : ""} being created by ${event.sourceName || "an effect"}`
      : event.type === "enters_battlefield"
        ? `caused by ${event.sourceName || "a permanent"} entering the battlefield`
      : event.type === "dies"
        ? `caused by ${event.sourceName || "a permanent"} dying`
      : event.type === "draw_card"
        ? `caused by ${event.sourceName || "a player"} drawing a card (draw #${event.data?.totalDrawnThisTurn ?? "?"})`
      : event.type === "deals_damage"
        ? `caused by ${event.sourceName || "a source"} dealing ${event.data?.amount ?? ""} damage`
      : event.type === "beginning_of_phase"
        ? `triggered at beginning of ${(event.data?.step as string) || "step"}`
      : event.type === "end_of_phase"
        ? `triggered at end of ${(event.data?.step as string) || "step"}`
      : event.type === "life_gained"
        ? `caused by life being gained`
      : `triggered by ${event.type}`;

    addLog(state, "trigger", trigger.controller,
      `${trigger.sourceName}'s ability triggers`,
      `Condition: ${trigger.condition || "Triggered"}\nEffect: ${effectWithX}\nCause: ${causeLabel}`,
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
    // End of turn — save spell count for day/night check next upkeep, reset counters
    state.spellsCastLastTurn = state.spellsCastThisTurn;
    state.spellsCastThisTurn = 0;
    state.cardsDrawnThisTurn = {};
    // Advance to next player
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

  // Day/Night check at the beginning of each upkeep
  if (state.currentStep === "upkeep") {
    checkDayNightAtUpkeep(state);
  }

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

  // Draw step: active player draws a card (fires draw_card triggers)
  if (state.currentStep === "draw") {
    const ap = state.activePlayer;
    const prevDrawn = state.cardsDrawnThisTurn[ap] ?? 0;
    const totalDrawn = prevDrawn + 1;
    state.cardsDrawnThisTurn[ap] = totalDrawn;

    const drawEvent: GameEvent = {
      id: generateId(),
      type: "draw_card",
      timestamp: state.stepCount,
      sourceController: ap,
      sourceName: state.players[ap]!.label,
      data: { drawNumber: 1, totalDrawnThisTurn: totalDrawn },
    };
    state.eventLog.push(drawEvent);
    addLog(state, "game_event", state.activePlayer,
      `${state.players[state.activePlayer]!.label} draws for turn`
    );

    const drawTriggers = detectTriggers(state, drawEvent);
    if (drawTriggers.length > 0) {
      placeTriggers(state, drawTriggers, drawEvent);
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
  const realId = generateId();
  const newPerm: Permanent = {
    ...permanent,
    id: realId,
    // Fix trigger sourceIds that were set to "pending" by cardToPermanent
    triggers: permanent.triggers.map((t) => ({
      ...t,
      sourceId: t.sourceId === "pending" ? realId : t.sourceId,
    })),
    // Fix DFC face trigger sourceIds too
    cardFaces: permanent.cardFaces
      ? permanent.cardFaces.map((face) => ({
          ...face,
          triggers: face.triggers.map((t) => ({
            ...t,
            sourceId: t.sourceId === "pending" ? realId : t.sourceId,
          })),
        })) as [CardFaceData, CardFaceData]
      : undefined,
  };
  state.battlefield.push(newPerm);
  addLog(state, "game_event", permanent.controller,
    `${permanent.name} added to the battlefield`
  );

  // Fire ETB event so landfall and other ETB triggers fire when permanents enter
  const primaryType = newPerm.types[0] as string | undefined;
  const etbEvent: GameEvent = {
    id: generateId(),
    type: "enters_battlefield",
    timestamp: state.stepCount,
    sourceId: newPerm.id,
    sourceName: newPerm.name,
    sourceController: newPerm.controller,
    data: { type: primaryType },
  };
  state.eventLog.push(etbEvent);
  const etbTriggers = detectTriggers(state, etbEvent);
  if (etbTriggers.length > 0) {
    placeTriggers(state, etbTriggers, etbEvent);
  }

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

// ─── Draw Card ───────────────────────────────────────────────────────────────

function handleDrawCard(
  state: GameState,
  player: PlayerId,
  count: number
): GameState {
  const playerObj = state.players[player]!;

  for (let i = 0; i < count; i++) {
    // Increment per-player draw counter for this turn
    const prevDrawn = state.cardsDrawnThisTurn[player] ?? 0;
    const totalDrawn = prevDrawn + 1;
    state.cardsDrawnThisTurn[player] = totalDrawn;

    addLog(state, "game_event", player,
      `${playerObj.label} draws a card`,
      undefined,
      true
    );

    // Fire draw_card event — this triggers Smothering Tithe, Consecrated Sphinx, Tamiyo, etc.
    const drawEvent: GameEvent = {
      id: generateId(),
      type: "draw_card",
      timestamp: state.stepCount,
      sourceController: player,
      sourceName: playerObj.label,
      data: { drawNumber: i + 1, totalDrawnThisTurn: totalDrawn },
    };
    state.eventLog.push(drawEvent);

    const triggers = detectTriggers(state, drawEvent);
    if (triggers.length > 0) {
      placeTriggers(state, triggers, drawEvent);
    }
  }

  return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Transform Helpers ────────────────────────────────────────────────────────

function applyTransformToPermanent(state: GameState, perm: Permanent): void {
  if (!perm.cardFaces || perm.cardFaces.length < 2) return;
  const newFaceIndex = (perm.currentFace === 0 ? 1 : 0) as 0 | 1;
  const newFace = perm.cardFaces[newFaceIndex];
  const oldName = perm.name;

  perm.currentFace = newFaceIndex;
  perm.name = newFace.name;
  perm.types = newFace.types;
  perm.oracleText = newFace.oracleText;
  perm.imageUri = newFace.imageUri;
  perm.basePower = newFace.basePower;
  perm.baseToughness = newFace.baseToughness;
  perm.currentPower = newFace.basePower;
  perm.currentToughness = newFace.baseToughness;
  perm.keywords = newFace.keywords;
  perm.triggers = newFace.triggers.map((t) => ({
    ...t,
    sourceId: perm.id,
    controller: perm.controller,
  }));

  addLog(state, "game_event", perm.controller,
    `${oldName} transforms into ${newFace.name}`,
    `Now showing: ${newFace.name} (face ${newFaceIndex + 1})`,
    true
  );
}

function handleTransformPermanent(state: GameState, permanentId: string): GameState {
  const perm = state.battlefield.find((p) => p.id === permanentId);
  if (!perm) return state;
  if (!perm.cardFaces) {
    addLog(state, "explanation", undefined,
      `${perm.name} is not a double-faced card.`
    );
    return state;
  }
  applyTransformToPermanent(state, perm);
  return state;
}

// ─── Counter + Transform Effect Parsing ──────────────────────────────────────

/** Parse "put a/N {type} counter(s) on" from a trigger effect. */
function parseCounterAddFromEffect(effect: string): { type: string; count: number } | null {
  const numWords: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const m = effect.match(/put\s+(\w+|\d+)\s+(\w+)\s+counters?\s+on\b/i);
  if (!m) return null;
  const rawCount = m[1].toLowerCase();
  const count = numWords[rawCount] ?? (parseInt(rawCount) || 1);
  return { type: m[2].toLowerCase(), count };
}

/** Parse "if there are N or more {type} counters … transform" (or "if [name] has N or more …") conditional. */
function parseConditionalTransform(
  effect: string
): { counterType: string; threshold: number; removeCounters: boolean } | null {
  const numWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  // "if there are N or more X counters … transform"
  let m = effect.match(
    /if\s+there\s+are\s+(\w+|\d+)\s+or\s+more\s+(\w+)\s+counters?[^,]*[\s\S]*?transform/i
  );
  // "if [permanent/it/this] has N or more X counters … transform"
  if (!m) {
    m = effect.match(
      /if\s+\w[\w,\s']*?\s+has\s+(\w+|\d+)\s+or\s+more\s+(\w+)\s+counters?[\s\S]*?transform/i
    );
  }
  if (!m) return null;
  const rawCount = m[1].toLowerCase();
  const threshold = numWords[rawCount] ?? (parseInt(rawCount) || 1);
  const counterType = m[2].toLowerCase();
  const removeCounters = /remove all/i.test(effect);
  return { counterType, threshold, removeCounters };
}

/**
 * Apply counter-add and conditional/unconditional transform from a trigger effect.
 * Called when a triggered_ability with transform text resolves.
 */
function applyTriggerTransformEffect(
  state: GameState,
  sourcePerm: Permanent,
  effect: string
): void {
  const counterAdd = parseCounterAddFromEffect(effect);

  if (counterAdd) {
    // Add counter(s) to the source permanent
    const prev = sourcePerm.counters[counterAdd.type] || 0;
    sourcePerm.counters[counterAdd.type] = prev + counterAdd.count;
    addLog(
      state,
      "game_event",
      sourcePerm.controller,
      `${sourcePerm.name} gets ${counterAdd.count} ${counterAdd.type} counter${counterAdd.count !== 1 ? "s" : ""} (${sourcePerm.counters[counterAdd.type]} total)`
    );

    // Check for conditional transform
    const cond = parseConditionalTransform(effect);
    if (cond && sourcePerm.counters[cond.counterType] >= cond.threshold) {
      if (cond.removeCounters) {
        delete sourcePerm.counters[cond.counterType];
        addLog(state, "game_event", sourcePerm.controller,
          `All ${cond.counterType} counters removed from ${sourcePerm.name}`
        );
      }
      applyTransformToPermanent(state, sourcePerm);
    }
  } else if (/\btransform\b/i.test(effect)) {
    // Unconditional transform (no counter condition)
    applyTransformToPermanent(state, sourcePerm);
  }
}

// ─── Day/Night Mechanic ───────────────────────────────────────────────────────

function applyDayNightChange(state: GameState, newState: "day" | "night"): void {
  state.dayNight = newState;
  addLog(state, "game_event", undefined,
    newState === "day" ? "It becomes Day" : "It becomes Night",
    newState === "day"
      ? "All nightbound permanents transform to their front face."
      : "All daybound permanents transform to their back face.",
    true
  );

  for (const perm of state.battlefield) {
    if (!perm.hasDayNightMechanic || !perm.cardFaces) continue;
    if (newState === "night" && perm.currentFace === 0) {
      applyTransformToPermanent(state, perm);
    } else if (newState === "day" && perm.currentFace === 1) {
      applyTransformToPermanent(state, perm);
    }
  }
}

function handleSetDayNight(
  state: GameState,
  newDayNight: "day" | "night" | null
): GameState {
  if (newDayNight === null) {
    state.dayNight = null;
    addLog(state, "game_event", undefined, "Day/Night state cleared.");
  } else {
    applyDayNightChange(state, newDayNight);
  }
  return state;
}

function checkDayNightAtUpkeep(state: GameState): void {
  if (state.dayNight === null) return;
  const count = state.spellsCastLastTurn;
  const playerLabel = state.players[state.activePlayer]!.label;

  if (state.dayNight === "day" && count === 0) {
    addLog(state, "explanation", undefined,
      `Day/Night: ${playerLabel} cast no spells last turn — it becomes Night`,
      "All daybound permanents transform."
    );
    applyDayNightChange(state, "night");
  } else if (state.dayNight === "night" && count >= 2) {
    addLog(state, "explanation", undefined,
      `Day/Night: ${playerLabel} cast ${count} spells last turn — it becomes Day`,
      "All nightbound permanents transform."
    );
    applyDayNightChange(state, "day");
  }
}

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
