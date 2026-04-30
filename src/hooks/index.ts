import { useState, useEffect, useCallback, useRef } from "react";

// ─── Debounced value ─────────────────────────────────────────────────────────

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// ─── Local storage with SSR safety ───────────────────────────────────────────

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(next));
        }
        return next;
      });
    },
    [key]
  );

  return [stored, setValue];
}

// ─── Scryfall autocomplete hook ──────────────────────────────────────────────

export function useCardAutocomplete() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, 200);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(debouncedQuery)}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setSuggestions(data.data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  return { query, setQuery, suggestions, loading };
}

// ─── Full card fetch hook ────────────────────────────────────────────────────

import type { ScryfallCard, ScryfallRuling } from "@/types";

export function useCardFetch() {
  const [card, setCard] = useState<ScryfallCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCard = useCallback(async (name: string) => {
    if (!name.trim()) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
      );
      if (!res.ok) {
        // Try fuzzy match
        const fuzzyRes = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        );
        if (!fuzzyRes.ok) {
          setError("Card not found");
          setCard(null);
          setLoading(false);
          return null;
        }
        const data = await fuzzyRes.json();
        setCard(data);
        setLoading(false);
        return data as ScryfallCard;
      }
      const data = await res.json();
      setCard(data);
      setLoading(false);
      return data as ScryfallCard;
    } catch (err) {
      setError("Failed to fetch card");
      setCard(null);
      setLoading(false);
      return null;
    }
  }, []);

  const clearCard = useCallback(() => {
    setCard(null);
    setError(null);
  }, []);

  return { card, loading, error, fetchCard, clearCard };
}

// ─── Card rulings hook ───────────────────────────────────────────────────────

export function useCardRulings(cardId: string | null | undefined) {
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setRulings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/rulings?cardId=${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setRulings(data.rulings ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRulings([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return { rulings, loading };
}
