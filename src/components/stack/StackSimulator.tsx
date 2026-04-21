"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createInitialState, processAction, canUndo, cardToPermanent, cardToStackItem, detectTargetRequirement } from "@/engine";
import type { GameState, PlayerId, EngineStackItem, Permanent, LogEntry } from "@/engine/types";
import { STEP_LABELS } from "@/engine/types";
import { generateId } from "@/engine/utils";
import { SCENARIO_PRESETS, loadPreset } from "@/data/presets";
import type { ScenarioPreset } from "@/data/presets";
import { Button, Card, Badge, SectionLabel } from "@/components/ui";
import { useCardAutocomplete, useCardFetch } from "@/hooks";
import { cn } from "@/lib/utils";
import type { ScryfallCard } from "@/types";

const SPELL_TYPE_COLORS: Record<string, string> = { instant: "#3b82f6", sorcery: "#8b5cf6", creature: "#22c55e", artifact: "#94a3b8", enchantment: "#c084fc", planeswalker: "#f97316", triggered_ability: "#f59e0b", activated_ability: "#ec4899" };
const LOG_COLORS: Record<string, string> = { cast_spell: "#3b82f6", activate_ability: "#ec4899", trigger: "#f59e0b", resolve: "#22c55e", counter: "#dc2626", fizzle: "#6b7280", priority_pass: "#6b7280", priority_receive: "#8b5cf6", phase_change: "#c9a961", state_based_action: "#dc2626", game_event: "#6b7280", explanation: "#c9a961" };
const LOG_ICONS: Record<string, string> = { explanation: "\u{1F4A1}", trigger: "\u26A1", resolve: "\u2713", fizzle: "\u2717", state_based_action: "\u2620", phase_change: "\u23F5", cast_spell: "\u{1F0CF}", activate_ability: "\u2699" };

function pLabel(state: GameState, pid: PlayerId): string { return state.players[pid]?.label || pid; }
function itemColor(item: EngineStackItem): string { return SPELL_TYPE_COLORS[item.type === "triggered_ability" ? "triggered_ability" : item.spellType || "instant"] || "#6b7280"; }

// Card back placeholder for items without images
const CARD_BACK = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88" fill="none"><rect width="63" height="88" rx="4" fill="#1a1a2e"/><rect x="4" y="4" width="55" height="80" rx="2" stroke="#c9a961" stroke-width="1" fill="none"/><text x="31.5" y="48" text-anchor="middle" fill="#c9a961" font-size="24" font-family="serif">?</text></svg>');

// ─── Scenario Dropdown ───────────────────────────────────────────────────────

function ScenarioDropdown({ onSelect, format }: { onSelect: (p: ScenarioPreset) => void; format: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-mtg-border bg-mtg-card text-sm font-display font-semibold text-mtg-text-dim hover:border-mtg-border-light transition-all">
        <span>{"\u{1F4DA}"} Example Scenarios</span>
        <span className={cn("transition-transform text-xs", open && "rotate-180")}>{"\u25BE"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-1.5 space-y-1.5 max-h-64 overflow-y-auto">
              {SCENARIO_PRESETS.map((p) => (
                <button key={p.id} onClick={() => { onSelect(p); setOpen(false); }} className="w-full text-left">
                  <Card className="!p-3 hover:!border-mtg-gold/50 transition-all">
                    <div className="flex items-center gap-2"><span className="text-xs font-display font-bold text-mtg-text">{p.name}</span><Badge>{p.category}</Badge></div>
                    <p className="text-[11px] text-mtg-text-dim mt-0.5">{p.description}</p>
                  </Card>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Player Panel ────────────────────────────────────────────────────────────

function PlayerPanel({ player, isActive, hasPriority }: { player: { id: PlayerId; label: string; life: number }; isActive: boolean; hasPriority: boolean }) {
  return (
    <div className={cn("flex-1 p-2.5 rounded-xl border transition-all duration-300 min-w-0", hasPriority ? "border-mtg-gold bg-mtg-gold/10" : "border-mtg-border bg-mtg-card")}>
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs font-display font-bold text-mtg-text flex items-center gap-1 flex-wrap">
          {player.label}
          {isActive && <Badge>Turn</Badge>}
          {hasPriority && <Badge color="#22c55e">Priority</Badge>}
        </div>
        <div className="text-xl font-display font-bold text-mtg-text flex-shrink-0">{player.life}</div>
      </div>
    </div>
  );
}

function PlayerGrid({ gameState }: { gameState: GameState }) {
  const pp = gameState.priority.priorityHolder;
  const order = gameState.playerOrder;
  // Circular: A(TL) B(TR) D(BL) C(BR) for 4 players
  const seats = order.length === 4 ? [order[0], order[1], order[3], order[2]] : order;
  return (
    <div className="grid grid-cols-2 gap-2">
      {seats.map((pid) => <PlayerPanel key={pid} player={gameState.players[pid]!} isActive={gameState.activePlayer === pid} hasPriority={pp === pid} />)}
    </div>
  );
}

// ─── Visual Card Stack ───────────────────────────────────────────────────────

function VisualCardStack({ stack, gameState }: { stack: EngineStackItem[]; gameState: GameState }) {
  if (stack.length === 0) return <div className="text-center py-6 text-mtg-text-muted text-xs border border-dashed border-mtg-border rounded-xl">Stack is empty — cast a spell to begin</div>;

  const reversed = [...stack].reverse();
  return (
    <div className="relative flex flex-col items-center py-4">
      <div className="relative" style={{ height: Math.min(reversed.length * 60 + 140, 400) }}>
        {reversed.map((item, i) => {
          const isTop = i === 0;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: i * 55, scale: 1 }}
              transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 25 }}
              className="absolute left-1/2"
              style={{ transform: `translateX(-50%)`, zIndex: reversed.length - i }}
            >
              <div className={cn("relative group", isTop && "animate-pulse-subtle")}>
                {/* Card image */}
                <img
                  src={item.imageUri || CARD_BACK}
                  alt={item.name}
                  className={cn("w-28 rounded-lg shadow-lg border-2 transition-all", isTop ? "border-mtg-gold shadow-mtg-gold/30" : "border-mtg-border/50")}
                  loading="lazy"
                />
                {/* Label overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent rounded-b-lg px-1.5 py-1">
                  <div className="text-[9px] font-display font-bold text-white leading-tight truncate">{item.name}</div>
                  <div className="text-[8px] text-white/70">{pLabel(gameState, item.controller)}</div>
                </div>
                {isTop && (
                  <div className="absolute -top-2 -right-2 z-10">
                    <Badge>Next</Badge>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Resolution Modal ────────────────────────────────────────────────────────

interface ResolutionStep {
  item: EngineStackItem;
  logEntries: LogEntry[];
  status: "resolving" | "resolved" | "fizzled";
}

function ResolutionModal({ steps, onClose, gameState }: { steps: ResolutionStep[]; onClose: () => void; gameState: GameState }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (autoPlay && currentStep < steps.length - 1) {
      const timer = setTimeout(() => setCurrentStep((p) => p + 1), 2000);
      return () => clearTimeout(timer);
    }
    if (autoPlay && currentStep >= steps.length - 1) setAutoPlay(false);
  }, [autoPlay, currentStep, steps.length]);

  const step = steps[currentStep];
  if (!step) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-mtg-bg border border-mtg-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-mtg-border">
          <div className="text-sm font-display font-bold text-mtg-gold">Resolving Stack</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mtg-text-muted">{currentStep + 1} / {steps.length}</span>
            <button onClick={onClose} className="text-mtg-text-muted hover:text-mtg-text text-lg leading-none">&times;</button>
          </div>
        </div>

        {/* Card animation area */}
        <div className="relative flex flex-col items-center py-6 px-4 min-h-[280px]">
          {/* Cards remaining (stacked behind) */}
          {steps.slice(currentStep + 1).reverse().map((s, i) => (
            <div key={s.item.id} className="absolute" style={{ top: 24 + i * 4, zIndex: i, opacity: 0.3 - i * 0.08 }}>
              <img src={s.item.imageUri || CARD_BACK} alt="" className="w-32 rounded-lg border border-mtg-border/30" />
            </div>
          ))}

          {/* Current resolving card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step.item.id}
              initial={{ opacity: 0, y: -30, rotateZ: -3 }}
              animate={{ opacity: 1, y: 0, rotateZ: 0 }}
              exit={{ opacity: 0, x: step.status === "fizzled" ? 0 : 200, y: step.status === "fizzled" ? 50 : -20, rotateZ: step.status === "fizzled" ? 15 : 8 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative z-20"
            >
              <img
                src={step.item.imageUri || CARD_BACK}
                alt={step.item.name}
                className={cn("w-40 rounded-xl shadow-2xl border-2", step.status === "fizzled" ? "border-red-500 opacity-60" : step.status === "resolved" ? "border-green-500" : "border-mtg-gold")}
              />
              {/* Status badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30">
                <Badge color={step.status === "fizzled" ? "#dc2626" : step.status === "resolved" ? "#22c55e" : "#c9a961"}>
                  {step.status === "fizzled" ? "Fizzled" : step.status === "resolved" ? "Resolved" : "Resolving"}
                </Badge>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Resolution text */}
        <div className="px-4 pb-3">
          <div className="text-sm font-display font-bold text-mtg-text mb-1">{step.item.name}</div>
          <div className="text-xs text-mtg-text-dim mb-2">
            {pLabel(gameState, step.item.controller)} &middot;
            {step.item.targets.length > 0 && ` Target: ${step.item.targets.map((t) => t.name).join(", ")}`}
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {step.logEntries.map((entry, i) => (
              <div key={i} className="text-[12px] leading-relaxed" style={{ color: LOG_COLORS[entry.type] || "#8a8894" }}>
                {LOG_ICONS[entry.type] ? `${LOG_ICONS[entry.type]} ` : ""}{entry.text}
                {entry.detail && <div className="text-[11px] text-mtg-text-muted mt-0.5 pl-3 border-l border-mtg-border">{entry.detail}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <div key={i} className={cn("w-2 h-2 rounded-full transition-all", i === currentStep ? "bg-mtg-gold scale-125" : i < currentStep ? "bg-green-500" : "bg-mtg-border")} />
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="secondary" size="sm" onClick={() => setCurrentStep((p) => Math.max(0, p - 1))} disabled={currentStep === 0}>&larr; Prev</Button>
          <Button className="flex-1" size="sm" onClick={() => {
            if (currentStep >= steps.length - 1) { onClose(); }
            else { setCurrentStep((p) => p + 1); }
          }}>
            {currentStep >= steps.length - 1 ? "Done" : "Next \u2192"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAutoPlay(!autoPlay)}>{autoPlay ? "Pause" : "Auto"}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Battlefield Display ─────────────────────────────────────────────────────

function BattlefieldDisplay({ permanents, playerId, playerLabel }: { permanents: Permanent[]; playerId: PlayerId; playerLabel: string }) {
  const pp = permanents.filter((p) => p.controller === playerId);
  if (pp.length === 0) return <div className="text-[11px] text-mtg-text-muted italic py-1">{playerLabel}: No permanents</div>;
  return (
    <div className="mb-1.5">
      <div className="text-[10px] text-mtg-text-muted uppercase tracking-wider mb-1 font-bold">{playerLabel}</div>
      <div className="flex flex-wrap gap-1.5">
        {pp.map((perm) => (
          <div key={perm.id} className={cn("px-2.5 py-1.5 rounded-lg text-[11px] border", perm.tapped ? "border-mtg-border bg-mtg-surface opacity-60" : "border-mtg-border-light bg-mtg-card")}>
            <span className="font-display font-bold text-mtg-text">{perm.name}</span>
            {perm.basePower !== undefined && <span className="text-mtg-text-dim ml-1">{perm.currentPower ?? perm.basePower}/{perm.currentToughness ?? perm.baseToughness}{perm.damageMarked > 0 && <span className="text-red-400 ml-0.5">({perm.damageMarked})</span>}</span>}
            {perm.keywords.length > 0 && <div className="flex gap-1 mt-0.5 flex-wrap">{perm.keywords.map((kw) => <span key={kw} className="text-[9px] text-mtg-gold bg-mtg-gold/10 px-1 rounded capitalize">{kw.replace("_", " ")}</span>)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card Preview ────────────────────────────────────────────────────────────

function CardPreview({ card, targetReq }: { card: ScryfallCard; targetReq: ReturnType<typeof detectTargetRequirement> }) {
  return (
    <div className="flex gap-2.5 p-2 bg-mtg-surface rounded-lg border border-mtg-border">
      {card.image_uris?.small && <img src={card.image_uris.small} alt={card.name} className="w-16 rounded flex-shrink-0" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-display font-bold text-mtg-text">{card.name}</div>
        <div className="text-[10px] text-mtg-text-muted">{card.type_line}</div>
        {card.power && <div className="text-[10px] text-mtg-text-dim">{card.power}/{card.toughness}</div>}
        {targetReq && <div className="mt-1 text-[10px] text-red-400 font-bold">{"\u{1F3AF}"} Requires: {targetReq.description}</div>}
        {!targetReq && card.oracle_text && <div className="text-[10px] text-mtg-text-dim mt-1 line-clamp-2">{card.oracle_text}</div>}
      </div>
    </div>
  );
}

// ─── Cast Spell Form ─────────────────────────────────────────────────────────

function CastSpellForm({ gameState, onCast }: { gameState: GameState; onCast: (item: Omit<EngineStackItem, "id" | "timestamp">) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [controller, setController] = useState<PlayerId>(gameState.playerOrder[0]);
  const [target, setTarget] = useState("");
  const [targetError, setTargetError] = useState("");
  const { query, setQuery, suggestions } = useCardAutocomplete();
  const { card, loading: cardLoading, fetchCard, clearCard } = useCardFetch();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const targetReq = card ? detectTargetRequirement(card) : null;

  const handleSelectCard = async (name: string) => { setQuery(name); setShowSuggestions(false); setTarget(""); setTargetError(""); await fetchCard(name); };

  const handleCast = () => {
    if (!card) return;
    if (targetReq?.required && !target.trim()) { setTargetError(`Required: ${targetReq.description}`); return; }
    const targets = target.trim() ? [{ type: "permanent" as const, id: generateId(), name: target.trim(), isLegal: true }] : [];
    onCast(cardToStackItem(card, controller, targets));
    setQuery(""); setTarget(""); setTargetError(""); clearCard(); setShowForm(false);
  };

  if (!showForm) return <Button onClick={() => setShowForm(true)} className="w-full" disabled={gameState.priority.splitSecondActive}>{gameState.priority.splitSecondActive ? "Split second \u2014 cannot respond" : "+ Cast Spell"}</Button>;

  return (
    <Card className="!p-3">
      <div className="text-xs font-display font-bold text-mtg-text-dim uppercase tracking-wider mb-2">Cast Spell</div>
      <div className="space-y-2">
        <div className="relative">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); clearCard(); setTargetError(""); }} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} placeholder="Search card name..." className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-display outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted" />
          {cardLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-mtg-text-muted animate-pulse">Fetching...</div>}
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && !card && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                {suggestions.slice(0, 8).map((name) => <button key={name} onClick={() => handleSelectCard(name)} className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0">{name}</button>)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {card && <CardPreview card={card} targetReq={targetReq} />}
        <select value={controller} onChange={(e) => setController(e.target.value as PlayerId)} className="w-full px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none">
          {gameState.playerOrder.map((pid) => <option key={pid} value={pid}>{gameState.players[pid]!.label}</option>)}
        </select>
        {card && (
          <div>
            <input value={target} onChange={(e) => { setTarget(e.target.value); setTargetError(""); }} placeholder={targetReq?.required ? `\u{1F3AF} ${targetReq.description} (required)` : "Target (optional)"} className={cn("w-full px-3 py-1.5 bg-mtg-surface border rounded-lg text-mtg-text text-xs font-display outline-none placeholder:text-mtg-text-muted", targetError ? "border-red-500" : targetReq?.required ? "border-amber-600/50" : "border-mtg-border")} />
            {targetError && <div className="text-[10px] text-red-400 mt-1">{targetError}</div>}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={handleCast} className="flex-1" size="sm" disabled={!card}>{card ? `Cast ${card.name}` : "Select a card"}</Button>
          <Button variant="ghost" onClick={() => { setShowForm(false); clearCard(); setQuery(""); }} size="sm">Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Add Permanent Form ──────────────────────────────────────────────────────

function AddPermanentForm({ gameState, onAdd }: { gameState: GameState; onAdd: (perm: Omit<Permanent, "id">) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [controller, setController] = useState<PlayerId>("player_a");
  const { query, setQuery, suggestions } = useCardAutocomplete();
  const { card, loading: cardLoading, fetchCard, clearCard } = useCardFetch();
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!showForm) return <button onClick={() => setShowForm(true)} className="w-full py-2 text-xs text-mtg-text-dim hover:text-mtg-gold border border-dashed border-mtg-border rounded-lg transition-colors font-display">+ Add Permanent to Battlefield</button>;
  return (
    <Card className="!p-3">
      <SectionLabel>Add permanent</SectionLabel>
      <div className="space-y-2">
        <div className="relative">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); clearCard(); }} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} placeholder="Search card name..." className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-display outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted" />
          {cardLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-mtg-text-muted animate-pulse">Fetching...</div>}
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && !card && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                {suggestions.slice(0, 8).map((n) => <button key={n} onClick={() => { setQuery(n); setShowSuggestions(false); fetchCard(n); }} className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0">{n}</button>)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {card && <CardPreview card={card} targetReq={null} />}
        <select value={controller} onChange={(e) => setController(e.target.value as PlayerId)} className="w-full px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none">
          {gameState.playerOrder.map((pid) => <option key={pid} value={pid}>{gameState.players[pid]!.label}</option>)}
        </select>
        <div className="flex gap-2">
          <Button onClick={() => { if (!card) return; onAdd(cardToPermanent(card, controller)); setQuery(""); clearCard(); setShowForm(false); }} className="flex-1" size="sm" disabled={!card}>{card ? `Add ${card.name}` : "Select a card"}</Button>
          <Button variant="ghost" onClick={() => { setShowForm(false); clearCard(); setQuery(""); }} size="sm">Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Lesson Banner ───────────────────────────────────────────────────────────

function LessonBanner({ preset }: { preset: ScenarioPreset }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
      <Card className="!p-3 !border-mtg-gold/30 bg-mtg-gold/5">
        <div className="flex items-start gap-2">
          <span className="text-sm mt-0.5">{"\u{1F4CB}"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-display font-bold text-mtg-gold">{preset.name}<span className="text-mtg-text-muted font-normal ml-2">{expanded ? "\u25BE" : "\u25B8"} Key lesson</span></div>
            {expanded && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="text-xs text-mtg-text leading-relaxed mt-1.5">{preset.lesson}</motion.p>}
          </div>
        </div>
      </Card>
    </button>
  );
}

// ─── Action Log (secondary, below visual) ────────────────────────────────────

function ActionLog({ log, logEndRef }: { log: LogEntry[]; logEndRef: React.RefObject<HTMLDivElement | null> }) {
  if (log.length === 0) return null;
  return (
    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
      {log.map((entry) => (
        <div key={entry.id} className={cn("px-2.5 py-1 rounded text-[11px] leading-relaxed", entry.highlight ? "bg-mtg-surface" : "")}>
          <span className="font-display" style={{ color: LOG_COLORS[entry.type] || "#8a8894" }}>
            {LOG_ICONS[entry.type] ? `${LOG_ICONS[entry.type]} ` : ""}{entry.text}
          </span>
          {entry.detail && <span className="text-mtg-text-muted ml-1">— {entry.detail}</span>}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

// ─── Resolve Stack Logic ─────────────────────────────────────────────────────

function buildResolutionSteps(beforeState: GameState): { steps: ResolutionStep[]; finalState: GameState } {
  const steps: ResolutionStep[] = [];
  let state = structuredClone(beforeState);
  let safety = 0;

  while (state.stack.length > 0 && safety < 100) {
    safety++;
    const topItem = structuredClone(state.stack[state.stack.length - 1]);
    const logBefore = state.actionLog.length;

    // Pass priority until resolution happens
    let innerSafety = 0;
    const stackSizeBefore = state.stack.length;
    while (state.stack.length >= stackSizeBefore && innerSafety < 50) {
      innerSafety++;
      state = processAction(state, { type: "pass_priority" });
    }

    const newEntries = state.actionLog.slice(logBefore);
    const fizzled = newEntries.some((e) => e.type === "fizzle");

    steps.push({
      item: topItem,
      logEntries: newEntries,
      status: fizzled ? "fizzled" : "resolved",
    });
  }

  return { steps, finalState: state };
}

// ─── Main Simulator ──────────────────────────────────────────────────────────

export function StackSimulator({ format = "modern" }: { format?: string }) {
  const [gameState, setGameState] = useState<GameState>(() => {
    const isCmd = format === "commander";
    return createInitialState({ format, playerCount: isCmd ? 4 : 2, startingLife: isCmd ? 40 : 20 });
  });
  const [activePreset, setActivePreset] = useState<ScenarioPreset | null>(null);
  const [resolutionSteps, setResolutionSteps] = useState<ResolutionStep[] | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isCmd = format === "commander";
    setGameState(createInitialState({ format, playerCount: isCmd ? 4 : 2, startingLife: isCmd ? 40 : 20 }));
    setActivePreset(null);
  }, [format]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [gameState.actionLog.length]);

  const dispatch = useCallback((action: Parameters<typeof processAction>[1]) => {
    setGameState((prev) => processAction(prev, action));
  }, []);

  const handleSelectPreset = (preset: ScenarioPreset) => { setActivePreset(preset); setGameState(loadPreset(preset, format)); };
  const handleReset = () => {
    if (activePreset) { setGameState(loadPreset(activePreset, format)); }
    else { const isCmd = format === "commander"; setGameState(createInitialState({ format, playerCount: isCmd ? 4 : 2, startingLife: isCmd ? 40 : 20 })); }
  };

  const handleResolveStack = () => {
    if (gameState.stack.length === 0) return;
    const { steps, finalState } = buildResolutionSteps(gameState);
    setResolutionSteps(steps);
    setGameState(finalState);
  };

  const handleCloseResolution = () => setResolutionSteps(null);

  return (
    <div className="space-y-3">
      <style>{`.animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; } @keyframes pulse-subtle { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.15); } }`}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-mtg-text-muted uppercase tracking-wider font-bold">Turn {gameState.turnNumber} &middot; {pLabel(gameState, gameState.activePlayer)}&apos;s Turn</div>
          <div className="text-sm font-display font-bold text-mtg-gold mt-0.5">{STEP_LABELS[gameState.currentStep]}</div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "undo" })} disabled={!canUndo()}>Undo</Button>
          <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </div>

      <ScenarioDropdown onSelect={handleSelectPreset} format={format} />
      {activePreset && <LessonBanner preset={activePreset} />}

      <PlayerGrid gameState={gameState} />

      {/* Battlefield */}
      <div>
        <SectionLabel>Battlefield</SectionLabel>
        {gameState.playerOrder.map((pid) => <BattlefieldDisplay key={pid} permanents={gameState.battlefield} playerId={pid} playerLabel={pLabel(gameState, pid)} />)}
        <AddPermanentForm gameState={gameState} onAdd={(perm) => dispatch({ type: "add_permanent", permanent: perm })} />
      </div>

      {/* Visual Card Stack */}
      <div>
        <SectionLabel>The Stack ({gameState.stack.length} item{gameState.stack.length !== 1 && "s"})</SectionLabel>
        <VisualCardStack stack={gameState.stack} gameState={gameState} />
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <CastSpellForm gameState={gameState} onCast={(item) => dispatch({ type: "cast_spell", spell: item })} />
        {gameState.stack.length > 0 && (
          <Button onClick={handleResolveStack} className="w-full" variant="primary">
            {"\u25B6"} Resolve Stack ({gameState.stack.length} item{gameState.stack.length !== 1 ? "s" : ""})
          </Button>
        )}
        {gameState.stack.length === 0 && (
          <Button variant="ghost" onClick={() => dispatch({ type: "advance_phase" })} className="w-full" size="sm">Next Phase &rarr;</Button>
        )}
      </div>

      {/* Action Log (secondary) */}
      {gameState.actionLog.length > 0 && (
        <div>
          <SectionLabel>Log</SectionLabel>
          <Card className="!p-2"><ActionLog log={gameState.actionLog} logEndRef={logEndRef} /></Card>
        </div>
      )}

      {/* Graveyards */}
      {gameState.playerOrder.some((pid) => (gameState.graveyards[pid]?.length || 0) > 0) && (
        <div>
          <SectionLabel>Graveyards</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {gameState.playerOrder.map((pid) => (
              <div key={pid} className="text-[11px] text-mtg-text-dim"><span className="font-bold">{pLabel(gameState, pid)}:</span> {(gameState.graveyards[pid]?.length || 0) === 0 ? "Empty" : gameState.graveyards[pid]!.join(", ")}</div>
            ))}
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      <AnimatePresence>
        {resolutionSteps && <ResolutionModal steps={resolutionSteps} onClose={handleCloseResolution} gameState={gameState} />}
      </AnimatePresence>
    </div>
  );
}
