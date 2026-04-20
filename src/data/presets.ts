import type { GameState, Permanent, EngineStackItem, PlayerId } from "@/engine/types";
import { createInitialState } from "@/engine/gameEngine";
import { generateId } from "@/engine/utils";

// ─── Scenario Preset Type ────────────────────────────────────────────────────

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  lesson: string; // Key takeaway
  setup: {
    battlefield: Omit<Permanent, "id">[];
    stackSequence: Omit<EngineStackItem, "id" | "timestamp">[];
    activePlayer: PlayerId;
    life?: { player_a?: number; player_b?: number };
    step?: GameState["currentStep"];
  };
}

// ─── Helper to build permanents concisely ────────────────────────────────────

function creature(
  name: string,
  controller: PlayerId,
  power: number,
  toughness: number,
  opts?: {
    keywords?: Permanent["keywords"];
    triggers?: Permanent["triggers"];
    oracleText?: string;
  }
): Omit<Permanent, "id"> {
  return {
    name,
    types: ["creature"],
    controller,
    owner: controller,
    basePower: power,
    baseToughness: toughness,
    currentPower: power,
    currentToughness: toughness,
    damageMarked: 0,
    keywords: opts?.keywords || [],
    triggers: opts?.triggers || [],
    tapped: false,
    summoningSick: false,
    counters: {},
    oracleText: opts?.oracleText,
  };
}

function enchantment(
  name: string,
  controller: PlayerId,
  opts?: {
    triggers?: Permanent["triggers"];
    oracleText?: string;
  }
): Omit<Permanent, "id"> {
  return {
    name,
    types: ["enchantment"],
    controller,
    owner: controller,
    damageMarked: 0,
    keywords: [],
    triggers: opts?.triggers || [],
    tapped: false,
    summoningSick: false,
    counters: {},
    oracleText: opts?.oracleText,
  };
}

function spell(
  name: string,
  controller: PlayerId,
  spellType: EngineStackItem["spellType"],
  target: string,
  effect: string
): Omit<EngineStackItem, "id" | "timestamp"> {
  return {
    type: "spell",
    spellType,
    name,
    controller,
    targets: target
      ? [{ type: "permanent", id: "target", name: target, isLegal: true }]
      : [],
    effect,
    isManaAbility: false,
    hasSplitSecond: false,
  };
}

function trigger(
  name: string,
  controller: PlayerId,
  source: string,
  effect: string
): Omit<EngineStackItem, "id" | "timestamp"> {
  return {
    type: "triggered_ability",
    name: `${source} trigger`,
    controller,
    targets: [],
    triggerSource: source,
    effect,
    isManaAbility: false,
    hasSplitSecond: false,
  };
}

// ─── Scenario Presets ────────────────────────────────────────────────────────

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "counterspell_war",
    name: "Counterspell War",
    description: "A chain of counters targeting each other — classic control mirror.",
    category: "Counter Magic",
    lesson:
      "The stack resolves Last-In, First-Out. The last counter cast resolves first, protecting or destroying the spells below it.",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [],
      stackSequence: [
        spell("Lightning Bolt", "player_a", "instant", "Player B", "Deal 3 damage to Player B."),
        spell("Counterspell", "player_b", "instant", "Lightning Bolt", "Counter target spell."),
        spell("Dispel", "player_a", "instant", "Counterspell", "Counter target instant spell."),
      ],
    },
  },
  {
    id: "combat_trick",
    name: "Combat Trick Battle",
    description: "Pump spells and removal fight over a blocking creature during combat.",
    category: "Combat",
    lesson:
      "Damage is marked, not subtracted from toughness. A creature that gets +3/+3 after taking 3 damage survives — it's now a 6/6 with 3 damage marked (3 < 6).",
    setup: {
      activePlayer: "player_a",
      step: "declare_blockers",
      battlefield: [
        creature("Tarmogoyf", "player_a", 4, 4, {}),
        creature("Courser of Kruphix", "player_b", 3, 3, {}),
      ],
      stackSequence: [
        spell("Giant Growth", "player_b", "instant", "Courser of Kruphix", "Target creature gets +3/+3 until end of turn."),
        spell("Lightning Bolt", "player_a", "instant", "Courser of Kruphix", "Deal 3 damage to target creature."),
      ],
    },
  },
  {
    id: "etb_removal",
    name: "ETB + Removal",
    description: "Killing a creature in response to its enter-the-battlefield trigger.",
    category: "Triggered Abilities",
    lesson:
      "Triggered abilities exist independently on the stack. Destroying the source does NOT counter the trigger. The ETB still resolves.",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [],
      stackSequence: [
        spell("Snapcaster Mage", "player_a", "creature", "", "Flash. When Snapcaster Mage enters the battlefield, target instant or sorcery in your graveyard gains flashback."),
        trigger("Snapcaster ETB", "player_a", "Snapcaster Mage", "Target instant or sorcery in your graveyard gains flashback until end of turn."),
        spell("Fatal Push", "player_b", "instant", "Snapcaster Mage", "Destroy target creature with mana value 2 or less."),
      ],
    },
  },
  {
    id: "wrath_triggers",
    name: "Board Wipe + Death Triggers",
    description: "Blood Artist and Zulaport Cutthroat both die to Wrath of God — but their triggers still fire.",
    category: "Triggered Abilities",
    lesson:
      "Creatures that die simultaneously still see each other die. Death triggers use APNAP ordering: active player's triggers go on the stack first (resolve last).",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [
        creature("Blood Artist", "player_a", 0, 1, {
          oracleText: "Whenever Blood Artist or another creature dies, target opponent loses 1 life and you gain 1 life.",
          triggers: [
            {
              id: "ba-dies",
              event: "dies",
              condition: "Whenever a creature dies",
              effect: "target opponent loses 1 life and you gain 1 life",
              sourceId: "",
              sourceName: "Blood Artist",
              controller: "player_a",
            },
          ],
        }),
        creature("Zulaport Cutthroat", "player_b", 1, 1, {
          oracleText: "Whenever Zulaport Cutthroat or another creature you control dies, each opponent loses 1 life and you gain 1 life.",
          triggers: [
            {
              id: "zc-dies",
              event: "dies",
              condition: "Whenever a creature dies",
              effect: "each opponent loses 1 life and you gain 1 life",
              sourceId: "",
              sourceName: "Zulaport Cutthroat",
              controller: "player_b",
            },
          ],
        }),
        creature("Grizzly Bears", "player_a", 2, 2, {}),
      ],
      stackSequence: [
        spell("Wrath of God", "player_a", "sorcery", "", "Destroy all creatures. They can't be regenerated."),
      ],
    },
  },
  {
    id: "hexproof_vs_wrath",
    name: "Hexproof vs. Board Wipe",
    description: "Does hexproof save your creature from Wrath of God?",
    category: "Keywords",
    lesson:
      "Hexproof prevents targeting. Board wipes don't target — they say 'all creatures.' Hexproof does nothing here. You need indestructible.",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [
        creature("Slippery Bogle", "player_b", 1, 1, {
          keywords: ["hexproof"],
        }),
        creature("Goblin Guide", "player_a", 2, 2, { keywords: ["haste"] }),
      ],
      stackSequence: [
        spell("Wrath of God", "player_a", "sorcery", "", "Destroy all creatures. They can't be regenerated."),
      ],
    },
  },
  {
    id: "deathtouch_trample",
    name: "Deathtouch + Trample",
    description: "How deathtouch interacts with trample damage assignment.",
    category: "Keywords",
    lesson:
      "With deathtouch + trample, you only need to assign 1 damage to each blocker (since 1 is lethal with deathtouch). The rest tramples through to the player.",
    setup: {
      activePlayer: "player_a",
      step: "declare_blockers",
      battlefield: [
        creature("Questing Beast", "player_a", 4, 4, {
          keywords: ["deathtouch", "trample", "vigilance", "haste"],
        }),
        creature("Wall of Omens", "player_b", 0, 4, {
          keywords: ["defender"],
        }),
      ],
      stackSequence: [],
    },
  },
  {
    id: "split_second",
    name: "Split Second",
    description: "Krosan Grip has split second — can your opponent respond?",
    category: "Stack & Priority",
    lesson:
      "Split second prevents players from casting spells or activating abilities (except mana abilities) while it's on the stack. Triggered abilities still trigger normally.",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [
        enchantment("Rhystic Study", "player_b", {
          oracleText: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
        }),
      ],
      stackSequence: [
        {
          type: "spell",
          spellType: "instant",
          name: "Krosan Grip",
          controller: "player_a",
          targets: [
            {
              type: "permanent",
              id: "target",
              name: "Rhystic Study",
              isLegal: true,
            },
          ],
          effect: "Destroy target artifact or enchantment.",
          isManaAbility: false,
          hasSplitSecond: true,
        },
      ],
    },
  },
];

export const PRESET_CATEGORIES = [
  ...new Set(SCENARIO_PRESETS.map((s) => s.category)),
];

// ─── Load Preset into GameState ──────────────────────────────────────────────

export function loadPreset(preset: ScenarioPreset, format?: string): GameState {
  const state = createInitialState({
    activePlayer: preset.setup.activePlayer,
    format: format || "modern",
  });

  // Set step
  if (preset.setup.step) {
    state.currentStep = preset.setup.step;
  }

  // Set life totals
  if (preset.setup.life?.player_a !== undefined && state.players.player_a) {
    state.players.player_a.life = preset.setup.life.player_a;
  }
  if (preset.setup.life?.player_b !== undefined && state.players.player_b) {
    state.players.player_b.life = preset.setup.life.player_b;
  }

  // Add permanents to battlefield
  for (const perm of preset.setup.battlefield) {
    const id = generateId();
    state.battlefield.push({
      ...perm,
      id,
      triggers: perm.triggers.map((t) => ({ ...t, sourceId: id })),
    });
  }

  // Add stack items (in order — first item is bottom of stack)
  for (const item of preset.setup.stackSequence) {
    state.stack.push({
      ...item,
      id: generateId(),
      timestamp: state.stepCount++,
    });
  }

  // Log the scenario setup
  state.actionLog.push({
    id: generateId(),
    timestamp: 0,
    type: "explanation",
    text: `Scenario: ${preset.name}`,
    detail: preset.description,
    highlight: true,
  });

  if (preset.setup.battlefield.length > 0) {
    state.actionLog.push({
      id: generateId(),
      timestamp: 0,
      type: "game_event",
      text: `Board: ${preset.setup.battlefield.map((p) => p.name).join(", ")}`,
    });
  }

  if (preset.setup.stackSequence.length > 0) {
    state.actionLog.push({
      id: generateId(),
      timestamp: 0,
      type: "explanation",
      text: `Stack has ${preset.setup.stackSequence.length} item${preset.setup.stackSequence.length > 1 ? "s" : ""} — resolve by passing priority`,
      detail: "Both players must pass priority for the top item to resolve (LIFO).",
    });
  }

  // Set priority to active player
  state.priority.priorityHolder = preset.setup.activePlayer;

  return state;
}
