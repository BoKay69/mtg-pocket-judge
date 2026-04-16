import type { StackScenario } from "@/types";

export const STACK_SCENARIOS: StackScenario[] = [
  {
    id: "counterspell_war",
    name: "Counterspell War",
    description: "A chain of counters targeting each other — classic control mirror",
    category: "Counter Magic",
    steps: [
      {
        id: "1",
        card: "Lightning Bolt",
        owner: "Player A",
        type: "instant",
        target: "Player B (3 damage)",
        color: "#dc2626",
      },
      {
        id: "2",
        card: "Counterspell",
        owner: "Player B",
        type: "instant",
        target: "Lightning Bolt",
        color: "#2563eb",
      },
      {
        id: "3",
        card: "Dispel",
        owner: "Player A",
        type: "instant",
        target: "Counterspell",
        color: "#7c3aed",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Dispel resolves → Counterspell is countered. It goes to Player B's graveyard without effect.",
        itemId: "3",
      },
      {
        step: 2,
        text: "Lightning Bolt resolves → Player B takes 3 damage. Bolt goes to Player A's graveyard.",
        itemId: "1",
      },
    ],
  },
  {
    id: "combat_trick",
    name: "Combat Trick Battle",
    description: "Dueling pump spells and removal during the combat damage step",
    category: "Combat",
    steps: [
      {
        id: "1",
        card: "Declare Blockers",
        owner: "Player A",
        type: "phase",
        target: "3/3 blocks 4/4",
        color: "#737373",
      },
      {
        id: "2",
        card: "Giant Growth (+3/+3)",
        owner: "Player B",
        type: "instant",
        target: "Blocking 3/3",
        color: "#16a34a",
      },
      {
        id: "3",
        card: "Lightning Bolt (3 dmg)",
        owner: "Player A",
        type: "instant",
        target: "Blocking 3/3",
        color: "#dc2626",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Lightning Bolt resolves → The 3/3 now has 3 damage marked on it. (3 damage marked, 3 toughness = lethal... but Giant Growth hasn't resolved yet!)",
        itemId: "3",
      },
      {
        step: 2,
        text: "Giant Growth resolves → The 3/3 becomes a 6/6 with 3 damage marked. It survives! (3 damage < 6 toughness)",
        itemId: "2",
      },
      {
        step: 3,
        text: "Combat damage step → The 6/6 deals 6 damage to the 4/4 (killed). The 4/4 deals 4 damage to the 6/6. The 6/6 now has 7 total damage marked (3 from Bolt + 4 from combat) which exceeds its 6 toughness → it dies too.",
      },
    ],
  },
  {
    id: "etb_removal",
    name: "ETB + Removal Response",
    description: "Killing a creature doesn't stop its enter-the-battlefield trigger",
    category: "Triggered Abilities",
    steps: [
      {
        id: "1",
        card: "Snapcaster Mage",
        owner: "Player A",
        type: "creature",
        target: "Enters the battlefield",
        color: "#2563eb",
      },
      {
        id: "2",
        card: "ETB Trigger",
        owner: "Player A",
        type: "triggered",
        target: "Give Lightning Bolt flashback",
        color: "#60a5fa",
      },
      {
        id: "3",
        card: "Fatal Push",
        owner: "Player B",
        type: "instant",
        target: "Snapcaster Mage",
        color: "#171717",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Fatal Push resolves → Snapcaster Mage dies and goes to Player A's graveyard.",
        itemId: "3",
      },
      {
        step: 2,
        text: "Snapcaster's ETB trigger STILL resolves — triggered abilities are independent of their source once on the stack. Killing the creature doesn't counter the trigger.",
        itemId: "2",
      },
      {
        step: 3,
        text: "Lightning Bolt in Player A's graveyard gains flashback. Player A can cast it from the graveyard this turn.",
      },
    ],
  },
  {
    id: "wrath_triggers",
    name: "Board Wipe Triggers",
    description: "Multiple death triggers from a mass removal spell",
    category: "Triggered Abilities",
    steps: [
      {
        id: "1",
        card: "Wrath of God",
        owner: "Player A",
        type: "sorcery",
        target: "Destroy all creatures",
        color: "#eab308",
      },
      {
        id: "2",
        card: "Blood Artist × 3 triggers",
        owner: "Player A",
        type: "triggered",
        target: "Drain 1 per death (including itself)",
        color: "#991b1b",
      },
      {
        id: "3",
        card: "Zulaport Cutthroat × 3 triggers",
        owner: "Player B",
        type: "triggered",
        target: "Drain 1 per death (including itself)",
        color: "#4c1d95",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Wrath of God resolves → ALL creatures are destroyed simultaneously (including Blood Artist and Zulaport Cutthroat). They all see each other die.",
        itemId: "1",
      },
      {
        step: 2,
        text: "Both players' death triggers go on the stack. Active player (A) puts Blood Artist triggers on the stack FIRST, then Player B puts Zulaport Cutthroat triggers on top.",
      },
      {
        step: 3,
        text: "Zulaport Cutthroat triggers resolve first (they're on top). Player B drains Player A for each creature that died.",
        itemId: "3",
      },
      {
        step: 4,
        text: "Blood Artist triggers resolve. Player A drains Player B for each creature that died. Final life totals depend on creature count.",
        itemId: "2",
      },
    ],
  },
  {
    id: "protection_nuance",
    name: "Protection vs. Board Wipes",
    description: "What protection actually prevents (DEBT)",
    category: "Keywords",
    steps: [
      {
        id: "1",
        card: "Wrath of God",
        owner: "Player A",
        type: "sorcery",
        target: "Destroy all creatures",
        color: "#eab308",
      },
      {
        id: "2",
        card: "Kor Firewalker",
        owner: "Player B",
        type: "creature",
        target: "Has Protection from Red",
        color: "#f5f5f4",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Wrath of God is WHITE, not red. Protection from Red is irrelevant. But wait — Wrath doesn't target anyway! Protection from Red prevents: Damage from red sources, Enchanting/Equipping by red, Blocking by red creatures, and Targeting by red spells (D.E.B.T.).",
      },
      {
        step: 2,
        text: "Wrath of God resolves → Kor Firewalker IS destroyed. Wrath doesn't target, and it's not a red source. Protection from Red doesn't help here.",
      },
      {
        step: 3,
        text: "Key lesson: Protection uses D.E.B.T. — Damage, Enchant/Equip, Block, Target. Board wipes that say 'destroy all' don't do any of these things. An indestructible creature would survive instead.",
      },
    ],
  },
  {
    id: "layers_anthem",
    name: "Anthem + Removal Timing",
    description: "How continuous effects interact with state-based actions",
    category: "Rules Deep Dive",
    steps: [
      {
        id: "1",
        card: "Glorious Anthem",
        owner: "Player A",
        type: "static",
        target: "Your creatures get +1/+1",
        color: "#f5f5f4",
      },
      {
        id: "2",
        card: "1/1 Soldier Token",
        owner: "Player A",
        type: "creature",
        target: "Currently 2/2 (with anthem)",
        color: "#f5f5f4",
      },
      {
        id: "3",
        card: "Disenchant",
        owner: "Player B",
        type: "instant",
        target: "Glorious Anthem",
        color: "#f5f5f4",
      },
      {
        id: "4",
        card: "Shock (2 damage)",
        owner: "Player B",
        type: "instant",
        target: "1/1 Soldier Token",
        color: "#dc2626",
      },
    ],
    resolution: [
      {
        step: 1,
        text: "Shock resolves → The Soldier (currently 2/2 from anthem) takes 2 damage. 2 damage marked on a 2/2. State-based actions check — 2 ≥ 2, lethal! But wait...",
        itemId: "4",
      },
      {
        step: 2,
        text: "Actually, the anthem is still on the battlefield when Shock resolves, so the token IS a 2/2 with 2 damage marked. State-based actions destroy it. It dies NOW, before Disenchant resolves.",
        itemId: "4",
      },
      {
        step: 3,
        text: "Disenchant resolves → Glorious Anthem is destroyed. If the Soldier had survived (say only 1 damage from Shock), it would become a 1/1 with 1 damage and die from state-based actions at this point.",
        itemId: "3",
      },
    ],
  },
];

export const SCENARIO_CATEGORIES = [
  ...new Set(STACK_SCENARIOS.map((s) => s.category)),
];
