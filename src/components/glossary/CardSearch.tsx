"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button, Badge, SectionLabel } from "@/components/ui";
import { useCardAutocomplete } from "@/hooks";
import type { ScryfallCard, ScryfallRuling, Format } from "@/types";
import { cn } from "@/lib/utils";

interface CardSearchProps {
  format: Format;
}

export function CardSearch({ format }: CardSearchProps) {
  const { query, setQuery, suggestions } = useCardAutocomplete();
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchCard = async (name: string) => {
    setLoading(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error("Card not found");
      const card: ScryfallCard = await res.json();
      setSelectedCard(card);

      // Fetch rulings
      const rulingsRes = await fetch(
        `https://api.scryfall.com/cards/${card.id}/rulings`
      );
      if (rulingsRes.ok) {
        const rulingsData = await rulingsRes.json();
        setRulings(rulingsData.data || []);
      }
    } catch (err) {
      setError("Card not found. Try a different name.");
      setSelectedCard(null);
      setRulings([]);
    } finally {
      setLoading(false);
    }
  };

  const getLegalityColor = (legality: string) => {
    switch (legality) {
      case "legal":
        return "#22c55e";
      case "banned":
        return "#dc2626";
      case "restricted":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  return (
    <div>
      <p className="text-sm text-mtg-text-dim mb-4 leading-relaxed">
        Search any Magic card to see its oracle text, legality in your selected
        format, and official rulings.
      </p>

      {/* Search input */}
      <div className="relative mb-4">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={(e) => e.key === "Enter" && query.trim() && fetchCard(query)}
          placeholder="Search for a card..."
          className="w-full px-4 py-3 pl-10 bg-mtg-surface border border-mtg-border rounded-xl text-mtg-text text-sm font-body outline-none focus:border-mtg-gold/50 transition-colors placeholder:text-mtg-text-muted"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mtg-text-muted text-base">
          ⌕
        </span>

        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto"
            >
              {suggestions.slice(0, 8).map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setQuery(name);
                    fetchCard(name);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0"
                >
                  {name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-mtg-text-dim text-sm">
          Searching Scryfall...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      )}

      {/* Card result */}
      {selectedCard && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden">
            <div className="p-4">
              {/* Card header */}
              <div className="flex gap-4">
                {selectedCard.image_uris?.normal && (
                  <img
                    src={selectedCard.image_uris.normal}
                    alt={selectedCard.name}
                    className="w-32 rounded-lg shadow-lg flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold font-display text-mtg-text">
                    {selectedCard.name}
                  </h3>
                  <p className="text-xs text-mtg-text-muted mt-0.5">
                    {selectedCard.mana_cost} · {selectedCard.type_line}
                  </p>
                  {selectedCard.power && (
                    <p className="text-sm text-mtg-text-dim mt-1 font-display font-bold">
                      {selectedCard.power}/{selectedCard.toughness}
                    </p>
                  )}

                  {/* Format legality */}
                  <div className="mt-2">
                    <Badge
                      color={getLegalityColor(
                        selectedCard.legalities[format] || "not_legal"
                      )}
                    >
                      {format}: {selectedCard.legalities[format] || "not legal"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Oracle text */}
              {selectedCard.oracle_text && (
                <div className="mt-4">
                  <SectionLabel>Oracle Text</SectionLabel>
                  <div className="text-sm text-mtg-text leading-relaxed p-3 bg-mtg-surface rounded-lg whitespace-pre-wrap">
                    {selectedCard.oracle_text}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {selectedCard.keywords.length > 0 && (
                <div className="mt-3">
                  <SectionLabel>Keywords</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCard.keywords.map((kw) => (
                      <Badge key={kw} color="#3b82f6">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* All format legalities */}
              <div className="mt-3">
                <SectionLabel>Format Legality</SectionLabel>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      "standard",
                      "pioneer",
                      "modern",
                      "legacy",
                      "commander",
                      "pauper",
                    ] as Format[]
                  ).map((f) => (
                    <div
                      key={f}
                      className="flex items-center justify-between px-2 py-1 rounded text-[11px]"
                    >
                      <span
                        className={cn(
                          "capitalize",
                          f === format
                            ? "text-mtg-gold font-bold"
                            : "text-mtg-text-dim"
                        )}
                      >
                        {f}
                      </span>
                      <span
                        style={{
                          color: getLegalityColor(
                            selectedCard.legalities[f] || "not_legal"
                          ),
                        }}
                        className="capitalize font-semibold"
                      >
                        {selectedCard.legalities[f] || "not legal"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Rulings */}
          {rulings.length > 0 && (
            <div className="mt-4">
              <SectionLabel>
                Official Rulings ({rulings.length})
              </SectionLabel>
              <div className="flex flex-col gap-1.5">
                {rulings.map((ruling, i) => (
                  <Card key={i} className="!p-3">
                    <div className="text-[11px] text-mtg-text-muted mb-1">
                      {ruling.published_at} · {ruling.source}
                    </div>
                    <div className="text-[13px] text-mtg-text leading-relaxed">
                      {ruling.comment}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Empty state */}
      {!selectedCard && !loading && !error && (
        <div className="text-center py-10 px-5 text-mtg-text-muted text-sm leading-relaxed border border-dashed border-mtg-border rounded-xl">
          Search for any card to see its rules text,
          <br />
          format legality, and official rulings.
        </div>
      )}
    </div>
  );
}
