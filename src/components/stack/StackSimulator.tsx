"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createInitialState,
  processAction,
  canUndo,
  parseTriggersFromOracle,
} from "@/engine";
import type {
  GameState,
  PlayerId,
  EngineStackItem,
  Permanent,
  SpellType,
  KeywordAbility,
  TriggerDefinition,
  LogEntry,
} from "@/engine/types";
import { STEP_LABELS } from "@/engine/types";
import { generateId } from "@/engine/utils";
import { Button, Card, Badge, SectionLabel } from "@/components/ui";
import { useCardAutocomplete } from "@/hooks";
import { cn } from "@/lib/utils";

// ─── Color Constants ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  spell: "#3b82f6",
  activated_ability: "#ec4899",
  triggered_ability: "#f59e0b",
};

const SPELL_TYPE_COLORS: Record<string, string> = {
  instant: "#3b82f6",
  sorcery: "#8b5cf6",
  creature: "#22c55e",
  artifact: "#94a3b8",
  enchantment: "#c084fc",
  planeswalker: "#f97316",
};

const LOG_COLORS: Record<string, string> = {
  cast_spell: "#3b82f6",
  activate_ability: "#ec4899",
  trigger: "#f59e0b",
  resolve: "#22c55e",
  counter: "#dc2626",
  fizzle: "#6b7280",
  priority_pass: "#6b7280",
  priority_receive: "#8b5cf6",
  phase_change: "#c9a961",
  state_based_action: "#dc2626",
  game_event: "#6b7280",
  explanation: "#c9a961",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function PlayerPanel({
  player,
  isActive,
  hasPriority,
}: {
  player: { id: PlayerId; label: string; life: number };
  isActive: boolean;
  hasPriority: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 p-3 rounded-xl border transition-all duration-300",
        hasPriority
          ? "border-mtg-gold bg-mtg-gold/10"
          : "border-mtg-border bg-mtg-card"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-display font-bold text-mtg-text flex items-center gap-2">
            {player.label}
            {isActive && <Badge>Active</Badge>}
            {hasPriority && <Badge color="#22c55e">Priority</Badge>}
          </div>
        </div>
        <div className="text-2xl font-display font-bold text-mtg-text">
          {player.life}
        </div>
      </div>
    </div>
  );
}

function StackDisplay({ stack }: { stack: EngineStackItem[] }) {
  if (stack.length === 0) {
    return (
      <div className="text-center py-6 text-mtg-text-muted text-xs border border-dashed border-mtg-border rounded-xl">
        Stack is empty
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-mtg-gold/30 to-transparent" />
      {[...stack].reverse().map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-2.5 mb-1.5 pl-9 relative"
        >
          <div
            className="absolute left-2.5 w-3 h-3 rounded-full border-2 border-mtg-bg"
            style={{
              background:
                TYPE_COLORS[item.type] ||
                SPELL_TYPE_COLORS[item.spellType || ""] ||
                "#6b7280",
              boxShadow:
                i === 0
                  ? `0 0 8px ${TYPE_COLORS[item.type] || "#6b7280"}66`
                  : "none",
            }}
          />
          <Card
            className={cn(
              "flex-1 !p-2.5",
              i === 0 && "!border-mtg-gold"
            )}
          >
            <div className="flex justify-between items-center">
              <div className="min-w-0">
                <span className="text-sm font-bold font-display text-mtg-text">
                  {item.name}
                </span>
                <div className="text-[11px] text-mtg-text-muted mt-0.5">
                  {item.controller === "player_a" ? "Player A" : "Player B"}
                  {" · "}
                  <span
                    style={{
                      color:
                        TYPE_COLORS[item.type] ||
                        SPELL_TYPE_COLORS[item.spellType || ""] ||
                        "#6b7280",
                    }}
                  >
                    {item.type === "triggered_ability"
                      ? "triggered"
                      : item.spellType || item.type}
                  </span>
                  {item.targets.length > 0 &&
                    ` · → ${item.targets.map((t) => t.name).join(", ")}`}
                </div>
                {item.effect && (
                  <div className="text-[11px] text-mtg-text-dim mt-1 italic">
                    {item.effect}
                  </div>
                )}
              </div>
              {i === 0 && <Badge>Next</Badge>}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function ActionLog({
  log,
  logEndRef,
}: {
  log: LogEntry[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
      {log.map((entry) => (
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "px-2.5 py-1.5 rounded-lg text-[12px] leading-relaxed",
            entry.highlight ? "bg-mtg-surface" : ""
          )}
        >
          <div
            className="font-display"
            style={{ color: LOG_COLORS[entry.type] || "#8a8894" }}
          >
            {entry.type === "explanation" && "💡 "}
            {entry.type === "trigger" && "⚡ "}
            {entry.type === "resolve" && "✓ "}
            {entry.type === "fizzle" && "✗ "}
            {entry.type === "state_based_action" && "☠ "}
            {entry.type === "phase_change" && "⏵ "}
            {entry.text}
          </div>
          {entry.detail && (
            <div className="text-[11px] text-mtg-text-muted mt-0.5 pl-3 border-l border-mtg-border">
              {entry.detail}
            </div>
          )}
        </motion.div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

function BattlefieldDisplay({
  permanents,
  playerId,
  playerLabel,
}: {
  permanents: Permanent[];
  playerId: PlayerId;
  playerLabel: string;
}) {
  const playerPerms = permanents.filter((p) => p.controller === playerId);

  if (playerPerms.length === 0) {
    return (
      <div className="text-[11px] text-mtg-text-muted italic py-2">
        {playerLabel}: No permanents
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div className="text-[10px] text-mtg-text-muted uppercase tracking-wider mb-1.5 font-bold">
        {playerLabel}&apos;s battlefield
      </div>
      <div className="flex flex-wrap gap-1.5">
        {playerPerms.map((perm) => (
          <div
            key={perm.id}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[11px] border",
              perm.tapped
                ? "border-mtg-border bg-mtg-surface opacity-60"
                : "border-mtg-border-light bg-mtg-card"
            )}
          >
            <span className="font-display font-bold text-mtg-text">
              {perm.name}
            </span>
            {perm.basePower !== undefined && (
              <span className="text-mtg-text-dim ml-1">
                {perm.currentPower ?? perm.basePower}/
                {perm.currentToughness ?? perm.baseToughness}
                {perm.damageMarked > 0 && (
                  <span className="text-red-400 ml-0.5">
                    ({perm.damageMarked} dmg)
                  </span>
                )}
              </span>
            )}
            {perm.keywords.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {perm.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[9px] text-mtg-gold bg-mtg-gold/10 px-1 rounded"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
            {perm.tapped && (
              <span className="text-[9px] text-mtg-text-muted ml-1">
                (tapped)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Add to Stack Form ───────────────────────────────────────────────────────

function AddToStackForm({
  gameState,
  onCast,
}: {
  gameState: GameState;
  onCast: (item: Omit<EngineStackItem, "id" | "timestamp">) => void;
}) {
  const [mode, setMode] = useState<"spell" | "ability">("spell");
  const [spellType, setSpellType] = useState<SpellType>("instant");
  const [controller, setController] = useState<PlayerId>(
    gameState.priority.priorityHolder
  );
  const [target, setTarget] = useState("");
  const [effect, setEffect] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { query, setQuery, suggestions } = useCardAutocomplete();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (cardName?: string) => {
    const name = cardName || query;
    if (!name.trim()) return;

    const targets = target.trim()
      ? [
          {
            type: "permanent" as const,
            id: generateId(),
            name: target.trim(),
            isLegal: true,
          },
        ]
      : [];

    onCast({
      type: mode === "spell" ? "spell" : "activated_ability",
      spellType: mode === "spell" ? spellType : undefined,
      name: name.trim(),
      controller,
      targets,
      effect: effect.trim() || undefined,
      isManaAbility: false,
      hasSplitSecond: false,
    });

    setQuery("");
    setTarget("");
    setEffect("");
    setShowForm(false);
    setShowSuggestions(false);
  };

  if (!showForm) {
    return (
      <Button
        onClick={() => setShowForm(true)}
        className="w-full"
        disabled={gameState.priority.splitSecondActive}
      >
        {gameState.priority.splitSecondActive
          ? "Split second — cannot cast or activate"
          : "+ Cast Spell / Activate Ability"}
      </Button>
    );
  }

  return (
    <Card className="!p-3">
      {/* Mode toggle */}
      <div className="flex gap-1 mb-2.5">
        <button
          onClick={() => setMode("spell")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-all",
            mode === "spell"
              ? "bg-mtg-gold text-mtg-bg"
              : "text-mtg-text-dim hover:text-mtg-text"
          )}
        >
          Cast Spell
        </button>
        <button
          onClick={() => setMode("ability")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-all",
            mode === "ability"
              ? "bg-mtg-gold text-mtg-bg"
              : "text-mtg-text-dim hover:text-mtg-text"
          )}
        >
          Activate Ability
        </button>
      </div>

      <div className="space-y-2">
        {/* Card name with autocomplete */}
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() =>
              suggestions.length > 0 && setShowSuggestions(true)
            }
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={
              mode === "spell" ? "Card name..." : "Ability name..."
            }
            className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-display outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted"
          />
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-36 overflow-y-auto"
              >
                {suggestions.slice(0, 6).map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setQuery(name);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {mode === "spell" && (
            <select
              value={spellType}
              onChange={(e) => setSpellType(e.target.value as SpellType)}
              className="px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none"
            >
              <option value="instant">Instant</option>
              <option value="sorcery">Sorcery</option>
              <option value="creature">Creature</option>
              <option value="artifact">Artifact</option>
              <option value="enchantment">Enchantment</option>
              <option value="planeswalker">Planeswalker</option>
            </select>
          )}
          <select
            value={controller}
            onChange={(e) => setController(e.target.value as PlayerId)}
            className="px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none"
          >
            <option value="player_a">Player A</option>
            <option value="player_b">Player B</option>
          </select>
        </div>

        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target (optional)"
          className="w-full px-3 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs font-display outline-none placeholder:text-mtg-text-muted"
        />

        <input
          value={effect}
          onChange={(e) => setEffect(e.target.value)}
          placeholder="Effect description (optional)"
          className="w-full px-3 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs font-display outline-none placeholder:text-mtg-text-muted"
        />

        <div className="flex gap-2">
          <Button onClick={() => handleSubmit()} className="flex-1" size="sm">
            {mode === "spell" ? "Cast" : "Activate"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowForm(false)}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Add Permanent Form ──────────────────────────────────────────────────────

function AddPermanentForm({
  onAdd,
}: {
  onAdd: (permanent: Omit<Permanent, "id">) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [controller, setController] = useState<PlayerId>("player_a");
  const [power, setPower] = useState("");
  const [toughness, setToughness] = useState("");
  const [keywords, setKeywords] = useState<KeywordAbility[]>([]);
  const [oracleText, setOracleText] = useState("");

  const { query, setQuery, suggestions } = useCardAutocomplete();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const COMMON_KEYWORDS: KeywordAbility[] = [
    "deathtouch",
    "first_strike",
    "flying",
    "haste",
    "hexproof",
    "indestructible",
    "lifelink",
    "menace",
    "reach",
    "trample",
    "vigilance",
  ];

  const toggleKeyword = (kw: KeywordAbility) => {
    setKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  };

  const handleSubmit = () => {
    const cardName = name || query;
    if (!cardName.trim()) return;

    const triggers = oracleText.trim()
      ? parseTriggersFromOracle(oracleText, "temp", cardName.trim(), controller)
      : [];

    onAdd({
      name: cardName.trim(),
      types: power ? ["creature"] : ["enchantment"],
      controller,
      owner: controller,
      basePower: power ? parseInt(power) || 0 : undefined,
      baseToughness: toughness ? parseInt(toughness) || 0 : undefined,
      currentPower: power ? parseInt(power) || 0 : undefined,
      currentToughness: toughness ? parseInt(toughness) || 0 : undefined,
      damageMarked: 0,
      keywords,
      triggers,
      tapped: false,
      summoningSick: false,
      counters: {},
      oracleText: oracleText.trim() || undefined,
    });

    setName("");
    setQuery("");
    setPower("");
    setToughness("");
    setKeywords([]);
    setOracleText("");
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-2 text-xs text-mtg-text-dim hover:text-mtg-gold border border-dashed border-mtg-border rounded-lg transition-colors font-display"
      >
        + Add Permanent to Battlefield
      </button>
    );
  }

  return (
    <Card className="!p-3">
      <SectionLabel>Add permanent</SectionLabel>
      <div className="space-y-2">
        <div className="relative">
          <input
            value={query || name}
            onChange={(e) => {
              setQuery(e.target.value);
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            placeholder="Permanent name..."
            className="w-full px-3 py-2 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-sm font-display outline-none focus:border-mtg-gold/50 placeholder:text-mtg-text-muted"
          />
          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 top-full mt-1 left-0 right-0 bg-mtg-surface border border-mtg-border rounded-lg shadow-xl overflow-hidden max-h-36 overflow-y-auto"
              >
                {suggestions.slice(0, 6).map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setName(n);
                      setQuery(n);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-mtg-text hover:bg-mtg-surface-hover transition-colors border-b border-mtg-border/50 last:border-0"
                  >
                    {n}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select
            value={controller}
            onChange={(e) => setController(e.target.value as PlayerId)}
            className="px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none"
          >
            <option value="player_a">Player A</option>
            <option value="player_b">Player B</option>
          </select>
          <input
            value={power}
            onChange={(e) => setPower(e.target.value)}
            placeholder="Power"
            className="px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none placeholder:text-mtg-text-muted"
          />
          <input
            value={toughness}
            onChange={(e) => setToughness(e.target.value)}
            placeholder="Toughness"
            className="px-2.5 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs outline-none placeholder:text-mtg-text-muted"
          />
        </div>

        {/* Keywords */}
        <div>
          <div className="text-[10px] text-mtg-text-muted uppercase tracking-wider mb-1 font-bold">
            Keywords
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_KEYWORDS.map((kw) => (
              <button
                key={kw}
                onClick={() => toggleKeyword(kw)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] border transition-all font-display capitalize",
                  keywords.includes(kw)
                    ? "border-mtg-gold bg-mtg-gold/15 text-mtg-gold"
                    : "border-mtg-border text-mtg-text-muted hover:border-mtg-border-light"
                )}
              >
                {kw.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Oracle text for trigger parsing */}
        <textarea
          value={oracleText}
          onChange={(e) => setOracleText(e.target.value)}
          placeholder="Oracle text (for trigger detection)..."
          rows={2}
          className="w-full px-3 py-1.5 bg-mtg-surface border border-mtg-border rounded-lg text-mtg-text text-xs font-display outline-none resize-none placeholder:text-mtg-text-muted"
        />

        <div className="flex gap-2">
          <Button onClick={handleSubmit} className="flex-1" size="sm">
            Add to Battlefield
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowForm(false)}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StackSimulator() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState.actionLog.length]);

  const dispatch = useCallback((action: Parameters<typeof processAction>[1]) => {
    setGameState((prev) => processAction(prev, action));
  }, []);

  const handleReset = () => {
    setGameState(createInitialState());
  };

  const priorityPlayer = gameState.priority.priorityHolder;
  const priorityLabel = gameState.players[priorityPlayer].label;

  return (
    <div className="space-y-4">
      {/* Turn & Phase indicator */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-mtg-text-muted uppercase tracking-wider font-bold">
            Turn {gameState.turnNumber} ·{" "}
            {gameState.players[gameState.activePlayer].label}&apos;s Turn
          </div>
          <div className="text-sm font-display font-bold text-mtg-gold mt-0.5">
            {STEP_LABELS[gameState.currentStep]}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatch({ type: "undo" })}
            disabled={!canUndo()}
          >
            ↺ Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </div>

      {/* Player panels */}
      <div className="flex gap-2">
        <PlayerPanel
          player={gameState.players.player_a}
          isActive={gameState.activePlayer === "player_a"}
          hasPriority={priorityPlayer === "player_a"}
        />
        <PlayerPanel
          player={gameState.players.player_b}
          isActive={gameState.activePlayer === "player_b"}
          hasPriority={priorityPlayer === "player_b"}
        />
      </div>

      {/* Battlefield */}
      <div>
        <SectionLabel>Battlefield</SectionLabel>
        <BattlefieldDisplay
          permanents={gameState.battlefield}
          playerId="player_a"
          playerLabel="Player A"
        />
        <BattlefieldDisplay
          permanents={gameState.battlefield}
          playerId="player_b"
          playerLabel="Player B"
        />
        <AddPermanentForm
          onAdd={(perm) => dispatch({ type: "add_permanent", permanent: perm })}
        />
      </div>

      {/* The Stack */}
      <div>
        <SectionLabel>
          The Stack ({gameState.stack.length} item
          {gameState.stack.length !== 1 && "s"})
        </SectionLabel>
        <StackDisplay stack={gameState.stack} />
      </div>

      {/* Priority actions */}
      <div>
        <SectionLabel>
          {priorityLabel} has priority
        </SectionLabel>
        <div className="space-y-2">
          <AddToStackForm
            gameState={gameState}
            onCast={(item) =>
              dispatch({ type: "cast_spell", spell: item })
            }
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "pass_priority" })}
              className="flex-1"
            >
              Pass Priority
              {gameState.stack.length > 0 &&
                gameState.priority.hasPassed[
                  priorityPlayer === "player_a" ? "player_b" : "player_a"
                ] &&
                " (will resolve)"}
            </Button>
            {gameState.stack.length === 0 && (
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: "advance_phase" })}
                size="sm"
              >
                Next Phase →
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Action Log */}
      {gameState.actionLog.length > 0 && (
        <div>
          <SectionLabel>
            Action Log ({gameState.actionLog.length})
          </SectionLabel>
          <Card className="!p-2">
            <ActionLog log={gameState.actionLog} logEndRef={logEndRef} />
          </Card>
        </div>
      )}

      {/* Graveyards */}
      {(gameState.graveyards.player_a.length > 0 ||
        gameState.graveyards.player_b.length > 0) && (
        <div>
          <SectionLabel>Graveyards</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {(["player_a", "player_b"] as PlayerId[]).map((pid) => (
              <div key={pid} className="text-[11px] text-mtg-text-dim">
                <span className="font-bold">
                  {gameState.players[pid].label}:
                </span>{" "}
                {gameState.graveyards[pid].length === 0
                  ? "Empty"
                  : gameState.graveyards[pid].join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
