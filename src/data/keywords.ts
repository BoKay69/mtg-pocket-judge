import type { KeywordEntry, KeywordCategory } from "@/types";

export const KEYWORDS: Record<KeywordCategory, KeywordEntry[]> = {
  Evergreen: [
    {
      name: "Deathtouch",
      rule: "Any amount of damage this deals to a creature is enough to destroy it.",
      example:
        "A 1/1 with deathtouch assigns 1 damage to a 10/10 in combat — that's lethal.",
      tip: "Deathtouch + trample: you only need to assign 1 damage to each blocker, the rest tramples over. This is one of the most misunderstood interactions in MTG.",
      related: ["First Strike", "Trample", "Indestructible"],
    },
    {
      name: "Defender",
      rule: "This creature can't attack.",
      example:
        "Wall of Omens has defender — it cannot be declared as an attacker.",
      tip: "Some cards like Arcades, the Strategist or Assault Formation let creatures with defender attack. The keyword only prevents declaring as an attacker — it doesn't prevent dealing damage in other ways.",
      related: [],
    },
    {
      name: "Double Strike",
      rule: "This creature deals both first-strike and regular combat damage.",
      example:
        "A 2/2 with double strike deals 2 in the first-strike step AND 2 more in the regular damage step, for 4 total.",
      tip: "Double strike is devastating with pump spells and equipment. A Boros Charm giving +4/+0 to a double striker effectively gives +8 combat damage.",
      related: ["First Strike"],
    },
    {
      name: "First Strike",
      rule: "This creature deals combat damage before creatures without first strike.",
      example:
        "A 2/2 with first strike kills a 3/2 without first strike before the 3/2 can deal damage back.",
      tip: "If both creatures have first strike (or both have double strike), they deal damage simultaneously in the first-strike damage step. A creature with first strike vs double strike still only deals damage once.",
      related: ["Double Strike"],
    },
    {
      name: "Flash",
      rule: "You may cast this spell any time you could cast an instant.",
      example:
        "Restoration Angel has flash — you can cast it at end of opponent's turn, during combat, or in response to removal.",
      tip: "Flash lets you hold up mana for counterspells or removal and deploy a threat if opponents don't give you a reason to respond. This 'play at instant speed' advantage is one of the strongest in competitive Magic.",
      related: [],
    },
    {
      name: "Flying",
      rule: "This creature can only be blocked by creatures with flying or reach.",
      example: "A 4/4 Angel with flying soars over ground creatures.",
      tip: "Creatures with reach CAN block flyers. Effects that say 'target creature loses flying' make them blockable by ground creatures. Flying is the most common evasion keyword.",
      related: ["Reach"],
    },
    {
      name: "Haste",
      rule: "This creature can attack and use tap abilities the turn it comes under your control.",
      example:
        "A creature with haste ignores 'summoning sickness' and can swing immediately.",
      tip: "Haste also matters when gaining control of opponents' creatures. If you steal a creature without haste, it has summoning sickness under your control.",
      related: [],
    },
    {
      name: "Hexproof",
      rule: "This permanent can't be the target of spells or abilities your opponents control.",
      example:
        "Opponent can't cast Lightning Bolt or Swords to Plowshares targeting your hexproof creature.",
      tip: "Hexproof does NOT protect against: board wipes (Wrath of God), sacrifice effects (Liliana's edict), or effects that don't target ('each creature gets -2/-2'). These are the main ways to deal with hexproof threats.",
      related: ["Ward", "Shroud"],
    },
    {
      name: "Indestructible",
      rule: "Effects that say 'destroy' don't work. Lethal damage doesn't destroy this permanent.",
      example:
        "Wrath of God says 'destroy all creatures' — an indestructible creature survives.",
      tip: "Indestructible does NOT prevent: exile (Path to Exile), sacrifice (Diabolic Edict), -X/-X reducing toughness to 0, or countering the spell before it resolves. These are all valid answers.",
      related: ["Deathtouch"],
    },
    {
      name: "Lifelink",
      rule: "Damage dealt by this permanent causes its controller to gain that much life.",
      example:
        "A 3/3 with lifelink deals 3 combat damage — you gain 3 life.",
      tip: "Lifelink applies to ALL damage, not just combat. If your lifelink creature pings something with a tap ability, you gain that life too. Multiple instances of lifelink don't stack.",
      related: [],
    },
    {
      name: "Menace",
      rule: "This creature can't be blocked except by two or more creatures.",
      example:
        "Your opponent needs at least 2 creatures to declare as blockers against a creature with menace.",
      tip: "Menace is particularly strong when paired with other evasion or combat keywords. Menace + deathtouch means your opponent needs two creatures and will definitely lose at least one.",
      related: [],
    },
    {
      name: "Reach",
      rule: "This creature can block creatures with flying.",
      example:
        "Giant Spider (2/4 with reach) can block a 2/2 flyer.",
      tip: "Reach only matters defensively — a creature with reach but not flying is still a ground creature when attacking. It doesn't gain evasion.",
      related: ["Flying"],
    },
    {
      name: "Shroud",
      rule: "This permanent can't be the target of spells or abilities — including yours.",
      example:
        "You can't equip a Sword to your own creature if it has shroud.",
      tip: "Shroud is strictly narrower than hexproof for the controller, since you can't target your own shrouded creatures. It's a legacy keyword mostly replaced by hexproof in modern design.",
      related: ["Hexproof"],
    },
    {
      name: "Trample",
      rule: "If this creature would assign enough damage to destroy all its blockers, the excess is dealt to the defending player or planeswalker.",
      example:
        "An 8/8 trampler blocked by a 2/2 assigns 2 to the blocker and 6 to the defending player.",
      tip: "With deathtouch + trample, you assign just 1 damage to each blocker (lethal due to deathtouch) and trample the entire rest. If a blocker has protection, you must assign what would be lethal damage (ignoring the prevention) before trampling.",
      related: ["Deathtouch"],
    },
    {
      name: "Vigilance",
      rule: "Attacking doesn't cause this creature to tap.",
      example:
        "A creature with vigilance attacks and remains untapped — available to block on the opponent's turn.",
      tip: "Vigilance bypasses the 'tap to attack' cost, but other effects can still tap the creature. If something taps your vigilance creature before combat, it can't attack (it's tapped, not that it would tap to attack).",
      related: [],
    },
    {
      name: "Ward",
      rule: "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter that spell unless they pay the ward cost.",
      example:
        "Ward {2} means your opponent must pay 2 extra mana when targeting. If they can't or won't, their spell is countered.",
      tip: "Ward triggers go on the stack and can themselves be responded to. Ward triggers separately for each targeting — if an opponent targets your ward creature twice, they pay twice.",
      related: ["Hexproof"],
    },
  ],

  "Spell Types": [
    {
      name: "Creature",
      rule: "Can only be cast during your main phase when the stack is empty and you have priority. If the creature has flash, then it follows the same rules as 'Instant' spells. All creatures are affected by summoning sickness unless they have the ability, haste.",
      example: "Arbor Elf is a creature spell. Cast it during your main phase when the stack is empty. This spell is affected by summoning sickness, since it doesn't have haste, so you will not be able to activate it until your next turn.",
      tip: "Cards that let you cast spells 'as though they had flash' (like Vedalken Orrery) remove the timing restriction entirely.",
      related: ["Deathtouch", "Defender", "Double Strike", "Firststrike", "Flash", "Flying", "Haste", "Hexproof", "Indestructable", "Lifelink", "Menace", "Reach", "Shroud", "Trample", "Vigilance", "Ward"]
    },
    
    {
      name: "Instant",
      rule: "Can be cast any time you have priority — on your turn, opponent's turn, during combat, in response to other spells.",
      example:
        "Lightning Bolt is an instant. Cast it during your opponent's combat to kill an attacker before damage.",
      tip: "The flexibility of instant speed is one of the biggest advantages in Magic. Holding up mana with instant-speed options forces your opponent to play around multiple possibilities.",
      related: ["Flash", "Split Second"],
    },
    {
      name: "Sorcery",
      rule: "Can only be cast during your main phase when the stack is empty and you have priority.",
      example:
        "Day of Judgment is a sorcery — you can only cast it during your own main phase with nothing else on the stack.",
      tip: "Cards that let you cast sorceries 'as though they had flash' (like Teferi, Time Raveler or Vedalken Orrery) remove this timing restriction entirely.",
      related: [],
    },
    {
      name: "Enchantment",
      rule: "A permanent that stays on the battlefield. Usually cast at sorcery speed unless it has flash.",
      example:
        "Courser of Kruphix is an enchantment creature — it stays on the battlefield providing its effect continuously.",
      tip: "Aura enchantments target when cast (so hexproof matters) but if moved to a creature by another effect, they don't target. An aura put onto the battlefield without being cast can attach to a hexproof creature.",
      related: [],
    },
    {
      name: "Artifact",
      rule: "A colorless permanent (usually). Equipment, Vehicles, and mana rocks are all artifacts.",
      example:
        "Sol Ring is an artifact that taps for 2 colorless mana.",
      tip: "Artifacts can be destroyed by effects that say 'destroy target artifact' (like Disenchant). In Commander, artifact removal is essential because of how powerful mana rocks are.",
      related: [],
    },
  ],

  "Stack & Priority": [
    {
      name: "The Stack",
      rule: "A zone where spells and abilities wait to resolve. Last In, First Out (LIFO) — the most recently added item resolves first.",
      example:
        "You cast Giant Growth. Opponent responds with Lightning Bolt targeting the same creature. Bolt is on top, resolves first, kills the creature. Giant Growth fizzles (no legal target).",
      tip: "Mana abilities (tapping lands for mana, activating Sol Ring) do NOT use the stack and cannot be responded to. This is a critical distinction.",
      related: ["Priority", "Split Second"],
    },
    {
      name: "Priority",
      rule: "The right to take an action (cast a spell or activate an ability). Active player (whose turn it is) always gets priority first after any game event.",
      example:
        "You cast a creature spell. Before it resolves, you get priority (can cast more spells), then opponent gets priority. Both must pass for it to resolve.",
      tip: "A player can hold priority after casting a spell — this is how you 'respond to your own spell.' Declare you're holding priority before opponent responds.",
      related: ["The Stack"],
    },
    {
      name: "Split Second",
      rule: "While a spell with split second is on the stack, players can't cast other spells or activate non-mana abilities.",
      example:
        "Krosan Grip has split second — your opponent can't counter it or respond with activated abilities.",
      tip: "Split second does NOT prevent triggered abilities from going on the stack. It also doesn't prevent special actions like morph. You can still activate mana abilities.",
      related: ["The Stack"],
    },
    {
      name: "Fizzle (Counter on Resolution)",
      rule: "If a spell or ability's targets are all illegal when it tries to resolve, it's removed from the stack without effect. Informally called 'fizzling.'",
      example:
        "You Lightning Bolt a creature. In response, your opponent gives it hexproof. When Bolt tries to resolve, the target is illegal — it fizzles.",
      tip: "A spell only fizzles if ALL targets become illegal. If a spell has multiple targets and at least one is still legal, it resolves and does what it can to the remaining legal targets.",
      related: ["The Stack"],
    },
  ],

  Combat: [
    {
      name: "Combat Phases",
      rule: "Combat has 5 steps: Beginning of Combat → Declare Attackers → Declare Blockers → Combat Damage → End of Combat. Players get priority between each step.",
      example:
        "All attackers are declared simultaneously. Then all blockers are declared simultaneously. You can cast instants between these steps.",
      tip: "'Before blockers' means during the Declare Attackers step, after attackers are tapped. 'Before damage' means during the Declare Blockers step, after blocks are declared but before the Combat Damage step.",
      related: ["First Strike", "Double Strike"],
    },
    {
      name: "Damage Assignment Order",
      rule: "When multiple creatures block one attacker, the attacking player chooses the order. Damage must be assigned in that order — lethal damage to the first before any to the second.",
      example:
        "A 5/5 blocked by a 2/2 and a 3/3: attacker chooses order (say 2/2 first). Must assign at least 2 to the 2/2, then remaining 3 to the 3/3.",
      tip: "The order is locked in during Declare Blockers and can't change. With deathtouch, you only need to assign 1 to each (since 1 is lethal with deathtouch).",
      related: ["Trample", "Deathtouch"],
    },
    {
      name: "Combat Damage",
      rule: "All combat damage is dealt simultaneously (unless first strike or double strike is involved). Damage doesn't reduce toughness — it's marked on the creature until end of turn.",
      example:
        "A 3/3 and a 3/3 block each other. Both deal 3 damage simultaneously. Both have lethal damage marked and are destroyed by state-based actions.",
      tip: "Damage is MARKED, not reducing toughness. A 4/4 with 3 damage marked is still a 4/4 — it just has 3 damage. This matters for effects that check toughness.",
      related: ["Combat Phases", "First Strike"],
    },
  ],

  Zones: [
    {
      name: "Battlefield",
      rule: "The zone where permanents exist. Creatures, artifacts, enchantments, planeswalkers, and lands are on the battlefield.",
      example:
        "When you 'play' a land or a creature spell resolves, it enters the battlefield.",
      tip: "Cards only have their characteristics while on the battlefield (or stack for spells). A creature card in your hand is just a 'creature card,' not a 'creature.'",
      related: [],
    },
    {
      name: "Graveyard",
      rule: "A player's discard pile. Cards go here when destroyed, discarded, sacrificed, countered, or milled.",
      example:
        "A creature that dies goes from the battlefield to its owner's graveyard.",
      tip: "The graveyard is public information — both players can look through any graveyard at any time. Order matters in some older formats but usually doesn't in modern rules.",
      related: [],
    },
    {
      name: "Exile",
      rule: "A zone for cards removed from the game. Usually permanent, though some effects exile temporarily.",
      example:
        "Path to Exile exiles a creature — it doesn't go to the graveyard and can't be reanimated normally.",
      tip: "Exile is 'harder' removal than destruction because most graveyard recursion doesn't work. However, some cards like Karn, the Great Creator or Pull from Eternity can retrieve exiled cards.",
      related: [],
    },
    {
      name: "Command Zone",
      rule: "In Commander, your commander starts here. You can cast your commander from this zone, with an additional {2} tax for each previous cast.",
      example:
        "Your commander costs {3}{U}{U}. First cast: 5 mana. If it dies and returns to command zone, second cast: 7 mana.",
      tip: "The commander tax applies every time you cast it from the command zone, regardless of why it went there. This tax increases by {2} each time, making late-game commanders very expensive.",
      related: [],
      formatNotes: {
        commander: "The command zone is specific to Commander and its variants.",
      },
    },
  ],

  "Turn Structure": [
    {
      name: "Turn Phases",
      rule: "A turn has 5 phases: Beginning → Pre-combat Main → Combat → Post-combat Main → Ending. Each phase has steps with priority passes.",
      example:
        "You untap, upkeep triggers happen, you draw — all before your main phase starts.",
      tip: "You have TWO main phases. Play lands and cast sorceries in either one. A common strategy is to attack first (in case combat matters for your decisions) then play cards in your second main phase.",
      related: ["Combat Phases"],
    },
    {
      name: "Untap Step",
      rule: "You untap all your tapped permanents. No player receives priority during this step.",
      example:
        "All your lands, creatures, and artifacts untap at the start of your turn.",
      tip: "No one can cast spells or activate abilities during the untap step — it just happens. Effects that say 'doesn't untap during your untap step' override the normal untap.",
      related: [],
    },
    {
      name: "Upkeep",
      rule: "After untap, before draw. Upkeep triggers go on the stack here. Players get priority.",
      example:
        "Bitterblossom's trigger ('create a 1/1 Faerie, lose 1 life') happens during upkeep.",
      tip: "You can cast instants during your upkeep before you draw. This matters for cards like Brainstorm — casting it during upkeep means you draw before your normal draw step.",
      related: [],
    },
    {
      name: "End Step",
      rule: "After the second main phase. 'At the beginning of your end step' triggers happen here. Players get priority.",
      example:
        "Casting creatures with flash at end of opponent's turn is a classic play — you untap with them next turn.",
      tip: "The end step is different from the cleanup step. 'Until end of turn' effects wear off in cleanup. If something triggers during cleanup, players get another round of priority.",
      related: [],
    },
  ],
};

export const KEYWORD_CATEGORIES = Object.keys(KEYWORDS) as KeywordCategory[];
