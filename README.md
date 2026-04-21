# MTG: Pocket Judge ⚖

> Settle rules disputes at the table. Visual stack resolution, keyword glossary, card search with official rulings, and format-aware legality checking for Magic: The Gathering.

## Features

### ⚡ Stack Visualizer
Pre-built scenarios walking through common stack interactions step-by-step:
- Counterspell wars
- Combat tricks with pump spells and removal
- ETB triggers + removal responses
- Board wipe trigger ordering
- Protection vs. board wipes (D.E.B.T.)
- Anthem + removal timing

### 🔧 Custom Stack Builder
Build your own stack scenarios with Scryfall autocomplete. Add spells and abilities, assign owners and targets, then step through LIFO resolution visually.

### 📖 Keyword Glossary
Searchable dictionary of every major keyword and rules concept, organized by category:
- **Evergreen** — Deathtouch, Flying, Trample, Ward, etc.
- **Spell Types** — Instant, Sorcery, Enchantment, Artifact
- **Stack & Priority** — How the stack works, priority, split second, fizzling
- **Combat** — Phases, damage assignment, first strike timing
- **Zones** — Battlefield, Graveyard, Exile, Command Zone
- **Turn Structure** — Phases, untap, upkeep, end step

Each entry includes: rule text, practical example, pro tip, and cross-references.

### 🔍 Card Search & Rulings
Scryfall-powered card search with:
- Autocomplete card names
- Oracle text display
- Format legality (highlights your selected format)
- Official rulings from Wizards of the Coast

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Card Data | Scryfall API (free, no key) |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel |

## Getting Started

### Prerequisites
- Node.js 20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- npm or yarn

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/mtg-pocket-judge.git
cd mtg-pocket-judge

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

The app works without any env vars for basic functionality (Scryfall API is open).

For database features (saved scenarios, user accounts):
1. Create a free project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key to `.env.local`

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (Scryfall proxy)
│   │   ├── search/         # Card search endpoint
│   │   └── rulings/        # Card rulings endpoint
│   ├── globals.css         # Tailwind + custom styles
│   ├── layout.tsx          # Root layout + metadata
│   └── page.tsx            # Main app page
├── components/
│   ├── ui/                 # Reusable primitives (Button, Card, Badge)
│   ├── layout/             # Header, TabBar, FormatPicker
│   ├── stack/              # StackVisualizer, CustomStackBuilder
│   └── glossary/           # KeywordDictionary, CardSearch
├── data/                   # Static data
│   ├── keywords.ts         # Keyword definitions + tips
│   ├── scenarios.ts        # Pre-built stack scenarios
│   └── formats.ts          # Format configurations
├── hooks/                  # Custom React hooks
│   └── index.ts            # useDebounce, useLocalStorage, useCardAutocomplete
├── lib/                    # Utilities
│   ├── scryfall.ts         # Scryfall API client
│   ├── supabase.ts         # Supabase client
│   └── utils.ts            # Helpers (cn, mana parsing, ID gen)
└── types/
    └── index.ts            # TypeScript type definitions
```

## Roadmap

### Phase 1 — MVP (Current)
- [x] Stack Visualizer with pre-built scenarios
- [x] Custom Stack Builder with Scryfall autocomplete
- [x] Keyword Dictionary with search and cross-references
- [x] Card Search with rulings and format legality
- [x] Format selector

### Phase 2 — Enhanced Features
- [ ] AI-powered "Ask the Judge" (natural language rules questions)
- [ ] Save custom stack scenarios (Supabase)
- [ ] User accounts and favorites
- [ ] More scenarios (50+ covering edge cases)
- [ ] Commander-specific rules section (command tax, color identity)

### Phase 3 — Mobile & Monetization
- [ ] React Native / Expo mobile app
- [ ] Offline keyword glossary
- [ ] Premium tier: AI Judge, advanced scenarios, priority support
- [ ] Community-submitted scenarios with voting

## Contributing

This is currently a private project. Contributions will be welcome after public launch.

## License

All rights reserved. This is proprietary software.

---

Built with ☕ and too many counterspell wars.
