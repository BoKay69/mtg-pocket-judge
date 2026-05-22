"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KEYWORDS, KEYWORD_CATEGORIES } from "@/data/keywords";
import type { KeywordCategory } from "@/types";
import { Card, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

// Mirror of ApiKeyword from the route — defined locally to avoid server/client coupling
type ApiKeyword = {
  name: string;
  category: string;
  description: string;
  scryfallUrl: string;
};

export function KeywordDictionary() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<KeywordCategory>("Evergreen");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showScryfall, setShowScryfall] = useState(false);

  // API state — populated in the background after mount
  const [apiKeywords, setApiKeywords] = useState<ApiKeyword[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/keywords")
      .then((r) => r.json())
      .then((data: { keywords?: ApiKeyword[] }) => {
        if (Array.isArray(data.keywords)) setApiKeywords(data.keywords);
        setApiLoaded(true);
      })
      .catch(() => setApiLoaded(true)); // Silently fail — static data still shows
  }, []);

  const isSearching = search.length > 0;

  // ── Static keyword results ───────────────────────────────────────────────────

  const getStaticFiltered = () => {
    if (isSearching) {
      const q = search.toLowerCase();
      return Object.entries(KEYWORDS).flatMap(([cat, entries]) =>
        entries
          .filter(
            (k) =>
              k.name.toLowerCase().includes(q) ||
              k.rule.toLowerCase().includes(q) ||
              k.tip.toLowerCase().includes(q)
          )
          .map((k) => ({ ...k, category: cat }))
      );
    }
    return (KEYWORDS[selectedCat] ?? []).map((k) => ({ ...k, category: selectedCat }));
  };

  const staticFiltered = getStaticFiltered();

  // ── API keyword results ──────────────────────────────────────────────────────

  const apiFiltered = isSearching
    ? apiKeywords.filter((k) => {
        const q = search.toLowerCase();
        return k.name.toLowerCase().includes(q) || k.description.toLowerCase().includes(q);
      })
    : showScryfall
    ? apiKeywords
    : [];

  // ── Related keyword navigation ───────────────────────────────────────────────

  const handleRelatedClick = (name: string) => {
    for (const [cat, entries] of Object.entries(KEYWORDS)) {
      if (entries.find((e) => e.name === name)) {
        setSelectedCat(cat as KeywordCategory);
        setExpanded(name);
        setSearch("");
        setShowScryfall(false);
        return;
      }
    }
  };

  // ── Category tab click ───────────────────────────────────────────────────────

  const handleCatClick = (cat: KeywordCategory) => {
    setSelectedCat(cat);
    setExpanded(null);
    setShowScryfall(false);
  };

  // ── Rendering helpers ────────────────────────────────────────────────────────

  const staticResultCount = staticFiltered.length + (isSearching ? apiFiltered.length : 0);

  return (
    <div>
      {/* Search + new-keywords badge */}
      <div className="relative mb-3.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keywords & rules..."
          className="w-full px-4 py-3 pl-10 bg-mtg-surface border border-mtg-border rounded-xl text-mtg-text text-sm font-body outline-none focus:border-mtg-gold/50 transition-colors placeholder:text-mtg-text-muted"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mtg-text-muted text-base">
          ⌕
        </span>
        {apiLoaded && apiKeywords.length > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-display font-semibold text-mtg-text-muted/60 select-none">
            +{apiKeywords.length} from Scryfall
          </span>
        )}
      </div>

      {/* Category tabs + Scryfall toggle */}
      {!isSearching && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {KEYWORD_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCatClick(cat)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-display font-semibold border transition-all duration-200",
                !showScryfall && selectedCat === cat
                  ? "border-mtg-gold bg-mtg-gold/10 text-mtg-gold"
                  : "border-mtg-border text-mtg-text-dim hover:border-mtg-border-light"
              )}
            >
              {cat}
            </button>
          ))}

          {/* Scryfall tab — only appears once data has loaded */}
          {apiLoaded && apiKeywords.length > 0 && (
            <button
              onClick={() => setShowScryfall((v) => !v)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-display font-semibold border transition-all duration-200 flex items-center gap-1",
                showScryfall
                  ? "border-blue-500/60 bg-blue-500/10 text-blue-400"
                  : "border-mtg-border text-mtg-text-dim hover:border-blue-500/30 hover:text-blue-400"
              )}
            >
              <span>📡</span>
              <span>Scryfall</span>
              <span
                className={cn(
                  "ml-0.5 px-1 py-0.5 rounded text-[9px] font-bold leading-none",
                  showScryfall ? "bg-blue-500/20 text-blue-300" : "bg-mtg-surface text-mtg-text-muted"
                )}
              >
                {apiKeywords.length}
              </span>
            </button>
          )}
        </div>
      )}

      {isSearching && staticResultCount > 0 && (
        <p className="text-xs text-mtg-text-muted mb-3">
          {staticResultCount} result{staticResultCount !== 1 && "s"} across all categories
        </p>
      )}

      {/* ── Static keyword cards ──────────────────────────────────────────────── */}
      {(!showScryfall || isSearching) && (
        <div className="flex flex-col gap-1.5">
          <AnimatePresence mode="popLayout">
            {staticFiltered.map((kw) => {
              const isOpen = expanded === kw.name;
              return (
                <motion.div
                  key={kw.name}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <Card active={isOpen}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : kw.name)}
                      className="w-full p-3.5 text-left flex justify-between items-start gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-bold font-display text-mtg-gold">
                            {kw.name}
                          </span>
                          {isSearching && (
                            <span className="text-[10px] text-mtg-text-muted uppercase tracking-wider">
                              {kw.category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-mtg-text-dim mt-1 leading-relaxed">
                          {kw.rule}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-mtg-text-muted text-lg flex-shrink-0 transition-transform duration-200 mt-0.5",
                          isOpen && "rotate-90"
                        )}
                      >
                        ›
                      </span>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3.5 border-t border-mtg-border">
                            <div className="mt-3">
                              <SectionLabel>Example</SectionLabel>
                              <div className="text-[13px] text-mtg-text leading-relaxed p-2.5 bg-mtg-surface rounded-lg border-l-[3px] border-blue-500">
                                {kw.example}
                              </div>
                            </div>

                            <div className="mt-3">
                              <SectionLabel>Pro Tip</SectionLabel>
                              <div className="text-[13px] text-mtg-text leading-relaxed p-2.5 bg-mtg-surface rounded-lg border-l-[3px] border-mtg-gold">
                                {kw.tip}
                              </div>
                            </div>

                            {kw.related.length > 0 && (
                              <div className="mt-3">
                                <SectionLabel>Related</SectionLabel>
                                <div className="flex gap-1.5 flex-wrap">
                                  {kw.related.map((r) => (
                                    <button
                                      key={r}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRelatedClick(r);
                                      }}
                                      className="px-2.5 py-1 border border-mtg-border rounded-md bg-mtg-surface text-mtg-gold text-[11px] font-display hover:border-mtg-gold/50 transition-colors"
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {staticFiltered.length === 0 && apiFiltered.length === 0 && (
            <div className="text-center py-10 text-mtg-text-muted text-sm">
              No keywords match &quot;{search}&quot;
            </div>
          )}
        </div>
      )}

      {/* ── Scryfall / API keyword cards ──────────────────────────────────────── */}
      {(showScryfall || (isSearching && apiFiltered.length > 0)) && (
        <div className={cn("flex flex-col gap-1.5", isSearching && staticFiltered.length > 0 && "mt-4")}>
          {isSearching && staticFiltered.length > 0 && apiFiltered.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-px bg-mtg-border/40" />
              <span className="text-[10px] text-mtg-text-muted font-display uppercase tracking-wider">
                📡 Scryfall catalog
              </span>
              <div className="flex-1 h-px bg-mtg-border/40" />
            </div>
          )}

          {showScryfall && !isSearching && (
            <p className="text-[11px] text-mtg-text-muted mb-2 leading-relaxed">
              {apiKeywords.length} keyword{apiKeywords.length !== 1 && "s"} from the Scryfall
              catalog not yet in the static glossary.
            </p>
          )}

          {apiFiltered.map((kw) => (
            <motion.div
              key={kw.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-bold font-display text-mtg-gold">
                          {kw.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-500/30 text-blue-400 font-display font-semibold uppercase tracking-wider bg-blue-500/8">
                          {kw.category}
                        </span>
                      </div>
                      <p className="text-xs text-mtg-text-dim mt-1 leading-relaxed">
                        {kw.description}
                      </p>
                    </div>
                    <a
                      href={kw.scryfallUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 px-2 py-1 text-[10px] font-display font-semibold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 hover:border-blue-500/50 transition-colors whitespace-nowrap"
                    >
                      Scryfall →
                    </a>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Loading skeleton while API fetch is in flight */}
      {!apiLoaded && !isSearching && (
        <div className="mt-4 flex items-center gap-2 text-[11px] text-mtg-text-muted/40">
          <span className="animate-pulse">📡</span>
          <span>Checking Scryfall for new keywords…</span>
        </div>
      )}
    </div>
  );
}
