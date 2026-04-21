// ─── Meta Deck Types ─────────────────────────────────────────────────────────

export interface MetaDeck {
  name: string;
  format: string;
  tier: 1 | 2 | 3;
  colors: string[]; // ["W", "U", "B", "R", "G"]
  keyCards: string[]; // Card names for quick-add to simulator
  description: string;
}

// ─── Curated Meta Data ───────────────────────────────────────────────────────
// These can be updated periodically or replaced with a web scraper
// Source: MTGGoldfish, MTGTop8, and major tournament results

export const META_DECKS: Record<string, MetaDeck[]> = {
  modern: [
    { name: "Boros Energy", format: "modern", tier: 1, colors: ["R", "W"], keyCards: ["Galvanic Discharge", "Guide of Souls", "Ocelot Pride", "Ajani, Nacatl Pariah", "Phlage, Titan of Fire's Fury", "Amped Raptor"], description: "Aggressive energy-based strategy with efficient threats." },
    { name: "Jeskai Control", format: "modern", tier: 1, colors: ["W", "U", "R"], keyCards: ["Counterspell", "Lightning Bolt", "Teferi, Time Raveler", "Snapcaster Mage", "Solitude", "Prismatic Ending"], description: "Classic control shell with efficient answers." },
    { name: "Murktide Regent", format: "modern", tier: 1, colors: ["U", "R"], keyCards: ["Murktide Regent", "Dragon's Rage Channeler", "Counterspell", "Lightning Bolt", "Mishra's Bauble", "Expressive Iteration"], description: "Tempo deck built around a massive delve flyer." },
    { name: "Yawgmoth Combo", format: "modern", tier: 2, colors: ["B", "G"], keyCards: ["Yawgmoth, Thran Physician", "Young Wolf", "Blood Artist", "Strangleroot Geist", "Chord of Calling", "Collected Company"], description: "Sacrifice combo using undying creatures with Yawgmoth." },
    { name: "Amulet Titan", format: "modern", tier: 2, colors: ["G"], keyCards: ["Primeval Titan", "Amulet of Vigor", "Dryad of the Ilysian Grove", "Summoner's Pact", "Urza's Saga", "The Mycosynth Gardens"], description: "Ramp into Primeval Titan with bounce lands and Amulet of Vigor." },
    { name: "Living End", format: "modern", tier: 2, colors: ["B", "R", "G"], keyCards: ["Living End", "Grief", "Waker of Waves", "Architects of Will", "Shardless Agent", "Violent Outburst"], description: "Cascade into Living End to reanimate an army of cycled creatures." },
  ],
  standard: [
    { name: "Azorius Control", format: "standard", tier: 1, colors: ["W", "U"], keyCards: ["No More Lies", "Get Lost", "The Wandering Emperor", "Jace, the Perfected Mind", "Memory Deluge", "Depopulate"], description: "Draw-go control with counterspells and wraths." },
    { name: "Gruul Aggro", format: "standard", tier: 1, colors: ["R", "G"], keyCards: ["Questing Druid", "Monastery Swiftspear", "Kumano Faces Kakkazan", "Pawpatch Formation", "Mosswood Dreadknight", "Picnic Ruiner"], description: "Fast aggressive creatures backed by burn." },
    { name: "Dimir Midrange", format: "standard", tier: 1, colors: ["U", "B"], keyCards: ["Preacher of the Schism", "Sheoldred, the Apocalypse", "Deep-Cavern Bat", "Go for the Throat", "Cut Down", "Kaito Shizuki"], description: "Efficient threats with disruption and removal." },
  ],
  pioneer: [
    { name: "Rakdos Midrange", format: "pioneer", tier: 1, colors: ["B", "R"], keyCards: ["Thoughtseize", "Fatal Push", "Bloodtithe Harvester", "Fable of the Mirror-Breaker", "Sheoldred, the Apocalypse", "Bonecrusher Giant"], description: "Disruption plus efficient threats." },
    { name: "Azorius Control", format: "pioneer", tier: 1, colors: ["W", "U"], keyCards: ["Supreme Verdict", "Teferi, Hero of Dominaria", "Absorb", "The Wandering Emperor", "Shark Typhoon", "Memory Deluge"], description: "Classic draw-go control with wraths." },
    { name: "Mono-Green Devotion", format: "pioneer", tier: 1, colors: ["G"], keyCards: ["Elvish Mystic", "Cavalier of Thorns", "Storm the Festival", "Nykthos, Shrine to Nyx", "Karn, the Great Creator", "Old-Growth Troll"], description: "Ramp into powerful green threats using devotion." },
  ],
  legacy: [
    { name: "Reanimator", format: "legacy", tier: 1, colors: ["U", "B"], keyCards: ["Reanimate", "Entomb", "Grief", "Atraxa, Grand Unifier", "Dark Ritual", "Unmask"], description: "Cheat massive creatures into play from the graveyard." },
    { name: "Delver", format: "legacy", tier: 1, colors: ["U", "R"], keyCards: ["Delver of Secrets", "Murktide Regent", "Brainstorm", "Force of Will", "Lightning Bolt", "Daze"], description: "Efficient threats backed by free countermagic." },
    { name: "Death and Taxes", format: "legacy", tier: 2, colors: ["W"], keyCards: ["Thalia, Guardian of Thraben", "Stoneforge Mystic", "Flickerwisp", "Aether Vial", "Rishadan Port", "Swords to Plowshares"], description: "Disruptive white creatures with mana denial." },
  ],
  commander: [
    { name: "Thrasios/Tymna (cEDH)", format: "commander", tier: 1, colors: ["W", "U", "B", "G"], keyCards: ["Thrasios, Triton Hero", "Tymna the Weaver", "Demonic Tutor", "Mana Crypt", "Ad Nauseam", "Thassa's Oracle"], description: "Competitive EDH combo with partner commanders." },
    { name: "Kinnan Combo (cEDH)", format: "commander", tier: 1, colors: ["U", "G"], keyCards: ["Kinnan, Bonder Prodigy", "Basalt Monolith", "Thrasios, Triton Hero", "Mana Vault", "Sol Ring", "Finale of Devastation"], description: "Infinite mana combos with Kinnan." },
    { name: "Najeela Tempo (cEDH)", format: "commander", tier: 1, colors: ["W", "U", "B", "R", "G"], keyCards: ["Najeela, the Blade-Blossom", "Derevi, Empyrial Tactician", "Nature's Will", "Reconnaissance", "Tymna the Weaver", "Druid's Repository"], description: "Infinite combat steps with Najeela." },
  ],
  pauper: [
    { name: "Kuldotha Red", format: "pauper", tier: 1, colors: ["R"], keyCards: ["Goblin Blast-Runner", "Kuldotha Rebirth", "Monastery Swiftspear", "Lightning Bolt", "Galvanic Blast", "Experimental Synthesizer"], description: "Aggressive artifact-based red deck." },
    { name: "Dimir Faeries", format: "pauper", tier: 1, colors: ["U", "B"], keyCards: ["Spellstutter Sprite", "Ninja of the Deep Hours", "Brainstorm", "Counterspell", "Snuff Out", "Cast Down"], description: "Tempo deck with faeries and ninjas." },
    { name: "Bogles", format: "pauper", tier: 2, colors: ["W", "G"], keyCards: ["Slippery Bogle", "Gladecover Scout", "Ethereal Armor", "Rancor", "Armadillo Cloak", "Ancestral Mask"], description: "Hexproof creatures stacked with auras." },
  ],
};

// ─── Get decks for a format ──────────────────────────────────────────────────

export function getMetaDecks(format: string): MetaDeck[] {
  return META_DECKS[format] || [];
}

// ─── Get all key cards for a format (for ban checking reference) ─────────────

export function getMetaCards(format: string): string[] {
  const decks = META_DECKS[format] || [];
  const cards = new Set<string>();
  for (const deck of decks) {
    for (const card of deck.keyCards) {
      cards.add(card);
    }
  }
  return [...cards];
}
