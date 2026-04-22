import { NextRequest, NextResponse } from "next/server";

interface MetaDeckResult {
  name: string;
  metaShare: string;
  topCards: string[];
}

// In-memory cache — survives across requests in the same serverless instance
const cache: Record<string, { data: MetaDeckResult[]; timestamp: number }> = {};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const FORMAT_URLS: Record<string, string> = {
  modern: "https://www.mtggoldfish.com/metagame/modern/full#paper",
  standard: "https://www.mtggoldfish.com/metagame/standard/full#paper",
  pioneer: "https://www.mtggoldfish.com/metagame/pioneer/full#paper",
  legacy: "https://www.mtggoldfish.com/metagame/legacy/full#paper",
  pauper: "https://www.mtggoldfish.com/metagame/pauper/full#paper",
  vintage: "https://www.mtggoldfish.com/metagame/vintage/full#paper",
};

function parseMetagamePage(html: string): MetaDeckResult[] {
  const decks: MetaDeckResult[] = [];

  // MTGGoldfish lists decks with links to /archetype/ pages and meta percentages
  // Pattern: <a href="/archetype/deck-name">Deck Name</a> ... XX.XX%
  const archetypeRegex = /href="\/archetype\/([^"]+)"[^>]*>\s*([^<]{3,60})\s*<\/a>/gi;
  const percentRegex = /(\d+\.?\d*)\s*%/g;

  let match;
  const rawMatches: { name: string; position: number }[] = [];

  while ((match = archetypeRegex.exec(html)) !== null) {
    const name = match[2]
      .trim()
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

    // Skip navigation/header links, very short names, or duplicates
    if (name.length < 3) continue;
    if (/^(modern|standard|pioneer|legacy|pauper|vintage|commander|home|decks|prices|articles|tools|community)$/i.test(name)) continue;
    if (rawMatches.some((m) => m.name === name)) continue;

    rawMatches.push({ name, position: match.index });
  }

  // For each deck name, find the nearest percentage after it
  for (const rm of rawMatches) {
    if (decks.length >= 15) break;

    const afterText = html.substring(rm.position, rm.position + 500);
    const pctMatch = afterText.match(/(\d+\.?\d*)\s*%/);
    const share = pctMatch ? pctMatch[1] + "%" : "";

    // Skip entries without a percentage (probably navigation links)
    if (!share) continue;
    // Skip unreasonable percentages
    const pctNum = parseFloat(share);
    if (pctNum > 50 || pctNum < 0.1) continue;

    decks.push({ name: rm.name, metaShare: share, topCards: [] });
  }

  // Try to find top cards for each deck from card image alt text
  for (const deck of decks) {
    const idx = html.indexOf(deck.name);
    if (idx === -1) continue;
    const section = html.substring(idx, idx + 3000);

    const cardImgRegex = /alt="([A-Z][a-zA-Z' ,\-]{2,35})"/g;
    const cards = new Set<string>();
    let cardMatch;
    while ((cardMatch = cardImgRegex.exec(section)) !== null && cards.size < 8) {
      const cardName = cardMatch[1].trim();
      // Filter out non-card names
      if (cardName.length > 2 && cardName.length < 40 && !cardName.startsWith("Deck") && !cardName.startsWith("Meta")) {
        cards.add(cardName);
      }
    }
    deck.topCards = [...cards];
  }

  return decks;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format")?.toLowerCase() || "modern";

  if (!FORMAT_URLS[format]) {
    return NextResponse.json(
      { error: `Unsupported format. Supported: ${Object.keys(FORMAT_URLS).join(", ")}` },
      { status: 400 }
    );
  }

  // Return cache if fresh
  const cached = cache[format];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ decks: cached.data, source: "cache", format });
  }

  try {
    const res = await fetch(FORMAT_URLS[format], {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MTGPocketJudge/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      if (cached) return NextResponse.json({ decks: cached.data, source: "stale-cache", format });
      return NextResponse.json({ error: "Failed to fetch", decks: [] }, { status: 502 });
    }

    const html = await res.text();
    const decks = parseMetagamePage(html);

    if (decks.length > 0) {
      cache[format] = { data: decks, timestamp: Date.now() };
    }

    return NextResponse.json({
      decks: decks.length > 0 ? decks : (cached?.data || []),
      source: decks.length > 0 ? "live" : "fallback",
      format,
    });
  } catch {
    if (cached) return NextResponse.json({ decks: cached.data, source: "stale-cache", format });
    return NextResponse.json({ error: "Network error", decks: [] }, { status: 500 });
  }
}
