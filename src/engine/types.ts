// ─── Players ─────────────────────────────────────────────────────────────────

export type PlayerId = "player_a" | "player_b" | "player_c" | "player_d";

export const ALL_PLAYER_IDS: PlayerId[] = ["player_a", "player_b", "player_c", "player_d"];
export const TWO_PLAYER_IDS: PlayerId[] = ["player_a", "player_b"];

export interface Player {
  id: PlayerId;
  label: string;
  life: number;
  energyCounters: number;
}

// ─── Turn Structure ──────────────────────────────────────────────────────────

export type TurnPhase =
  | "beginning"
  | "precombat_main"
  | "combat"
  | "postcombat_main"
  | "ending";

export type TurnStep =
  | "untap"
  | "upkeep"
  | "draw"
  | "main"
  | "begin_combat"
  | "declare_attackers"
  | "declare_blockers"
  | "first_strike_damage"
  | "combat_damage"
  | "end_combat"
  | "main_2"
  | "end_step"
  | "cleanup";

export const TURN_STEP_ORDER: TurnStep[] = [
  "untap",
  "upkeep",
  "draw",
  "main",
  "begin_combat",
  "declare_attackers",
  "declare_blockers",
  "first_strike_damage",
  "combat_damage",
  "end_combat",
  "main_2",
  "end_step",
  "cleanup",
];

export const STEP_LABELS: Record<TurnStep, string> = {
  untap: "Untap Step",
  upkeep: "Upkeep",
  draw: "Draw Step",
  main: "Pre-combat Main Phase",
  begin_combat: "Beginning of Combat",
  declare_attackers: "Declare Attackers",
  declare_blockers: "Declare Blockers",
  first_strike_damage: "First Strike Damage",
  combat_damage: "Combat Damage",
  end_combat: "End of Combat",
  main_2: "Post-combat Main Phase",
  end_step: "End Step",
  cleanup: "Cleanup Step",
};

// Steps where players receive priority
export const PRIORITY_STEPS: TurnStep[] = [
  "upkeep",
  "draw",
  "main",
  "begin_combat",
  "declare_attackers",
  "declare_blockers",
  "first_strike_damage",
  "combat_damage",
  "end_combat",
  "main_2",
  "end_step",
];

// ─── Keywords & Abilities ────────────────────────────────────────────────────

export type KeywordAbility =
  | "deathtouch"
  | "defender"
  | "double_strike"
  | "first_strike"
  | "flash"
  | "flying"
  | "haste"
  | "hexproof"
  | "indestructible"
  | "lifelink"
  | "menace"
  | "reach"
  | "shroud"
  | "trample"
  | "vigilance"
  | "ward";

// ─── Trigger Types ───────────────────────────────────────────────────────────

export type TriggerEvent =
  | "enters_battlefield"
  | "leaves_battlefield"
  | "dies"
  | "cast_spell"
  | "deals_damage"
  | "dealt_damage"
  | "attacks"
  | "blocks"
  | "beginning_of_phase"
  | "end_of_phase"
  | "life_gained"
  | "life_lost"
  | "counter_added"
  | "tapped"
  | "untapped"
  | "targeted"
  | "draw_card"
  | "discard"
  | "tokens_created";

export interface TriggerDefinition {
  id: string;
  event: TriggerEvent;
  condition?: string; // Human-readable condition, e.g. "a creature"
  effect: string; // Human-readable effect, e.g. "gain 1 life"
  sourceId: string; // ID of the permanent that has this trigger
  sourceName: string;
  controller: PlayerId;
}

// ─── Transform / DFC ─────────────────────────────────────────────────────────

export interface CardFaceData {
  name: string;
  types: PermanentType[];
  oracleText?: string;
  imageUri?: string;
  basePower?: number;
  baseToughness?: number;
  keywords: KeywordAbility[];
  triggers: TriggerDefinition[];
}

// ─── Permanents ──────────────────────────────────────────────────────────────

export type PermanentType =
  | "creature"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "land";

export interface Permanent {
  id: string;
  name: string;
  types: PermanentType[];
  controller: PlayerId;
  owner: PlayerId;
  basePower?: number;
  baseToughness?: number;
  currentPower?: number;
  currentToughness?: number;
  damageMarked: number;
  keywords: KeywordAbility[];
  triggers: TriggerDefinition[];
  tapped: boolean;
  summoningSick: boolean;
  counters: Record<string, number>; // e.g. { "+1/+1": 2 }
  attachedTo?: string; // ID of permanent this is attached to
  oracleText?: string;
  imageUri?: string;
  isToken?: boolean;
  // Transform / DFC
  currentFace?: 0 | 1;
  cardFaces?: [CardFaceData, CardFaceData];
  hasDayNightMechanic?: boolean;
}

// ─── Stack Items ─────────────────────────────────────────────────────────────

export type EngineStackItemType =
  | "spell"
  | "activated_ability"
  | "triggered_ability";

export type SpellType =
  | "instant"
  | "sorcery"
  | "creature"
  | "artifact"
  | "enchantment"
  | "planeswalker"
  | "land";

export interface EngineStackItem {
  id: string;
  type: EngineStackItemType;
  spellType?: SpellType;
  name: string;
  controller: PlayerId;
  targets: StackTarget[];
  triggerSource?: string; // Name of permanent that created this trigger
  triggerEvent?: TriggerEvent;
  effect?: string; // Description of what this does when it resolves
  isManaAbility: boolean;
  hasSplitSecond: boolean;
  timestamp: number; // For ordering
  imageUri?: string; // Scryfall card image
  hasXCost?: boolean; // True if this spell/ability has {X} in its cost
  xValue?: number; // The chosen value of X (for X spells) or inherited context (for X-based triggers)
  basePower?: number; // For creature spells — carried through to the Permanent on resolution
  baseToughness?: number;
  // Storm fields
  hasStorm?: boolean; // Spell has the storm keyword
  priorStormCount?: number; // Spells cast this turn before the current stack (user-provided for storm count)
  stormCount?: number; // Total storm count stored on the storm triggered-ability item
  stormOriginalItem?: Omit<EngineStackItem, "id" | "timestamp" | "stormOriginalItem">; // Original spell snapshot for copying
  isStormCopy?: boolean; // True if this item was created by storm
  stormCopyIndex?: number; // Which copy number (1-based)
  // DFC / Transform data (carried for permanent spells that resolve onto battlefield)
  cardFaces?: [CardFaceData, CardFaceData];
  hasDayNightMechanic?: boolean;
}

export interface StackTarget {
  type: "player" | "permanent" | "spell" | "card_in_zone";
  id: string;
  name: string;
  isLegal: boolean; // Tracks if target is still valid
}

// ─── Game Events ─────────────────────────────────────────────────────────────

export interface GameEvent {
  id: string;
  type: TriggerEvent;
  timestamp: number;
  sourceId?: string;
  sourceName?: string;
  sourceController?: PlayerId;
  targetId?: string;
  targetName?: string;
  data?: Record<string, unknown>; // Extra data (damage amount, etc.)
}

// ─── Priority State ──────────────────────────────────────────────────────────

export type PriorityState =
  | "waiting_for_action" // A player has priority and must decide
  | "resolving" // Top of stack is resolving
  | "checking_state_based" // Checking SBAs after resolution
  | "checking_triggers" // Checking for new triggers
  | "advancing_phase" // Stack empty, both passed, advancing
  | "game_over";

export interface PriorityInfo {
  state: PriorityState;
  activePlayer: PlayerId; // Whose turn it is
  priorityHolder: PlayerId; // Who currently holds priority
  hasPassed: Partial<Record<PlayerId, boolean>>; // Who has passed since last stack change
  splitSecondActive: boolean; // True if a split second spell is on stack
  playerOrder: PlayerId[]; // Turn order (2 for normal, 4 for commander)
}

// ─── Action Log ──────────────────────────────────────────────────────────────

export type LogEntryType =
  | "cast_spell"
  | "activate_ability"
  | "trigger"
  | "resolve"
  | "counter"
  | "fizzle"
  | "priority_pass"
  | "priority_receive"
  | "phase_change"
  | "state_based_action"
  | "game_event"
  | "explanation";

export interface LogEntry {
  id: string;
  timestamp: number;
  type: LogEntryType;
  player?: PlayerId;
  text: string;
  detail?: string; // Expanded explanation
  relatedStackItemId?: string;
  highlight?: boolean; // Whether this entry should be visually emphasized
}

// ─── Complete Game State ─────────────────────────────────────────────────────

export interface GameState {
  // Players
  players: Partial<Record<PlayerId, Player>>;
  playerOrder: PlayerId[]; // Which players are in this game

  // Turn info
  turnNumber: number;
  activePlayer: PlayerId;
  currentStep: TurnStep;

  // Zones
  battlefield: Permanent[];
  stack: EngineStackItem[];
  graveyards: Partial<Record<PlayerId, string[]>>; // Card names for display
  exile: string[];

  // Priority system
  priority: PriorityInfo;

  // Event and trigger queues
  pendingTriggers: TriggerDefinition[];
  eventLog: GameEvent[];

  // Action log for display
  actionLog: LogEntry[];

  // Metadata
  stepCount: number; // Total actions taken, for timestamps
  format: string; // "standard", "commander", etc.

  // Day/Night mechanic
  dayNight: "day" | "night" | null;
  spellsCastThisTurn: number;
  spellsCastLastTurn: number;
}

// ─── User Actions ────────────────────────────────────────────────────────────

export type UserAction =
  | { type: "cast_spell"; spell: Omit<EngineStackItem, "id" | "timestamp"> }
  | { type: "activate_ability"; ability: Omit<EngineStackItem, "id" | "timestamp"> }
  | { type: "pass_priority" }
  | { type: "advance_phase" }
  | { type: "add_permanent"; permanent: Omit<Permanent, "id"> }
  | { type: "remove_permanent"; permanentId: string }
  | { type: "set_life"; player: PlayerId; amount: number }
  | { type: "deal_damage"; targetId: string; amount: number; sourceId?: string }
  | { type: "draw_card"; player: PlayerId; count?: number }
  | { type: "transform_permanent"; permanentId: string }
  | { type: "set_day_night"; state: "day" | "night" | null }
  | { type: "undo" };
