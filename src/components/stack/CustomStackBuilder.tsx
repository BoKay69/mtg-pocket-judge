"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StackItem, StackItemType } from "@/types";
import { Button, Card, Badge, SectionLabel } from "@/components/ui";
import { STACK_TYPE_COLORS, generateId, cn } from "@/lib/utils";
import { useCardAutocomplete } from "@/hooks";

const TYPES: { value: StackItemType; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "sorcery", label: "Sorcery" },
  { value: "creature", label: "Creature" },
  { value: "triggered", label: "Triggered" },
  { value: "activated", label: "Activated" },
];

export function CustomStackBuilder() {
  const [items, setItems] = useState<StackItem[]>([]);
  const [newOwner, setNewOwner] = useState<"Player A" | "Player B">("Player A");
  const [newType, setNewType] = useState<StackItemType>("instant");
  const [newTarget, setNewTarget] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedIdx, setResolvedIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { query, setQuery, suggestions, loading } = useCardAutocomplete();
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addItem = (cardName?: string) => {
    const name = cardName || query;
    if (!name.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: generateId(),
        card: name.trim(),
        owner: newOwner,
        type: newType,
        target: newTarget.trim() || "—",
        color: STACK_TYPE_COLORS[newType] || "#6b7280",
      },
    ]);
    setQuery("");
    setNewTarget("");
    setShowSuggestions(false);
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const resolveNext = () => {
    if (!resolving) {
      setResolving(true);
      setResolvedIdx(items.length - 1);
    } else if (resolvedIdx > 0) {
      setResolvedIdx((p) => p - 1);
    }
  };

  const resetStack = () => {
    setResolving(false);
    setResolvedIdx(-1);
  };

  const clearAll = () => {
    setItems([]);
    resetStack();
  };

  return (
    <div>
      <p className="text-sm text-mtg-text-dim mb-4 leading-relaxed">
        Build your own stack scenario. Add spells and abilities in the order
        they&apos;re cast, then step through LIFO resolution. Card names
        autocomplete from Scryfall.
      </p>

      {/* Input form */}
      {!resolving && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Card name with autocomplete */}
          <div className="col-span-2 relative" ref={suggestionsRef}>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Card or ability name..."
              className="w-full px-3.5 py-2.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-body outline-none focus:border-mtg-gold/50 transition-colors placeholder:text-mtg-text-muted"
            />

            {/* Autocomplete dropdown */}
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
                        addItem(name);
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

          <select
            value={newOwner}
            onChange={(e) =>
              setNewOwner(e.target.value as "Player A" | "Player B")
            }
            className="px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none"
          >
            <option value="Player A">Player A</option>
            <option value="Player B">Player B</option>
          </select>

          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as StackItemType)}
            className="px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <input
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder="Target (optional)"
            className="px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs font-body outline-none placeholder:text-mtg-text-muted"
          />

          <Button onClick={() => addItem()} size="sm">
            + Add to Stack
          </Button>
        </div>
      )}

      {/* Stack display */}
      {items.length > 0 && (
        <div className="mb-4">
          <SectionLabel>
            Stack ({items.length} items) — Top resolves first
          </SectionLabel>

          {[...items].reverse().map((item, visualIdx) => {
            const realIdx = items.length - 1 - visualIdx;
            const isResolved = resolving && realIdx > resolvedIdx;
            const isNext = resolving && realIdx === resolvedIdx;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{
                  opacity: isResolved ? 0.3 : 1,
                  scale: 1,
                }}
                className="flex items-center gap-2.5 mb-1.5"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-shadow duration-300"
                  style={{
                    background: item.color,
                    boxShadow: isNext ? `0 0 10px ${item.color}` : "none",
                  }}
                />

                <Card
                  className={cn(
                    "flex-1 !p-2.5 flex justify-between items-center",
                    isNext && "!border-mtg-gold"
                  )}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-bold font-display text-mtg-text">
                      {item.card}
                    </span>
                    <span className="text-[11px] text-mtg-text-muted ml-2">
                      {item.owner} · {item.type} · → {item.target}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {isNext && <Badge>Next</Badge>}
                    {isResolved && <Badge color="#22c55e">✓</Badge>}
                    {!resolving && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-mtg-text-muted hover:text-red-400 transition-colors px-1 text-lg"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      {items.length > 0 && (
        <div className="flex gap-2">
          <Button
            onClick={resolveNext}
            disabled={resolving && resolvedIdx < 0}
            className="flex-1"
          >
            {!resolving
              ? "▶ Resolve Stack (LIFO)"
              : resolvedIdx >= 0
                ? "Resolve Next →"
                : "✓ All Resolved"}
          </Button>
          <Button variant="secondary" onClick={resetStack}>
            ↺
          </Button>
          <Button variant="danger" onClick={clearAll} size="sm">
            Clear
          </Button>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !resolving && (
        <div className="text-center py-10 px-5 text-mtg-text-muted text-sm leading-relaxed border border-dashed border-mtg-border rounded-xl">
          Add spells and abilities to build your stack.
          <br />
          They resolve in Last-In, First-Out order.
        </div>
      )}
    </div>
  );
}
