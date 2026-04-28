"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createInitialState, processAction, canUndo, cardToPermanent, cardToStackItem, detectTargetRequirement, parseActivatedAbilities, abilityToStackItem } from "@/engine";
import type { GameState, PlayerId, EngineStackItem, Permanent, LogEntry, TurnStep } from "@/engine/types";
import { STEP_LABELS } from "@/engine/types";
import { generateId } from "@/engine/utils";
import { SCENARIO_PRESETS, loadPreset, hydratePresetImages } from "@/data/presets";
import type { ScenarioPreset } from "@/data/presets";
import { getMetaDecks } from "@/data/metaDecks";
import type { ActivatedAbilityInfo } from "@/engine";
import { Button, Card, Badge, SectionLabel } from "@/components/ui";
import { useCardAutocomplete, useCardFetch } from "@/hooks";
import { cn } from "@/lib/utils";
import { fetchTokenImage } from "@/lib/scryfall";
import type { ScryfallCard } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_COLORS: Record<string, string> = { cast_spell: "#3b82f6", activate_ability: "#ec4899", trigger: "#f59e0b", resolve: "#22c55e", counter: "#dc2626", fizzle: "#6b7280", priority_pass: "#6b7280", priority_receive: "#8b5cf6", phase_change: "#c9a961", state_based_action: "#dc2626", game_event: "#6b7280", explanation: "#c9a961" };
const LOG_ICONS: Record<string, string> = { explanation: "\u{1F4A1}", trigger: "\u26A1", resolve: "\u2713", fizzle: "\u2717", state_based_action: "\u2620", phase_change: "\u23F5", cast_spell: "\u{1F0CF}", activate_ability: "\u2699" };

function pLabel(s: GameState, p: PlayerId): string { return s.players[p]?.label || p; }

const CARD_BACK = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88" fill="none"><rect width="63" height="88" rx="4" fill="#1a1a2e"/><rect x="4" y="4" width="55" height="80" rx="2" stroke="#c9a961" stroke-width="1" fill="none"/><text x="31.5" y="48" text-anchor="middle" fill="#c9a961" font-size="24" font-family="serif">?</text></svg>');

const PHASE_OPTIONS: { value: TurnStep; label: string }[] = [
  { value: "upkeep", label: "Upkeep" },
  { value: "draw", label: "Draw Step" },
  { value: "main", label: "Main Phase 1" },
  { value: "begin_combat", label: "Beginning of Combat" },
  { value: "declare_attackers", label: "Declare Attackers" },
  { value: "declare_blockers", label: "Declare Blockers" },
  { value: "combat_damage", label: "Combat Damage" },
  { value: "main_2", label: "Main Phase 2" },
  { value: "end_step", label: "End Step" },
];

// ─── Scenario Dropdown ───────────────────────────────────────────────────────

function ScenarioDropdown({ onSelect }: { onSelect: (p: ScenarioPreset) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-mtg-border bg-mtg-card text-sm font-display font-semibold text-mtg-text-dim hover:border-mtg-border-light transition-all">
        <span>{"\u{1F4DA}"} Example Scenarios</span>
        <span className={cn("transition-transform text-xs", open && "rotate-180")}>{"\u25BE"}</span>
      </button>
      <AnimatePresence>{open && (
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
      )}</AnimatePresence>
    </div>
  );
}

// ─── Player Panel & Grid ─────────────────────────────────────────────────────

function PlayerPanel({ player, isActive, hasPriority }: { player: { id: PlayerId; label: string; life: number; energyCounters?: number }; isActive: boolean; hasPriority: boolean }) {
  return (
    <div className={cn("flex-1 p-2.5 rounded-xl border transition-all duration-300 min-w-0", hasPriority ? "border-mtg-gold bg-mtg-gold/10" : "border-mtg-border bg-mtg-card")}>
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs font-display font-bold text-mtg-text flex items-center gap-1 flex-wrap">
          {player.label}
          {isActive && <Badge>Turn</Badge>}
          {hasPriority && <Badge color="#22c55e">Priority</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(player.energyCounters ?? 0) > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] font-bold text-yellow-400" title="Energy counters">
              <span>⚡</span>
              <span>{player.energyCounters}</span>
            </div>
          )}
          <div className="text-xl font-display font-bold text-mtg-text">{player.life}</div>
        </div>
      </div>
    </div>
  );
}

function PlayerGrid({ gs }: { gs: GameState }) {
  const pp = gs.priority.priorityHolder;
  const o = gs.playerOrder;
  const seats = o.length === 4 ? [o[0], o[1], o[3], o[2]] : o;
  return (
    <div className="grid grid-cols-2 gap-2">
      {seats.map((pid) => <PlayerPanel key={pid} player={gs.players[pid]!} isActive={gs.activePlayer === pid} hasPriority={pp === pid} />)}
    </div>
  );
}

// ─── Battlefield Display (card images) ───────────────────────────────────────

// Module-level cache: token name → image URL (null = not found, undefined = not yet fetched)
const tokenImageCache = new Map<string, string | null>();

function BattlefieldDisplay({ permanents, playerId, playerLabel, tokenImages, onTransform }: { permanents: Permanent[]; playerId: PlayerId; playerLabel: string; tokenImages: Record<string, string>; onTransform?: (id: string) => void }) {
  const pp = permanents.filter((p) => p.controller === playerId);
  if (pp.length === 0) return <div className="text-[11px] text-mtg-text-muted italic py-1">{playerLabel}: No permanents</div>;
  return (
    <div className="mb-2">
      <div className="text-[10px] text-mtg-text-muted uppercase tracking-wider mb-1.5 font-bold">{playerLabel}</div>
      <div className="flex flex-wrap gap-2">
        {pp.map((perm) => {
          const imgSrc = perm.imageUri || (perm.isToken ? tokenImages[perm.name] : undefined);
          const hasCounters = Object.keys(perm.counters).length > 0;
          const isDFC = !!perm.cardFaces;
          return (
            <div key={perm.id} className={cn("relative group flex flex-col items-center gap-0.5", perm.tapped && "opacity-60")}>
              <div className="relative">
                {imgSrc ? (
                  <img src={imgSrc} alt={perm.name} className={cn("w-20 rounded-lg border shadow-md", perm.tapped ? "border-mtg-border rotate-[15deg]" : "border-mtg-border-light hover:border-mtg-gold/50")} style={{ minHeight: "112px" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-20 h-28 rounded-lg border border-mtg-border-light bg-mtg-card flex flex-col items-center justify-center p-1">
                    <span className="text-[10px] font-display font-bold text-mtg-text text-center leading-tight">{perm.name}</span>
                    {perm.basePower !== undefined && <span className="text-[9px] text-mtg-text-dim mt-0.5">{perm.currentPower ?? perm.basePower}/{perm.currentToughness ?? perm.baseToughness}</span>}
                  </div>
                )}
                {perm.damageMarked > 0 && <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow">{perm.damageMarked}</div>}
                {perm.triggers.length > 0 && <div className="absolute -top-1 -left-1 bg-amber-500 text-black text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow" title={perm.triggers.map(t => `${t.event}: ${t.condition}`).join("\n")}>{perm.triggers.length}</div>}
              </div>
              {/* Counter badges */}
              {hasCounters && (
                <div className="flex flex-wrap gap-0.5 max-w-[80px] justify-center">
                  {Object.entries(perm.counters).map(([type, count]) => (
                    <span key={type} className="px-1 py-0.5 rounded text-[8px] font-bold bg-blue-700/80 text-white border border-blue-500/50" title={`${count} ${type} counter${count !== 1 ? "s" : ""}`}>
                      {type === "+1/+1" ? `+${count}` : type === "-1/-1" ? `-${count}` : `${count} ${type[0]}`}
                    </span>
                  ))}
                </div>
              )}
              {/* Transform button for DFC permanents */}
              {isDFC && onTransform && (
                <button
                  onClick={() => onTransform(perm.id)}
                  className="w-full px-1 py-0.5 rounded text-[8px] font-bold bg-indigo-800/70 text-indigo-200 border border-indigo-500/50 hover:bg-indigo-700/80 transition-colors"
                  title={`Transform (face ${(perm.currentFace ?? 0) + 1}/2)`}
                >
                  ⇌ Transform
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Visual Card Stack (LIFO — top of stack at top) ────────────────────────

type StackDisplayItem = { kind: "stack"; item: EngineStackItem; isFirst: boolean; isLast: boolean };

function buildStackDisplay(stack: EngineStackItem[]): StackDisplayItem[] {
  const topFirst = [...stack].reverse();
  return topFirst.map((item, i) => ({
    kind: "stack" as const,
    item,
    isFirst: i === 0,
    isLast: i === topFirst.length - 1,
  }));
}

function VisualCardStack({ stack, gs }: { stack: EngineStackItem[]; gs: GameState }) {
  if (stack.length === 0) return <div className="text-center py-6 text-mtg-text-muted text-sm border border-dashed border-mtg-border rounded-xl">Stack is empty &mdash; add a spell or ability to begin</div>;

  const displayItems = buildStackDisplay(stack);

  // Cap visible cards to avoid rendering hundreds; show a badge for overflow
  const MAX_VISIBLE = 30;
  const overflow = displayItems.length > MAX_VISIBLE ? displayItems.length - MAX_VISIBLE : 0;
  const visible = overflow > 0 ? displayItems.slice(0, MAX_VISIBLE) : displayItems;

  return (
    <div className="flex flex-col items-center py-4">
      {visible.map(({ item, isFirst, isLast }, i) => (
        <motion.div key={item.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 10) * 0.04 }} style={{ marginTop: i === 0 ? 0 : -75, zIndex: visible.length - i }} className="relative">
          <div className={cn("relative", isFirst && "animate-pulse-subtle")}>
            <img
              src={item.imageUri || CARD_BACK} alt={item.name} width={112} height={156}
              className={cn("rounded-lg shadow-lg border-2 block",
                isFirst ? "border-mtg-gold shadow-mtg-gold/30"
                  : item.isStormCopy ? "border-purple-500/60"
                  : "border-mtg-border/50"
              )}
              onError={(e) => { (e.target as HTMLImageElement).src = CARD_BACK; }}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent rounded-b-lg px-1.5 py-1">
              <div className="text-[9px] font-display font-bold text-white leading-tight truncate">{item.name}</div>
              <div className="text-[8px] text-white/70">
                {pLabel(gs, item.controller)}
                {item.isStormCopy ? ` · Storm Copy ${item.stormCopyIndex}` : item.type === "triggered_ability" ? " · Trigger" : item.type === "activated_ability" ? " · Ability" : ""}
                {item.xValue !== undefined ? ` · X=${item.xValue}` : ""}
              </div>
            </div>
            {isFirst && (
              <div className="absolute -top-2 -right-2 z-10">
                <Badge color="#22c55e">&#8593; Resolves First</Badge>
              </div>
            )}
            {stack.length > 1 && isLast && overflow === 0 && (
              <div className="absolute -bottom-2 -right-2 z-10" style={{ marginBottom: "-8px" }}>
                <Badge color="#6b7280">&#8595; Resolves Last</Badge>
              </div>
            )}
          </div>
        </motion.div>
      ))}
      {overflow > 0 && (
        <div className="mt-2 px-3 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-[11px] text-mtg-text-dim text-center">
          +{overflow} more items below (scroll to resolve)
        </div>
      )}
    </div>
  );
}

// ─── Resolution Modal with Confirm Step ──────────────────────────────────────

interface ResolutionStep {
  item: EngineStackItem;
  logEntries: LogEntry[];
  status: "resolved" | "fizzled";
  phase?: "cast_announcement" | "trigger_announcement" | "resolution";
  causedByName?: string;
}

function ResolutionModal({ steps, onClose, gs }: { steps: ResolutionStep[]; onClose: () => void; gs: GameState }) {
  const [phase, setPhase] = useState<"confirm" | "resolving">("confirm");
  const [cur, setCur] = useState(0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (auto && phase === "resolving" && cur < steps.length - 1) { const t = setTimeout(() => setCur(p => p + 1), 2200); return () => clearTimeout(t); }
    if (auto && cur >= steps.length - 1) setAuto(false);
  }, [auto, cur, steps.length, phase]);

  const resolutionSteps = steps.filter(s => (s.phase ?? "resolution") === "resolution");
  const step = phase === "resolving" ? steps[cur] : null;

  function stepMeta(s: ResolutionStep) {
    if (s.phase === "cast_announcement" && s.item.isStormCopy) return { badgeColor: "#8b5cf6", badgeLabel: `Storm Copy ${s.item.stormCopyIndex}`, borderClass: "border-purple-500", header: "Storm Copy" };
    if (s.phase === "cast_announcement") return { badgeColor: "#3b82f6", badgeLabel: "Cast", borderClass: "border-blue-500", header: "Spell Cast" };
    if (s.phase === "trigger_announcement" && s.item.name.startsWith("Storm —")) return { badgeColor: "#8b5cf6", badgeLabel: "Storm", borderClass: "border-purple-500", header: "Storm Trigger Fires" };
    if (s.phase === "trigger_announcement") return { badgeColor: "#f59e0b", badgeLabel: "Triggered", borderClass: "border-amber-500", header: "Trigger Fires" };
    if (s.item.isStormCopy) return { badgeColor: "#8b5cf6", badgeLabel: s.status === "fizzled" ? "Fizzled" : `Copy ${s.item.stormCopyIndex}`, borderClass: s.status === "fizzled" ? "border-red-500 opacity-60" : "border-purple-500", header: "Storm Copy Resolves" };
    return { badgeColor: s.status === "fizzled" ? "#dc2626" : "#22c55e", badgeLabel: s.status === "fizzled" ? "Fizzled" : "Resolved", borderClass: s.status === "fizzled" ? "border-red-500 opacity-60" : "border-green-500", header: "Resolves" };
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }} className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-mtg-bg border border-mtg-border rounded-2xl shadow-2xl">
        {phase === "confirm" && (
          <>
            <div className="px-4 py-3 border-b border-mtg-border">
              <div className="text-sm font-display font-bold text-mtg-gold">Stack to Resolve ({resolutionSteps.length} item{resolutionSteps.length !== 1 && "s"})</div>
              <div className="text-xs text-mtg-text-muted mt-0.5">Resolves top to bottom (Last In, First Out)</div>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {resolutionSteps.map((s, i) => (
                <div key={s.item.id + i} className="flex items-center gap-3">
                  <div className="text-xs text-mtg-text-muted font-bold w-5 text-right flex-shrink-0">{i + 1}</div>
                  <img src={s.item.imageUri || CARD_BACK} alt={s.item.name} width={48} height={67} className="rounded border border-mtg-border flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-display font-bold text-mtg-text">{s.item.name}</div>
                    <div className="text-xs text-mtg-text-dim">
                      {pLabel(gs, s.item.controller)}
                      {s.item.type === "triggered_ability" && " \u00B7 Trigger"}
                      {s.item.type === "activated_ability" && " \u00B7 Ability"}
                      {s.item.targets.length > 0 && ` \u2192 ${s.item.targets.map(t => t.name).join(", ")}`}
                    </div>
                    {s.item.effect && <div className="text-[11px] text-mtg-text-muted mt-0.5 line-clamp-2">{s.item.effect}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-mtg-border">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => setPhase("resolving")}>{"\u25B6"} Confirm &amp; Resolve</Button>
            </div>
          </>
        )}
        {phase === "resolving" && step && (() => {
          const meta = stepMeta(step);
          return (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-mtg-border">
                <div className="text-sm font-display font-bold text-mtg-gold">{meta.header}</div>
                <div className="flex items-center gap-2"><span className="text-xs text-mtg-text-muted">{cur + 1}/{steps.length}</span><button onClick={onClose} className="text-mtg-text-muted hover:text-mtg-text text-lg">&times;</button></div>
              </div>
              <div className="flex flex-col items-center py-6 px-4 min-h-[240px]">
                <AnimatePresence mode="popLayout">
                  <motion.div key={step.item.id + cur} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 120 }} transition={{ duration: 0.15 }} className="relative">
                    <img src={step.item.imageUri || CARD_BACK} alt={step.item.name} width={160} height={223} className={cn("rounded-xl shadow-2xl border-2", meta.borderClass)} />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge color={meta.badgeColor}>{meta.badgeLabel}</Badge>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="px-4 pb-3">
                <div className="text-base font-display font-bold text-mtg-text mb-1">{step.item.name}</div>
                <div className="text-sm text-mtg-text-dim mb-2">
                  {pLabel(gs, step.item.controller)}
                  {step.item.targets.length > 0 && ` → ${step.item.targets.map(t => t.name).join(", ")}`}
                </div>
                {step.phase === "cast_announcement" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-display" style={{ color: "#3b82f6" }}>
                      <span>{LOG_ICONS["cast_spell"]}</span>
                      <span>{pLabel(gs, step.item.controller)} casts {step.item.name}{step.item.xValue !== undefined ? ` (X = ${step.item.xValue})` : ""}</span>
                    </div>
                    {step.item.effect && <div className="text-xs text-mtg-text-dim leading-relaxed line-clamp-4">{step.item.effect}</div>}
                  </div>
                )}
                {step.phase === "trigger_announcement" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-display" style={{ color: "#f59e0b" }}>
                      <span>{LOG_ICONS["trigger"]}</span>
                      <span>{step.item.triggerSource ?? step.item.name} triggers</span>
                    </div>
                    {step.causedByName && (
                      <div className="text-xs text-mtg-text-muted">Caused by: casting <span className="font-semibold text-mtg-text">{step.causedByName}</span></div>
                    )}
                    {step.item.effect && <div className="text-xs text-mtg-text-dim leading-relaxed line-clamp-3">Effect: {step.item.effect}</div>}
                  </div>
                )}
                {(step.phase === "resolution" || !step.phase) && (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {step.logEntries.filter(e => e.type !== "priority_pass" && e.type !== "priority_receive").map((e, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {LOG_ICONS[e.type] && <span className="text-sm flex-shrink-0">{LOG_ICONS[e.type]}</span>}
                        <div>
                          <div className="text-sm font-display" style={{ color: LOG_COLORS[e.type] || "#8a8894" }}>{e.text}</div>
                          {e.detail && <div className="text-xs text-mtg-text-dim mt-0.5 whitespace-pre-wrap">{e.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-1 py-2 flex-wrap px-2">
                {steps.map((s, i) => {
                  const dotColor = i === cur ? "bg-mtg-gold scale-125" : i < cur ? "bg-green-500" : s.phase === "cast_announcement" ? "bg-blue-500/40" : s.phase === "trigger_announcement" ? "bg-amber-500/40" : "bg-mtg-border";
                  return <div key={i} className={cn("w-2 h-2 rounded-full transition-all flex-shrink-0", dotColor)} />;
                })}
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <Button variant="secondary" size="sm" onClick={() => setCur(p => Math.max(0, p - 1))} disabled={cur === 0}>&larr;</Button>
                <Button className="flex-1" size="sm" onClick={() => { if (cur >= steps.length - 1) onClose(); else setCur(p => p + 1); }}>{cur >= steps.length - 1 ? "Done" : "Next →"}</Button>
                <Button variant="ghost" size="sm" onClick={() => setAuto(!auto)}>{auto ? "Pause" : "Auto"}</Button>
              </div>
            </>
          );
        })()}
      </motion.div>
    </motion.div>
  );
}

// ─── Card Preview with Ban Check ─────────────────────────────────────────────

function CardPreview({ card, targetReq, format }: { card: ScryfallCard; targetReq: ReturnType<typeof detectTargetRequirement>; format?: string }) {
  const legality = format && card.legalities ? (card.legalities as Record<string, string>)[format] : null;
  const isBanned = legality === "banned";
  const isRestricted = legality === "restricted";
  const isNotLegal = legality === "not_legal";

  return (
    <div className={cn("flex gap-2.5 p-2 bg-mtg-surface rounded-lg border", isBanned ? "border-red-500/60" : "border-mtg-border")}>
      {card.image_uris?.small && <img src={card.image_uris.small} alt={card.name} className="w-16 rounded flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-display font-bold text-mtg-text">{card.name}</div>
        <div className="text-[10px] text-mtg-text-muted">{card.type_line}</div>
        {card.power && <div className="text-[10px] text-mtg-text-dim">{card.power}/{card.toughness}</div>}
        {isBanned && <div className="mt-1 px-2 py-1 bg-red-500/15 border border-red-500/30 rounded text-xs text-red-400 font-bold">{"\u26D4"} BANNED in {format}</div>}
        {isRestricted && <div className="mt-1 px-2 py-1 bg-amber-500/15 border border-amber-500/30 rounded text-xs text-amber-400 font-bold">{"\u26A0"} RESTRICTED in {format}</div>}
        {isNotLegal && !isBanned && <div className="mt-1 text-[10px] text-gray-400">Not legal in {format}</div>}
        {targetReq && <div className="mt-1 text-[10px] text-red-400 font-bold">{"\u{1F3AF}"} {targetReq.description}</div>}
        {!targetReq && !isBanned && card.oracle_text && <div className="text-[10px] text-mtg-text-dim mt-1 line-clamp-2">{card.oracle_text}</div>}
      </div>
    </div>
  );
}

// ─── Add Permanent Form (for board setup) ────────────────────────────────────

function AddPermanentForm({ gs, onAdd }: { gs: GameState; onAdd: (perm: Omit<Permanent, "id">) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [controller, setController] = useState<PlayerId>("player_a");
  const { query, setQuery, suggestions } = useCardAutocomplete();
  const { card, loading: cardLoading, fetchCard, clearCard } = useCardFetch();
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!showForm) return <button onClick={() => setShowForm(true)} className="w-full py-2.5 text-sm text-mtg-text-dim hover:text-mtg-gold border border-dashed border-mtg-border rounded-lg transition-colors font-display">+ Add Permanent Already in Play (Board Setup)</button>;

  return (
    <Card className="!p-3">
      <SectionLabel>Add permanent already in play (not being cast)</SectionLabel>
      <div className="space-y-2">
        <div className="relative">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); clearCard(); }} onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} placeholder="Search card name..." className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-body outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted" />
          {cardLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-mtg-text-muted animate-pulse">Fetching...</div>}
          <AnimatePresence>{showSuggestions && suggestions.length > 0 && !card && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto">
              {suggestions.slice(0, 8).map((n) => <button key={n} onClick={() => { setQuery(n); setShowSuggestions(false); fetchCard(n); }} className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0">{n}</button>)}
            </motion.div>
          )}</AnimatePresence>
        </div>
        {card && <CardPreview card={card} targetReq={null} format={gs.format} />}
        <select value={controller} onChange={(e) => setController(e.target.value as PlayerId)} className="w-full px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm outline-none">
          {gs.playerOrder.map((pid) => <option key={pid} value={pid}>{gs.players[pid]!.label}</option>)}
        </select>
        <div className="flex gap-2">
          <Button onClick={() => { if (!card) return; onAdd(cardToPermanent(card, controller)); setQuery(""); clearCard(); setShowForm(false); }} className="flex-1" size="sm" disabled={!card}>{card ? `Add ${card.name}` : "Select a card"}</Button>
          <Button variant="ghost" onClick={() => { setShowForm(false); clearCard(); setQuery(""); }} size="sm">Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Cast Spell / Activate Ability Form ──────────────────────────────────────

function AddSpellOrAbilityForm({ gs, onCast }: { gs: GameState; onCast: (item: Omit<EngineStackItem, "id" | "timestamp">) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"spell" | "ability">("spell");
  const [controller, setController] = useState<PlayerId>(gs.playerOrder[0]);
  const [target, setTarget] = useState("");
  const [targetError, setTargetError] = useState("");
  const [selectedAbility, setSelectedAbility] = useState<ActivatedAbilityInfo | null>(null);
  const [xValue, setXValue] = useState<number>(1);
  // Storm state
  const [stormStep, setStormStep] = useState(false);
  const [priorStormCount, setPriorStormCount] = useState(0);
  const [pendingStormItem, setPendingStormItem] = useState<Omit<EngineStackItem, "id" | "timestamp"> | null>(null);

  const { query, setQuery, suggestions } = useCardAutocomplete();
  const { card, loading: cardLoading, fetchCard, clearCard } = useCardFetch();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const targetReq = mode === "spell" && card ? detectTargetRequirement(card) : null;
  const abilities = mode === "ability" && card ? parseActivatedAbilities(card) : [];

  // Detect whether selected spell/ability has an X cost
  const spellHasX = mode === "spell" && card
    ? (card.mana_cost || "").toUpperCase().includes("{X}") || /\{x\}/i.test(card.oracle_text || "")
    : false;
  const abilityHasX = mode === "ability" && selectedAbility
    ? selectedAbility.cost.toUpperCase().includes("{X}")
    : false;
  const showXInput = spellHasX || abilityHasX;

  // Detect storm
  const spellHasStorm = mode === "spell" && card
    ? card.keywords.some((k) => k.toLowerCase() === "storm") || /(?:^|\n)storm(?:\n|$)/i.test(card.oracle_text || "")
    : false;

  // Current spells on the stack (auto-counted for storm)
  const stackSpellCount = gs.stack.filter((s) => s.type === "spell").length;
  const totalStormCount = stackSpellCount + priorStormCount;

  useEffect(() => {
    if (mode === "ability" && abilities.length === 1 && !selectedAbility) setSelectedAbility(abilities[0]);
  }, [abilities.length, mode, selectedAbility]);

  const resetForm = () => {
    setShowForm(false); clearCard(); setQuery(""); setTargetError("");
    setSelectedAbility(null); setTarget(""); setXValue(1);
    setStormStep(false); setPriorStormCount(0); setPendingStormItem(null);
  };

  const handleCast = () => {
    if (mode === "spell") {
      if (!card) return;
      if (targetReq?.required && !target.trim()) { setTargetError(`Required: ${targetReq.description}`); return; }
      const targets = target.trim() ? [{ type: "permanent" as const, id: generateId(), name: target.trim(), isLegal: true }] : [];
      const item = cardToStackItem(card, controller, targets, showXInput ? xValue : undefined);
      if (spellHasStorm) {
        setPendingStormItem(item);
        setPriorStormCount(0);
        setStormStep(true);
        return;
      }
      onCast(item);
    } else {
      if (!card || !selectedAbility) return;
      if (selectedAbility.requiresTarget && !target.trim()) { setTargetError(`Required: ${selectedAbility.targetDescription || "a target"}`); return; }
      const targets = target.trim() ? [{ type: "permanent" as const, id: generateId(), name: target.trim(), isLegal: true }] : [];
      onCast(abilityToStackItem(card, selectedAbility, controller, targets, showXInput ? xValue : undefined));
    }
    resetForm();
  };

  const handleStormConfirm = () => {
    if (!pendingStormItem) return;
    onCast({ ...pendingStormItem, priorStormCount });
    setStormStep(false);
    setPendingStormItem(null);
    resetForm();
  };

  if (!showForm) return <Button onClick={() => setShowForm(true)} className="w-full" disabled={gs.priority.splitSecondActive}>{gs.priority.splitSecondActive ? "Split second \u2014 cannot respond" : "+ Add Spell or Ability to Stack"}</Button>;

  return (
    <Card className="!p-3">
      <div className="flex gap-1 mb-2.5">
        {(["spell", "ability"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); clearCard(); setQuery(""); setTargetError(""); setSelectedAbility(null); }}
            className={cn("flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-all", mode === m ? "bg-mtg-gold text-mtg-bg" : "text-mtg-text-dim hover:text-mtg-text")}>
            {m === "spell" ? "Cast Spell" : "Activated Ability"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <div className="relative">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); clearCard(); setTargetError(""); setSelectedAbility(null); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} placeholder={mode === "spell" ? "Search card name..." : "Search permanent with ability..."}
            className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-body outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted" />
          {cardLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-mtg-text-muted animate-pulse">Fetching...</div>}
          <AnimatePresence>{showSuggestions && suggestions.length > 0 && !card && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto">
              {suggestions.slice(0, 8).map((n) => <button key={n} onClick={() => { setQuery(n); setShowSuggestions(false); setTarget(""); setTargetError(""); setSelectedAbility(null); fetchCard(n); }} className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0">{n}</button>)}
            </motion.div>
          )}</AnimatePresence>
        </div>
        {card && <CardPreview card={card} targetReq={mode === "spell" ? targetReq : null} format={gs.format} />}
        {mode === "ability" && card && abilities.length > 1 && !selectedAbility && (
          <div className="space-y-1.5">
            <div className="text-xs font-display font-bold text-mtg-gold">Which ability?</div>
            {abilities.map((a, i) => (
              <button key={i} onClick={() => setSelectedAbility(a)} className="w-full text-left">
                <Card className="!p-2.5 hover:!border-mtg-gold/50 transition-all">
                  <div className="text-[11px] text-mtg-text"><span className="font-bold text-mtg-gold">{a.cost}</span>: {a.effect}</div>
                  {a.requiresTarget && <div className="text-[10px] text-red-400 mt-0.5">{"\u{1F3AF}"} {a.targetDescription}</div>}
                </Card>
              </button>
            ))}
          </div>
        )}
        {mode === "ability" && card && abilities.length === 0 && <div className="text-[11px] text-red-400 p-2 bg-red-500/10 rounded-lg">No activated abilities found on {card.name}.</div>}
        {mode === "ability" && selectedAbility && (
          <div className="p-2 bg-mtg-gold/10 border border-mtg-gold/30 rounded-lg">
            <div className="text-[11px] text-mtg-text"><span className="font-bold text-mtg-gold">{selectedAbility.cost}</span>: {selectedAbility.effect}</div>
            {abilities.length > 1 && <button onClick={() => setSelectedAbility(null)} className="text-[10px] text-mtg-text-muted hover:text-mtg-gold mt-1">Change ability</button>}
          </div>
        )}
        <select value={controller} onChange={(e) => setController(e.target.value as PlayerId)} className="w-full px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm outline-none">
          {gs.playerOrder.map((pid) => <option key={pid} value={pid}>{gs.players[pid]!.label}</option>)}
        </select>
        {/* X cost input \u2014 shown when the spell/ability has {X} in its cost */}
        {showXInput && (
          <div className="flex items-center gap-2 px-2.5 py-2 bg-purple-900/20 border border-purple-500/40 rounded-lg">
            <span className="text-xs font-display font-bold text-purple-300 flex-shrink-0">Choose X</span>
            <input
              type="number"
              min={0}
              max={99}
              value={xValue}
              onChange={(e) => setXValue(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 px-2 py-1 bg-mtg-surface border border-purple-500/50 rounded text-mtg-text text-sm font-bold text-center outline-none focus:border-purple-400"
            />
            <span className="text-[10px] text-purple-300/70">X = {xValue}</span>
          </div>
        )}
        {card && (mode === "spell" || selectedAbility) && (
          <div>
            <input value={target} onChange={(e) => { setTarget(e.target.value); setTargetError(""); }}
              placeholder={targetReq?.required ? `\u{1F3AF} ${targetReq.description} (required)` : selectedAbility?.requiresTarget ? `\u{1F3AF} ${selectedAbility.targetDescription} (required)` : "Target (optional)"}
              className={cn("w-full px-3 py-1.5 bg-mtg-surface border rounded-lg text-mtg-text text-sm font-body outline-none placeholder:text-mtg-text-muted", targetError ? "border-red-500" : (targetReq?.required || selectedAbility?.requiresTarget) ? "border-amber-600/50" : "border-mtg-border")} />
            {targetError && <div className="text-[10px] text-red-400 mt-1">{targetError}</div>}
          </div>
        )}
        {/* Storm count dialog — shown inline when a storm spell is ready to cast */}
        {stormStep && pendingStormItem ? (
          <div className="space-y-2 p-3 bg-purple-900/20 border border-purple-500/40 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-purple-300 text-sm">&#9889;</span>
              <span className="text-sm font-display font-bold text-purple-200">Storm — Set Storm Count</span>
            </div>
            <div className="text-[11px] text-purple-300/80 leading-relaxed">
              Storm copies the spell for each spell cast before it this turn.
            </div>
            <div className="flex items-center justify-between text-xs text-mtg-text-dim">
              <span>Spells currently on the stack:</span>
              <span className="font-bold text-mtg-text">{stackSpellCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-mtg-text-dim flex-1">Spells cast earlier this turn (not on stack):</label>
              <input
                type="number"
                min={0}
                max={99}
                value={priorStormCount}
                onChange={(e) => setPriorStormCount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-14 px-2 py-1 bg-mtg-surface border border-purple-500/50 rounded text-mtg-text text-sm font-bold text-center outline-none focus:border-purple-400"
              />
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 bg-purple-900/30 rounded text-xs">
              <span className="text-purple-200 font-display font-semibold">Total storm count:</span>
              <span className="text-purple-100 font-display font-bold text-sm">{totalStormCount}</span>
            </div>
            <div className="text-[11px] text-purple-300/70">
              {totalStormCount > 0
                ? `Storm will create ${totalStormCount} cop${totalStormCount !== 1 ? "ies" : "y"} of ${pendingStormItem.name}.`
                : "Storm count is 0 — no copies will be created."}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleStormConfirm} className="flex-1" size="sm">
                Cast with Storm ({totalStormCount} cop{totalStormCount !== 1 ? "ies" : "y"})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStormStep(false); setPendingStormItem(null); }}>Back</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleCast} className="flex-1" size="sm" disabled={mode === "spell" ? !card : (!card || !selectedAbility)}>
              {mode === "spell"
                ? (card ? `Cast ${card.name}${showXInput ? ` (X=${xValue})` : ""}${spellHasStorm ? " ⚡" : ""}` : "Select a card")
                : (selectedAbility ? `Activate${showXInput ? ` (X=${xValue})` : ""}` : "Select an ability")}
            </Button>
            <Button variant="ghost" onClick={resetForm} size="sm">Cancel</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Action Log ──────────────────────────────────────────────────────────────

function ActionLog({ log, logEndRef }: { log: LogEntry[]; logEndRef: React.RefObject<HTMLDivElement | null> }) {
  if (log.length === 0) return null;
  const filtered = log.filter(e => e.type !== "priority_receive");
  return (
    <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
      {filtered.map((e) => (
        <div key={e.id} className={cn("px-3 py-2 rounded-lg", e.highlight ? "bg-mtg-surface border border-mtg-border/50" : "", e.type === "priority_pass" ? "opacity-40" : "")}>
          <div className="flex items-start gap-2">
            {LOG_ICONS[e.type] && <span className="text-sm flex-shrink-0 mt-0.5">{LOG_ICONS[e.type]}</span>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-display font-semibold" style={{ color: LOG_COLORS[e.type] || "#8a8894" }}>{e.text}</div>
              {e.detail && <div className="text-xs text-mtg-text-dim mt-1 leading-relaxed whitespace-pre-wrap">{e.detail}</div>}
            </div>
          </div>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

// ─── Lesson Banner ───────────────────────────────────────────────────────────

function LessonBanner({ preset }: { preset: ScenarioPreset }) {
  const [exp, setExp] = useState(false);
  return (
    <button onClick={() => setExp(!exp)} className="w-full text-left">
      <Card className="!p-3 !border-mtg-gold/30 bg-mtg-gold/5">
        <div className="flex items-start gap-2">
          <span className="text-sm mt-0.5">{"\u{1F4CB}"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-display font-bold text-mtg-gold">{preset.name}<span className="text-mtg-text-muted font-normal ml-2">{exp ? "\u25BE" : "\u25B8"} Key lesson</span></div>
            {exp && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="text-xs text-mtg-text leading-relaxed mt-1.5">{preset.lesson}</motion.p>}
          </div>
        </div>
      </Card>
    </button>
  );
}

// ─── Resolution Logic ────────────────────────────────────────────────────────

function buildResolutionSteps(beforeState: GameState): { steps: ResolutionStep[]; finalState: GameState } {
  // Build cast/trigger announcement steps from the pre-resolution stack state (bottom to top = cast order)
  const announcementSteps: ResolutionStep[] = [];
  const assignedTriggerIds = new Set<string>();
  for (let i = 0; i < beforeState.stack.length; i++) {
    const item = beforeState.stack[i];
    if (item.type !== "triggered_ability" && !item.isStormCopy) {
      announcementSteps.push({ phase: "cast_announcement", item, logEntries: [], status: "resolved" });
      // Any triggered_ability items immediately above this spell (before the next non-trigger) are its cast triggers
      for (let j = i + 1; j < beforeState.stack.length; j++) {
        const above = beforeState.stack[j];
        if (above.type !== "triggered_ability") break;
        if (!assignedTriggerIds.has(above.id)) {
          assignedTriggerIds.add(above.id);
          announcementSteps.push({ phase: "trigger_announcement", item: above, logEntries: [], status: "resolved", causedByName: item.name });
        }
      }
    }
  }

  const resolutionSteps: ResolutionStep[] = [];
  let state = JSON.parse(JSON.stringify(beforeState)) as GameState;
  const logsAtStart = state.actionLog.length;
  let safety = 0;
  while (state.stack.length > 0 && safety < 100) {
    safety++;
    const topItem = { ...state.stack[state.stack.length - 1] };
    const topId = topItem.id;
    const logBefore = state.actionLog.length;
    let inner = 0;
    // Pass priority until the specific top item leaves the stack (resolved, countered, or fizzled)
    while (state.stack.some((s) => s.id === topId) && inner < 50) {
      inner++;
      state = processAction(state, { type: "pass_priority" });
    }
    const logSlice = state.actionLog.slice(logBefore);
    const didFizzle = logSlice.some((e) => e.type === "fizzle");
    const wasCountered = logSlice.some((e) => e.type === "counter" && e.text.includes(topItem.name));
    resolutionSteps.push({
      phase: "resolution",
      item: topItem,
      logEntries: logSlice,
      status: didFizzle || wasCountered ? "fizzled" : "resolved",
    });
  }
  const steps = [...announcementSteps, ...resolutionSteps];

  // ─── Post-resolution summary ────────────────────────────────────────────────
  // After everything resolves, scan battlefield triggers against events that fired.
  // This catches cases where triggers should have fired and shows what happened.
  const newLogs = state.actionLog.slice(logsAtStart);
  const resolvedEntries = newLogs.filter(e => e.type === "resolve");

  // Collect ALL trigger log entries for this session:
  // - During-resolution triggers (fired by ETB, damage, etc.) come from newLogs.
  // - Pre-resolution cast triggers fired when spells were added to the stack (before
  //   resolution started). Their triggered-ability items ARE in `steps`, but the "trigger"
  //   log entries live before logsAtStart. Build synthetic entries from the step items
  //   so the summary correctly shows "Rhystic Study triggered because X was cast."
  const duringResolutionTriggers = newLogs.filter(e => e.type === "trigger");
  const duringSourceNames = new Set(
    duringResolutionTriggers.map(e => e.text.replace("'s ability triggers", "").trim())
  );

  // For each triggered ability that was on the stack pre-resolution, find its most recent
  // matching trigger log entry (closest to logsAtStart) for the cause/effect detail.
  // Use the step count per source to correctly represent multiple triggers.
  const preResStepsBySource = new Map<string, ResolutionStep[]>();
  for (const s of steps.filter(s => s.item.type === "triggered_ability")) {
    const src = s.item.triggerSource || s.item.name.replace(" trigger", "");
    if (duringSourceNames.has(src)) continue; // already covered by during-resolution entries
    if (!preResStepsBySource.has(src)) preResStepsBySource.set(src, []);
    preResStepsBySource.get(src)!.push(s);
  }
  const preResolutionTriggers: typeof duringResolutionTriggers = [];
  for (const [src, srcSteps] of Array.from(preResStepsBySource.entries())) {
    // Find the most recent trigger log entry for this source before resolution started
    const logEntries = state.actionLog.slice(0, logsAtStart).filter(
      e => e.type === "trigger" && e.text.replace("'s ability triggers", "").trim() === src
    );
    const logEntry = logEntries.length > 0 ? logEntries[logEntries.length - 1] : null;
    for (const s of srcSteps) {
      preResolutionTriggers.push(logEntry ?? {
        id: s.item.id,
        timestamp: 0,
        type: "trigger" as const,
        text: `${src}'s ability triggers`,
        detail: `Condition: ${s.item.triggerEvent ?? "cast"}\nEffect: ${s.item.effect ?? ""}`,
      });
    }
  }
  const triggerEntries = [...preResolutionTriggers, ...duringResolutionTriggers];

  const summaryLines: string[] = [];

  const resolvedNames = resolvedEntries
    .map(e => e.text.replace(" resolves", "").trim())
    .filter(Boolean);
  if (resolvedNames.length) {
    summaryLines.push(`Resolution order (LIFO — last added resolves first):\n${resolvedNames.join(" → ")}`);
  }

  if (triggerEntries.length > 0) {
    // Group triggers by source permanent
    const bySource = new Map<string, typeof triggerEntries>();
    for (const t of triggerEntries) {
      const src = t.text.replace("'s ability triggers", "").trim();
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(t);
    }
    summaryLines.push(`\nTriggers fired (${triggerEntries.length} total):`);
    Array.from(bySource.entries()).forEach(([src, ts]) => {
      const count = ts.length;
      const lines = ts[0].detail?.split("\n") ?? [];
      const causeLine = lines.find((l: string) => l.startsWith("Cause:")) ?? "";
      const effectLine = lines.find((l: string) => l.startsWith("Effect:")) ?? "";
      summaryLines.push(`⚡ ${src}${count > 1 ? ` ×${count}` : ""}`);
      if (causeLine) summaryLines.push(`   ${causeLine}`);
      if (effectLine) summaryLines.push(`   ${effectLine}`);
    });
  } else {
    // No triggers fired — check if any battlefield permanents have landfall or ETB triggers
    // that match lands entering the battlefield (from the resolved spells).
    const landEnterCount = newLogs.filter(e =>
      e.type === "game_event" &&
      (e.text.toLowerCase().includes("land") || e.text.toLowerCase().includes("forest")) &&
      (e.text.toLowerCase().includes("enter") || e.text.toLowerCase().includes("creat"))
    ).length;

    if (landEnterCount > 0) {
      const landfallPerms = state.battlefield.filter(p =>
        p.triggers.some(t =>
          t.event === "enters_battlefield" &&
          (t.condition ?? "").toLowerCase().includes("land")
        )
      );
      if (landfallPerms.length > 0) {
        summaryLines.push(`\n⚠️ Landfall check — ${landEnterCount} land event(s) detected:`);
        for (const p of landfallPerms) {
          const t = p.triggers.find(tr =>
            tr.event === "enters_battlefield" &&
            (tr.condition ?? "").toLowerCase().includes("land")
          )!;
          summaryLines.push(`• ${p.name} (landfall) — should have triggered`);
          summaryLines.push(`  Condition: ${t.condition}`);
          summaryLines.push(`  Effect: ${t.effect}`);
        }
      }
    }
  }

  if (summaryLines.length > 1) {
    state.actionLog.push({
      id: generateId(),
      timestamp: state.stepCount,
      type: "explanation",
      text: "Resolution Summary",
      detail: summaryLines.join("\n"),
      highlight: true,
    });
  }

  return { steps, finalState: state };
}

// ─── Main Simulator ──────────────────────────────────────────────────────────

export function StackSimulator({ format = "modern" }: { format?: string }) {
  const [gs, setGs] = useState<GameState>(() => {
    const c = format === "commander";
    return createInitialState({ format, playerCount: c ? 4 : 2, startingLife: c ? 40 : 20 });
  });
  const [preset, setPreset] = useState<ScenarioPreset | null>(null);
  const [resSteps, setResSteps] = useState<ResolutionStep[] | null>(null);
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  // Reset on format change
  useEffect(() => {
    const c = format === "commander";
    setGs(createInitialState({ format, playerCount: c ? 4 : 2, startingLife: c ? 40 : 20 }));
    setPreset(null);
  }, [format]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [gs.actionLog.length]);

  // Fetch Scryfall artwork for tokens that don't yet have an image
  useEffect(() => {
    const tokens = gs.battlefield.filter(p => p.isToken && !p.imageUri);
    const seen = new Set<string>();
    const missingNames: string[] = [];
    for (const t of tokens) {
      if (!seen.has(t.name) && !tokenImageCache.has(t.name)) { seen.add(t.name); missingNames.push(t.name); }
    }
    if (missingNames.length === 0) return;
    for (const name of missingNames) {
      tokenImageCache.set(name, null); // Reserve the slot to avoid duplicate fetches
      fetchTokenImage(name).then(url => {
        tokenImageCache.set(name, url);
        if (url) setTokenImages(prev => ({ ...prev, [name]: url }));
      });
    }
  }, [gs.battlefield]);

  const dispatch = useCallback((a: Parameters<typeof processAction>[1]) => { setGs(p => processAction(p, a)); }, []);

  const handleReset = () => {
    if (preset) { setGs(loadPreset(preset, format)); }
    else { const c = format === "commander"; setGs(createInitialState({ format, playerCount: c ? 4 : 2, startingLife: c ? 40 : 20 })); }
  };

  const handlePhaseChange = (step: TurnStep) => {
    setGs(prev => {
      const next = { ...JSON.parse(JSON.stringify(prev)) as GameState };
      next.currentStep = step;
      next.actionLog.push({ id: generateId(), timestamp: next.stepCount++, type: "phase_change", text: `Phase set to: ${STEP_LABELS[step]}`, highlight: true });
      return next;
    });
  };

  const handleTurnChange = (pid: PlayerId) => {
    setGs(prev => {
      const next = { ...JSON.parse(JSON.stringify(prev)) as GameState };
      next.activePlayer = pid;
      next.priority.priorityHolder = pid;
      next.actionLog.push({ id: generateId(), timestamp: next.stepCount++, type: "phase_change", text: `Active player set to: ${pLabel(next, pid)}`, highlight: true });
      return next;
    });
  };

  const handleResolve = () => {
    if (gs.stack.length === 0) return;
    const { steps, finalState } = buildResolutionSteps(gs);
    setResSteps(steps);
    setGs(finalState);
  };

  const handleCast = (item: Omit<EngineStackItem, "id" | "timestamp">) => {
    // Route activated abilities correctly
    if (item.type === "activated_ability") {
      dispatch({ type: "activate_ability", ability: item });
    } else {
      dispatch({ type: "cast_spell", spell: item });
    }
  };

  return (
    <div className="space-y-3">
      <style>{`.animate-pulse-subtle { animation: ps 2s ease-in-out infinite; } @keyframes ps { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.15); } }`}</style>

      {/* Top toolbar — scenario picker + undo/reset */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-mtg-text-muted font-bold uppercase tracking-wider">
          Turn {gs.turnNumber} &middot; {pLabel(gs, gs.activePlayer)}&apos;s Turn
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "undo" })} disabled={!canUndo()}>Undo</Button>
          <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </div>

      {/* Scenario picker */}
      <ScenarioDropdown onSelect={(p) => { setPreset(p); setGs(loadPreset(p, format)); }} />
      {preset && <LessonBanner preset={preset} />}

      {/* ── Step 1: Turn & Phase ─────────────────────────────────── */}
      <Card className="!p-3">
        <SectionLabel className="!mb-2">① Select Turn &amp; Phase</SectionLabel>
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-[10px] text-mtg-text-muted mb-1 font-semibold uppercase tracking-wider">Active Player</div>
            <select
              value={gs.activePlayer}
              onChange={(e) => handleTurnChange(e.target.value as PlayerId)}
              className="w-full px-3 py-2 bg-mtg-surface border border-mtg-gold/50 rounded-lg text-sm font-display font-bold text-mtg-gold outline-none cursor-pointer"
            >
              {gs.playerOrder.map((pid) => (
                <option key={pid} value={pid}>{pLabel(gs, pid)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-mtg-text-muted mb-1 font-semibold uppercase tracking-wider">Game Phase</div>
            <select
              value={gs.currentStep}
              onChange={(e) => handlePhaseChange(e.target.value as TurnStep)}
              className="w-full px-3 py-2 bg-mtg-surface border border-mtg-gold/50 rounded-lg text-sm font-display font-bold text-mtg-gold outline-none cursor-pointer"
            >
              {PHASE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[10px] text-mtg-text-muted mt-1.5">
          Select turn and phase <span className="text-mtg-text-dim font-semibold">before</span> setting up the board or building the stack
        </div>
      </Card>

      {/* Players */}
      <PlayerGrid gs={gs} />

      {/* ── Step 2: Board State ───────────────────────────────────── */}
      <div>
        <SectionLabel>② Board State — Before Any Spell Is Cast</SectionLabel>
        <p className="text-[11px] text-mtg-text-muted -mt-1.5 mb-2 leading-relaxed">
          Add permanents that are already on the battlefield. These are <span className="text-mtg-text font-semibold">not being cast</span> — they are already in play when the scenario begins.
        </p>
        {gs.playerOrder.map((pid) => (
          <BattlefieldDisplay key={pid} permanents={gs.battlefield} playerId={pid} playerLabel={pLabel(gs, pid)} tokenImages={tokenImages} onTransform={(id) => dispatch({ type: "transform_permanent", permanentId: id })} />
        ))}
        <AddPermanentForm gs={gs} onAdd={(perm) => dispatch({ type: "add_permanent", permanent: perm })} />
      </div>

      {/* ── Day/Night Panel (shown when relevant) ──────────────────── */}
      {(gs.dayNight !== null || gs.battlefield.some((p) => p.hasDayNightMechanic)) && (
        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-xs font-display font-bold text-mtg-text">
                Day/Night: {gs.dayNight === "day" ? "☀️ Day" : gs.dayNight === "night" ? "🌙 Night" : "Not Active"}
              </div>
              {gs.dayNight !== null && (
                <div className="text-[10px] text-mtg-text-muted mt-0.5">
                  Spells cast last turn: {gs.spellsCastLastTurn} &middot; This turn: {gs.spellsCastThisTurn}
                </div>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => dispatch({ type: "set_day_night", state: "day" })}
                className={cn("px-2.5 py-1 rounded-lg text-xs font-display font-bold border transition-all", gs.dayNight === "day" ? "bg-amber-400/20 border-amber-400 text-amber-300" : "border-mtg-border text-mtg-text-dim hover:border-amber-400/50 hover:text-amber-300")}
              >
                ☀️ Day
              </button>
              <button
                onClick={() => dispatch({ type: "set_day_night", state: "night" })}
                className={cn("px-2.5 py-1 rounded-lg text-xs font-display font-bold border transition-all", gs.dayNight === "night" ? "bg-indigo-400/20 border-indigo-400 text-indigo-300" : "border-mtg-border text-mtg-text-dim hover:border-indigo-400/50 hover:text-indigo-300")}
              >
                🌙 Night
              </button>
              {gs.dayNight !== null && (
                <button
                  onClick={() => dispatch({ type: "set_day_night", state: null })}
                  className="px-2.5 py-1 rounded-lg text-xs font-display border border-mtg-border text-mtg-text-muted hover:border-mtg-border-light transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3: The Stack ─────────────────────────────────────── */}
      <div>
        <SectionLabel>
          ③ The Stack ({gs.stack.length} item{gs.stack.length !== 1 && "s"})
        </SectionLabel>
        <p className="text-[11px] text-mtg-text-muted -mt-1.5 mb-2 leading-relaxed">
          Spells and abilities resolve <span className="text-mtg-text font-semibold">Last In, First Out</span> — the most recently cast item resolves first.
        </p>
        <VisualCardStack stack={gs.stack} gs={gs} />
        <div className="mt-2 space-y-2">
          <AddSpellOrAbilityForm gs={gs} onCast={handleCast} />
          {gs.stack.length > 0 && (
            <Button onClick={handleResolve} className="w-full" variant="primary">
              {"\u25B6"} Review &amp; Resolve Stack ({gs.stack.length} item{gs.stack.length !== 1 ? "s" : ""})
            </Button>
          )}
          {gs.stack.length === 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {gs.playerOrder.map((pid) => (
                <button key={pid} onClick={() => dispatch({ type: "draw_card", player: pid })}
                  className="flex-1 px-2 py-1.5 text-xs font-display text-mtg-text-dim border border-mtg-border rounded-lg hover:border-mtg-gold/50 hover:text-mtg-gold transition-colors min-w-[80px]">
                  {pLabel(gs, pid)} draws
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Game Log */}
      {gs.actionLog.length > 0 && (
        <div>
          <SectionLabel>Game Log</SectionLabel>
          <Card className="!p-2"><ActionLog log={gs.actionLog} logEndRef={logEndRef} /></Card>
        </div>
      )}

      {/* Graveyards */}
      {gs.playerOrder.some(pid => (gs.graveyards[pid]?.length || 0) > 0) && (
        <div>
          <SectionLabel>Graveyards</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {gs.playerOrder.map(pid => (
              <div key={pid} className="text-xs text-mtg-text-dim">
                <span className="font-bold">{pLabel(gs, pid)}:</span>{" "}
                {(gs.graveyards[pid]?.length || 0) === 0 ? "Empty" : gs.graveyards[pid]!.join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      <AnimatePresence>{resSteps && <ResolutionModal steps={resSteps} onClose={() => setResSteps(null)} gs={gs} />}</AnimatePresence>
    </div>
  );
}
