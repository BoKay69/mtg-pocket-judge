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

// Scryfall direct image URL — no API call needed, redirects to CDN
function scryfallImage(cardName: string): string {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&format=image&version=normal`;
}

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
    imageUri: scryfallImage(name),
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
    imageUri: scryfallImage(name),
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
    imageUri: scryfallImage(name),
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
    imageUri: scryfallImage(source),
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
    description: "Snapcaster Mage has resolved and entered the battlefield. Its ETB trigger is on the stack. Player 2 responds with Fatal Push — does the trigger still resolve?",
    category: "Triggered Abilities",
    lesson:
      "Triggered abilities exist independently on the stack. Destroying the source does NOT counter the trigger. Even though Snapcaster Mage dies, its ETB ability still resolves and grants flashback.",
    setup: {
      activePlayer: "player_a",
      step: "main",
      battlefield: [
        creature("Snapcaster Mage", "player_a", 2, 1, {
          oracleText: "Flash\nWhen Snapcaster Mage enters the battlefield, target instant or sorcery card in your graveyard gains flashback until end of turn.",
        }),
      ],
      stackSequence: [
        trigger("Snapcaster ETB", "player_a", "Snapcaster Mage", "Target instant or sorcery card in your graveyard gains flashback until end of turn."),
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
          imageUri: scryfallImage("Krosan Grip"),
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

// ─── Async Image Loader for Presets ──────────────────────────────────────────

/**
 * After loading a preset, fetch card images from Scryfall for all
 * cards on the battlefield and stack. Returns an updated GameState
 * with imageUri populated on permanents, stack items, and triggers.
 */
export async function hydratePresetImages(state: GameState): Promise<GameState> {
  // Collect all unique card names from battlefield and stack
  const cardNames = new Set<string>();

  for (const perm of state.battlefield) {
    cardNames.add(perm.name);
  }
  for (const item of state.stack) {
    // For stack items, extract the base card name (remove " trigger" suffix)
    const name = item.triggerSource || item.name.replace(/ trigger$/i, "");
    cardNames.add(name);
  }

  if (cardNames.size === 0) return state;

  // Fetch all cards from Scryfall (with rate limiting)
  const imageMap = new Map<string, string>();

  for (const name of cardNames) {
    try {
      // Small delay to respect Scryfall rate limits
      await new Promise((r) => setTimeout(r, 80));
      const res = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
      );
      if (res.ok) {
        const card = await res.json();
        const imageUri = card.image_uris?.normal || card.image_uris?.small;
        if (imageUri) {
          imageMap.set(name, imageUri);
        }
        // Also store oracle text for better trigger parsing
        if (card.oracle_text) {
          // Re-parse triggers with real oracle text for battlefield permanents
          for (const perm of state.battlefield) {
            if (perm.name === name && !perm.oracleText) {
              perm.oracleText = card.oracle_text;
              // Re-parse triggers from real oracle text
              const { parseTriggersFromOracle } = await import("@/engine/triggers");
              perm.triggers = parseTriggersFromOracle(
                card.oracle_text,
                perm.id,
                perm.name,
                perm.controller
              );
              // Extract keywords
              if (card.keywords) {
                const kwMap: Record<string, string> = {
                  deathtouch: "deathtouch", defender: "defender", "double strike": "double_strike",
                  "first strike": "first_strike", flash: "flash", flying: "flying", haste: "haste",
                  hexproof: "hexproof", indestructible: "indestructible", lifelink: "lifelink",
                  menace: "menace", reach: "reach", trample: "trample", vigilance: "vigilance",
                };
                for (const kw of card.keywords) {
                  const mapped = kwMap[kw.toLowerCase()];
                  if (mapped && !perm.keywords.includes(mapped as any)) {
                    perm.keywords.push(mapped as any);
                  }
                }
              }
              // Set P/T from Scryfall if not already set
              if (card.power && perm.basePower === undefined) {
                perm.basePower = parseInt(card.power) || 0;
                perm.baseToughness = parseInt(card.toughness) || 0;
                perm.currentPower = perm.basePower;
                perm.currentToughness = perm.baseToughness;
              }
            }
          }
        }
      }
    } catch {
      // Skip failed fetches — card will just show placeholder
    }
  }

  // Patch images into battlefield permanents
  for (const perm of state.battlefield) {
    const img = imageMap.get(perm.name);
    if (img) perm.imageUri = img;
  }

  // Patch images into stack items
  for (const item of state.stack) {
    const baseName = item.triggerSource || item.name.replace(/ trigger$/i, "");
    const img = imageMap.get(baseName);
    if (img) item.imageUri = img;
  }

  return state;
}
