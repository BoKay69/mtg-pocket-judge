import type { ScryfallCard, ScryfallRuling } from "@/types";

const BASE_URL = "https://api.scryfall.com";

// Scryfall asks for 50-100ms delay between requests
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;

async function scryfallFetch<T>(endpoint: string): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < 100) {
    await delay(100 - elapsed);
  }
  lastRequest = Date.now();

  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ details: res.statusText }));
    throw new ScryfallError(
      error.details || `Scryfall API error: ${res.status}`,
      res.status
    );
  }
  return res.json();
}

export class ScryfallError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ScryfallError";
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

interface ScryfallSearchResponse {
  data: ScryfallCard[];
  has_more: boolean;
  total_cards: number;
}

export async function searchCards(
  query: string,
  options?: { format?: string; page?: number }
): Promise<{ cards: ScryfallCard[]; total: number; hasMore: boolean }> {
  let q = query;
  if (options?.format) {
    q += ` legal:${options.format}`;
  }

  const params = new URLSearchParams({
    q,
    order: "name",
    ...(options?.page ? { page: String(options.page) } : {}),
  });

  const data = await scryfallFetch<ScryfallSearchResponse>(
    `/cards/search?${params}`
  );

  return {
    cards: data.data,
    total: data.total_cards,
    hasMore: data.has_more,
  };
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

interface ScryfallAutocomplete {
  data: string[];
}

export async function autocompleteCard(query: string): Promise<string[]> {
  if (query.length < 2) return [];
  const params = new URLSearchParams({ q: query });
  const data = await scryfallFetch<ScryfallAutocomplete>(
    `/cards/autocomplete?${params}`
  );
  return data.data;
}

// ─── Get single card ─────────────────────────────────────────────────────────

export async function getCardByName(
  name: string,
  exact = true
): Promise<ScryfallCard> {
  const params = new URLSearchParams({
    [exact ? "exact" : "fuzzy"]: name,
  });
  return scryfallFetch<ScryfallCard>(`/cards/named?${params}`);
}

export async function getCardById(id: string): Promise<ScryfallCard> {
  return scryfallFetch<ScryfallCard>(`/cards/${id}`);
}

// ─── Rulings ─────────────────────────────────────────────────────────────────

interface ScryfallRulingsResponse {
  data: ScryfallRuling[];
}

export async function getCardRulings(cardId: string): Promise<ScryfallRuling[]> {
  const data = await scryfallFetch<ScryfallRulingsResponse>(
    `/cards/${cardId}/rulings`
  );
  return data.data;
}

// ─── Random card (fun feature) ───────────────────────────────────────────────

export async function getRandomCard(query?: string): Promise<ScryfallCard> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return scryfallFetch<ScryfallCard>(`/cards/random${params}`);
}

// ─── Token image lookup ───────────────────────────────────────────────────────

export async function fetchTokenImage(tokenName: string): Promise<string | null> {
  // Strip " Token" suffix (our engine appends it, Scryfall uses just the subtype)
  const searchName = tokenName.replace(/\s+Token$/i, "").trim();
  try {
    const params = new URLSearchParams({
      q: `type:token !"${searchName}"`,
      include_extras: "true",
      order: "released",
    });
    const data = await scryfallFetch<{ data: ScryfallCard[] }>(`/cards/search?${params}`);
    const card = data.data?.[0];
    if (!card) return null;
    return (
      card.image_uris?.normal ??
      card.image_uris?.small ??
      card.card_faces?.[0]?.image_uris?.normal ??
      card.card_faces?.[0]?.image_uris?.small ??
      null
    );
  } catch {
    return null;
  }
}
