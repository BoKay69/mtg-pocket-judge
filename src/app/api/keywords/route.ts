import { NextResponse } from "next/server";
import { KEYWORDS } from "@/data/keywords";

// Cache the full response for 7 days — keyword lists change rarely
export const revalidate = 604800;

const SCRYFALL = "https://api.scryfall.com";
const HEADERS = { "User-Agent": "MTGPocketJudge/1.0" };

// All names already covered by keywords.ts — skip these in the API results
const STATIC_NAMES = new Set(
  Object.values(KEYWORDS)
    .flat()
    .map((e) => e.name.toLowerCase())
);

export type ApiKeyword = {
  name: string;
  category: "Keyword Ability" | "Ability Word";
  description: string;
  scryfallUrl: string;
};

export type KeywordsApiResponse = {
  keywords: ApiKeyword[];
  counts: { keywordAbilities: number; abilityWords: number; newCount: number };
};

// ─── Scryfall helpers ─────────────────────────────────────────────────────────

async function fetchCatalog(type: "keyword-abilities" | "ability-words"): Promise<string[]> {
  try {
    const res = await fetch(`${SCRYFALL}/catalog/${type}`, {
      headers: HEADERS,
      next: { revalidate: 604800 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: string[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

// Extract the parenthetical reminder text following "Keyword (...)"
function extractParenthetical(oracle: string, keyword: string): string | null {
  const idx = oracle.toLowerCase().indexOf(keyword.toLowerCase() + " (");
  if (idx === -1) return null;
  const start = oracle.indexOf("(", idx + keyword.length);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < oracle.length; i++) {
    if (oracle[i] === "(") depth++;
    else if (oracle[i] === ")" && --depth === 0) return oracle.slice(start + 1, i);
  }
  return null;
}

// Extract the effect text following "Ability Word — ..."
function extractAbilityEffect(oracle: string, keyword: string): string | null {
  const pattern = keyword.toLowerCase() + " — "; // em dash
  const idx = oracle.toLowerCase().indexOf(pattern);
  if (idx === -1) return null;
  const after = oracle.slice(idx + pattern.length);
  const end = after.indexOf("\n");
  const raw = end === -1 ? after : after.slice(0, end);
  return raw.length > 0 ? raw.slice(0, 150) : null;
}

async function fetchReminderText(name: string, isAbilityWord: boolean): Promise<string | null> {
  try {
    const q = isAbilityWord
      ? `o:"${name} —" game:paper`
      : `o:"${name} (" game:paper`;
    const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=released&unique=cards`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { oracle_text?: string; card_faces?: { oracle_text?: string }[] }[];
    };
    if (!data.data?.length) return null;
    const card = data.data[0];
    const oracle = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? "";
    return isAbilityWord
      ? extractAbilityEffect(oracle, name)
      : extractParenthetical(oracle, name);
  } catch {
    return null;
  }
}

// Process items in batches of `size` with a pause between batches to stay
// within Scryfall's recommended ~10 req/s rate limit
async function inBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  size = 3,
  pauseMs = 200
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    if (i + size < items.length) await new Promise<void>((r) => setTimeout(r, pauseMs));
  }
  return out;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [kwAbilities, abilityWords] = await Promise.all([
      fetchCatalog("keyword-abilities"),
      fetchCatalog("ability-words"),
    ]);

    type NewEntry = {
      name: string;
      category: "Keyword Ability" | "Ability Word";
      isAbilityWord: boolean;
    };

    const toEnrich: NewEntry[] = [
      ...kwAbilities
        .filter((n) => !STATIC_NAMES.has(n.toLowerCase()))
        .map((name) => ({ name, category: "Keyword Ability" as const, isAbilityWord: false })),
      ...abilityWords
        .filter((n) => !STATIC_NAMES.has(n.toLowerCase()))
        .map((name) => ({ name, category: "Ability Word" as const, isAbilityWord: true })),
    ];

    const keywords = await inBatches<NewEntry, ApiKeyword>(
      toEnrich,
      async ({ name, category, isAbilityWord }) => {
        const description = await fetchReminderText(name, isAbilityWord);
        return {
          name,
          category,
          description: description ?? "See cards with this keyword for full details.",
          scryfallUrl: `https://scryfall.com/search?q=${encodeURIComponent(
            isAbilityWord ? `o:"${name}"` : `keyword:${name}`
          )}`,
        };
      },
      3,
      200
    );

    const body: KeywordsApiResponse = {
      keywords,
      counts: {
        keywordAbilities: kwAbilities.length,
        abilityWords: abilityWords.length,
        newCount: keywords.length,
      },
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch keyword catalog" }, { status: 500 });
  }
}
