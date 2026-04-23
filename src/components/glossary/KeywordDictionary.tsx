"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KEYWORDS, KEYWORD_CATEGORIES } from "@/data/keywords";
import type { KeywordCategory } from "@/types";
import { Card, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

export function KeywordDictionary() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<KeywordCategory>("Evergreen");
  const [expanded, setExpanded] = useState<string | null>(null);

  // If searching, show results across all categories
  const isSearching = search.length > 0;

  const getFilteredKeywords = () => {
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
    return (
      KEYWORDS[selectedCat]?.map((k) => ({
        ...k,
        category: selectedCat,
      })) || []
    );
  };

  const filtered = getFilteredKeywords();

  const handleRelatedClick = (name: string) => {
    // Find which category contains this keyword
    for (const [cat, entries] of Object.entries(KEYWORDS)) {
      if (entries.find((e) => e.name === name)) {
        setSelectedCat(cat as KeywordCategory);
        setExpanded(name);
        setSearch("");
        return;
      }
    }
  };

  return (
    <div>
      {/* Search */}
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
      </div>

      {/* Category tabs */}
      {!isSearching && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {KEYWORD_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCat(cat);
                setExpanded(null);
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-display font-semibold border transition-all duration-200",
                selectedCat === cat
                  ? "border-mtg-gold bg-mtg-gold/10 text-mtg-gold"
                  : "border-mtg-border text-mtg-text-dim hover:border-mtg-border-light"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {isSearching && filtered.length > 0 && (
        <p className="text-xs text-mtg-text-muted mb-3">
          {filtered.length} result{filtered.length !== 1 && "s"} across all
          categories
        </p>
      )}

      {/* Keyword list */}
      <div className="flex flex-col gap-1.5">
        <AnimatePresence mode="popLayout">
          {filtered.map((kw) => {
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
                  {/* Header — always visible */}
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

                  {/* Expanded content */}
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
                          {/* Example */}
                          <div className="mt-3">
                            <SectionLabel>Example</SectionLabel>
                            <div className="text-[13px] text-mtg-text leading-relaxed p-2.5 bg-mtg-surface rounded-lg border-l-[3px] border-blue-500">
                              {kw.example}
                            </div>
                          </div>

                          {/* Pro tip */}
                          <div className="mt-3">
                            <SectionLabel>Pro Tip</SectionLabel>
                            <div className="text-[13px] text-mtg-text leading-relaxed p-2.5 bg-mtg-surface rounded-lg border-l-[3px] border-mtg-gold">
                              {kw.tip}
                            </div>
                          </div>

                          {/* Related keywords */}
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

        {filtered.length === 0 && (
          <div className="text-center py-10 text-mtg-text-muted text-sm">
            No keywords match &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
