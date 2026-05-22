"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FORMATS } from "@/data/formats";
import type { Format } from "@/types";
import { StackSimulator } from "@/components/stack/StackSimulator";

type CounterKey = "poison" | "energy" | "experience" | "commanderTax";
type ToolId = "dice" | "coin" | "monarch" | "initiative" | "daynight" | "storm" | "game";

interface Player {
  id: number;
  life: number;
  delta: number;
  poison: number;
  energy: number;
  experience: number;
  commanderTax: number;
  commanderDamage: Record<number, number>;
}

type Rotation = 0 | 90 | 180 | 270;

const COUNTER_CONFIGS: { key: CounterKey; icon: string; color: string; step: number }[] = [
  { key: "poison",       icon: "☠",  color: "#22c55e", step: 1 },
  { key: "energy",       icon: "⚡", color: "#f59e0b", step: 1 },
  { key: "experience",   icon: "✦",  color: "#8b5cf6", step: 1 },
  { key: "commanderTax", icon: "👑", color: "#c9a961", step: 2 },
];

const DICE_TYPES = [4, 6, 8, 10, 12, 20];

const TOOLS: { id: ToolId; icon: string; label: string }[] = [
  { id: "dice",       icon: "🎲", label: "Dice" },
  { id: "coin",       icon: "🪙", label: "Coin" },
  { id: "monarch",    icon: "👑", label: "Monarch" },
  { id: "initiative", icon: "⚔️", label: "Initiative" },
  { id: "daynight",   icon: "☀️", label: "Day/Night" },
  { id: "storm",      icon: "🌊", label: "Storm" },
  { id: "game",       icon: "⚙",  label: "Game" },
];

function makePlayers(count: number, life: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    life,
    delta: 0,
    poison: 0,
    energy: 0,
    experience: 0,
    commanderTax: 0,
    commanderDamage: {},
  }));
}

// ── LifeCounter ───────────────────────────────────────────────────────────────

export function LifeCounter({
  format,
  onEndGame,
  fullscreen = false,
}: {
  format: Format;
  onEndGame?: () => void;
  fullscreen?: boolean;
}) {
  const formatInfo = FORMATS.find((f) => f.id === format)!;

  const [players, setPlayers] = useState<Player[]>(() =>
    makePlayers(formatInfo.playerCount, formatInfo.startingLife)
  );
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [monarchId, setMonarchId] = useState<number | null>(null);
  const [initiativeId, setInitiativeId] = useState<number | null>(null);
  const [dayNight, setDayNight] = useState<"day" | "night" | null>(null);
  const [stormCount, setStormCount] = useState(0);
  const deltaTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const info = FORMATS.find((f) => f.id === format)!;
    deltaTimers.current.forEach((t) => clearTimeout(t));
    deltaTimers.current.clear();
    setPlayers(makePlayers(info.playerCount, info.startingLife));
    setUtilityOpen(false);
    setMonarchId(null);
    setInitiativeId(null);
    setDayNight(null);
    setStormCount(0);
  }, [format]);

  function changeLife(playerId: number, amount: number) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, life: p.life + amount, delta: p.delta + amount }
          : p
      )
    );
    const existing = deltaTimers.current.get(playerId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, delta: 0 } : p))
      );
      deltaTimers.current.delete(playerId);
    }, 1500);
    deltaTimers.current.set(playerId, timer);
  }

  function changeCounter(playerId: number, key: CounterKey, amount: number) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, [key]: Math.max(0, p[key] + amount) } : p
      )
    );
  }

  function changeCommanderDamage(playerId: number, fromId: number, amount: number) {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              commanderDamage: {
                ...p.commanderDamage,
                [fromId]: Math.max(0, (p.commanderDamage[fromId] ?? 0) + amount),
              },
            }
          : p
      )
    );
  }

  function handleCardClick(
    e: React.MouseEvent<HTMLDivElement>,
    playerId: number,
    rotation: Rotation
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    let isPlus: boolean;
    if (rotation === 90) {
      isPlus = e.clientX - rect.left > rect.width / 2;
    } else if (rotation === 270) {
      isPlus = e.clientX - rect.left < rect.width / 2;
    } else if (rotation === 180) {
      isPlus = e.clientY - rect.top > rect.height / 2;
    } else {
      isPlus = e.clientY - rect.top < rect.height / 2;
    }
    changeLife(playerId, isPlus ? 1 : -1);
  }

  function addPlayer() {
    if (players.length >= 8) return;
    const info = FORMATS.find((f) => f.id === format)!;
    const newId = Math.max(...players.map((p) => p.id)) + 1;
    setPlayers((prev) => [
      ...prev,
      { id: newId, life: info.startingLife, delta: 0, poison: 0, energy: 0, experience: 0, commanderTax: 0, commanderDamage: {} },
    ]);
  }

  function removePlayer() {
    if (players.length <= 1) return;
    setPlayers((prev) => prev.slice(0, -1));
  }

  function restart() {
    const info = FORMATS.find((f) => f.id === format)!;
    deltaTimers.current.forEach((t) => clearTimeout(t));
    deltaTimers.current.clear();
    setPlayers(makePlayers(info.playerCount, info.startingLife));
    setMonarchId(null);
    setInitiativeId(null);
    setDayNight(null);
    setStormCount(0);
  }

  const isCommander = format === "commander";
  const useGrid = players.length >= 3;

  type DisplayPlayer = Player & { rotation: Rotation };
  const displayPlayers: DisplayPlayer[] =
    isCommander && players.length === 4
      ? [
          { ...players[0], rotation: 90 as Rotation },
          { ...players[1], rotation: 270 as Rotation },
          { ...players[3], rotation: 90 as Rotation },
          { ...players[2], rotation: 270 as Rotation },
        ]
      : players.map((p, i) => ({
          ...p,
          rotation: (!isCommander && i === 0 ? 180 : 0) as Rotation,
        }));

  const menuItems = [
    { label: "➕  Add Player", action: addPlayer, disabled: players.length >= 8 },
    { label: "➖  Remove Player", action: removePlayer, disabled: players.length <= 1 },
    { label: "↺  Restart", action: restart },
    ...(onEndGame ? [{ label: "⚔  End Game", action: onEndGame }] : []),
  ];

  // Shared per-card prop factory
  function cardProps(p: Player, rotation: Rotation) {
    return {
      player: p,
      rotation,
      isCommander,
      allPlayers: players,
      monarchId,
      initiativeId,
      onClick: (e: React.MouseEvent<HTMLDivElement>) => handleCardClick(e, p.id, rotation),
      onChangeCounter: (key: CounterKey, amt: number) => changeCounter(p.id, key, amt),
      onChangeCommanderDamage: (fromId: number, amt: number) => changeCommanderDamage(p.id, fromId, amt),
      onTransferMonarch: (id: number) => setMonarchId((prev) => (prev === id ? null : id)),
      onTransferInitiative: (id: number) => setInitiativeId((prev) => (prev === id ? null : id)),
    };
  }

  // Shared row props factory
  function rowProps(compact: boolean) {
    return {
      compact,
      isCommander,
      allPlayers: players,
      monarchId,
      initiativeId,
      onCardClick: handleCardClick,
      onChangeCounter: changeCounter,
      onChangeCommanderDamage: changeCommanderDamage,
      onTransferMonarch: (id: number) => setMonarchId((prev) => (prev === id ? null : id)),
      onTransferInitiative: (id: number) => setInitiativeId((prev) => (prev === id ? null : id)),
    };
  }

  // Logo button that opens utility modal
  const logoBtn = (size: "sm" | "md") => (
    <button
      onClick={() => setUtilityOpen(true)}
      className={cn(
        "rounded-xl overflow-hidden border border-mtg-border/60 shadow-sm shadow-black/20 hover:border-mtg-gold/50 transition-all duration-200 flex-shrink-0",
        size === "md" ? "w-10 h-10" : "w-8 h-8"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Tools" className="w-full h-full object-cover" />
    </button>
  );

  // Center bar indicators (left and right of the logo)
  const leftIndicators = (
    <div className="flex-1 flex items-center justify-end pr-3 gap-1.5 min-w-0">
      {dayNight && <span className="text-base leading-none">{dayNight === "day" ? "☀️" : "🌙"}</span>}
      {monarchId !== null && <span className="text-base leading-none opacity-80">👑</span>}
    </div>
  );
  const rightIndicators = (
    <div className="flex-1 flex items-center justify-start pl-3 gap-1.5 min-w-0">
      {stormCount > 0 && (
        <span className="font-display text-[10px] text-mtg-text-muted flex items-center gap-0.5">
          <span>🌊</span><span className="tabular-nums">{stormCount}</span>
        </span>
      )}
      {initiativeId !== null && <span className="text-base leading-none opacity-80">⚔️</span>}
    </div>
  );

  const simulatorFormat = players.length === 4 ? "commander" : "modern";

  const utilityModal = utilityOpen ? (
    <UtilityModal
      key="utility-modal"
      players={players}
      monarchId={monarchId}
      initiativeId={initiativeId}
      dayNight={dayNight}
      stormCount={stormCount}
      onSetMonarch={setMonarchId}
      onSetInitiative={setInitiativeId}
      onSetDayNight={setDayNight}
      onSetStormCount={setStormCount}
      menuItems={menuItems}
      onClose={() => setUtilityOpen(false)}
      onOpenSimulator={() => { setUtilityOpen(false); setSimulatorOpen(true); }}
    />
  ) : null;

  const simulatorModal = simulatorOpen ? (
    <SimulatorModal
      key="simulator-modal"
      format={simulatorFormat}
      onClose={() => setSimulatorOpen(false)}
    />
  ) : null;

  // ── Fullscreen layout ──────────────────────────────────────────────────────
  if (fullscreen) {
    const half = Math.ceil(displayPlayers.length / 2);
    const topRow = displayPlayers.slice(0, half);
    const bottomRow = displayPlayers.slice(half);
    const showCross = isCommander && players.length === 4;

    return (
      <div className="flex flex-col h-full">
        {showCross ? (
          // ── Cross (+) layout for 4-player Commander ────────────────────────
          <>
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0">
                <PlayerCard compact fullscreen {...cardProps(topRow[0], topRow[0].rotation)} />
              </div>
              <div className="w-14 flex-shrink-0 bg-mtg-surface border-l border-r border-mtg-border" />
              <div className="flex-1 min-w-0">
                <PlayerCard compact fullscreen {...cardProps(topRow[1], topRow[1].rotation)} />
              </div>
            </div>

            {/* Horizontal bar: indicators | logo | indicators */}
            <div className="flex-shrink-0 h-14 bg-mtg-surface border-t border-b border-mtg-border flex items-center relative z-20">
              {leftIndicators}
              <div className="w-14 flex-shrink-0 flex items-center justify-center">
                {logoBtn("md")}
              </div>
              {rightIndicators}
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0">
                <PlayerCard compact fullscreen {...cardProps(bottomRow[0], bottomRow[0].rotation)} />
              </div>
              <div className="w-14 flex-shrink-0 bg-mtg-surface border-l border-r border-mtg-border" />
              <div className="flex-1 min-w-0">
                <PlayerCard compact fullscreen {...cardProps(bottomRow[1], bottomRow[1].rotation)} />
              </div>
            </div>
          </>
        ) : (
          // ── Simple top/bottom layout ───────────────────────────────────────
          <>
            <PlayerRow players={topRow} {...rowProps(topRow.length > 1)} />

            <div className="flex-shrink-0 h-14 bg-mtg-surface border-t border-b border-mtg-border flex items-center relative z-20">
              {leftIndicators}
              {logoBtn("md")}
              {rightIndicators}
            </div>

            <PlayerRow players={bottomRow} {...rowProps(bottomRow.length > 1)} />
          </>
        )}

        <AnimatePresence>{utilityModal}</AnimatePresence>
        <AnimatePresence>{simulatorModal}</AnimatePresence>
      </div>
    );
  }

  // ── Embedded (non-fullscreen) layout ────────────────────────────────────────
  const rowCount = useGrid ? Math.ceil(displayPlayers.length / 2) : displayPlayers.length;

  return (
    <div className="relative">
      <div
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
        className={cn("grid gap-3 mb-3", useGrid ? "grid-cols-2" : "grid-cols-1")}
      >
        {displayPlayers.map(({ rotation, ...player }) => (
          <PlayerCard
            key={player.id}
            compact={useGrid}
            fullscreen={false}
            {...cardProps(player, rotation)}
          />
        ))}
      </div>

      {/* Mini center bar: indicators + tools logo */}
      <div className="flex items-center gap-2 mb-4">
        {leftIndicators}
        {logoBtn("sm")}
        {rightIndicators}
      </div>

      <AnimatePresence>{utilityModal}</AnimatePresence>
      <AnimatePresence>{simulatorModal}</AnimatePresence>
    </div>
  );
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  players: (Player & { rotation: Rotation })[];
  onCardClick: (e: React.MouseEvent<HTMLDivElement>, id: number, rotation: Rotation) => void;
  compact: boolean;
  isCommander: boolean;
  allPlayers: Player[];
  monarchId: number | null;
  initiativeId: number | null;
  onChangeCounter: (playerId: number, key: CounterKey, amount: number) => void;
  onChangeCommanderDamage: (playerId: number, fromId: number, amount: number) => void;
  onTransferMonarch: (playerId: number) => void;
  onTransferInitiative: (playerId: number) => void;
}

function PlayerRow({
  players,
  onCardClick,
  compact,
  isCommander,
  allPlayers,
  monarchId,
  initiativeId,
  onChangeCounter,
  onChangeCommanderDamage,
  onTransferMonarch,
  onTransferInitiative,
}: PlayerRowProps) {
  if (players.length === 0) return <div className="flex-1 min-h-0 bg-mtg-bg" />;

  return (
    <div className="flex flex-1 min-h-0">
      {players.map(({ rotation, ...player }, i) => (
        <div key={player.id} className="flex-1 min-w-0 relative flex">
          {i > 0 && (
            <div className="absolute inset-y-0 left-0 w-px bg-mtg-border/40 pointer-events-none" />
          )}
          <PlayerCard
            player={player}
            compact={compact}
            fullscreen
            rotation={rotation}
            isCommander={isCommander}
            allPlayers={allPlayers}
            monarchId={monarchId}
            initiativeId={initiativeId}
            onClick={(e) => onCardClick(e, player.id, rotation)}
            onChangeCounter={(key, amt) => onChangeCounter(player.id, key, amt)}
            onChangeCommanderDamage={(fromId, amt) => onChangeCommanderDamage(player.id, fromId, amt)}
            onTransferMonarch={onTransferMonarch}
            onTransferInitiative={onTransferInitiative}
          />
        </div>
      ))}
    </div>
  );
}

// ── UtilityModal ──────────────────────────────────────────────────────────────

interface UtilityModalProps {
  players: Player[];
  monarchId: number | null;
  initiativeId: number | null;
  dayNight: "day" | "night" | null;
  stormCount: number;
  onSetMonarch: (id: number | null) => void;
  onSetInitiative: (id: number | null) => void;
  onSetDayNight: (v: "day" | "night" | null) => void;
  onSetStormCount: (n: number) => void;
  menuItems: { label: string; action: () => void; disabled?: boolean }[];
  onClose: () => void;
  onOpenSimulator: () => void;
}

function UtilityModal({
  players,
  monarchId,
  initiativeId,
  dayNight,
  stormCount,
  onSetMonarch,
  onSetInitiative,
  onSetDayNight,
  onSetStormCount,
  menuItems,
  onClose,
  onOpenSimulator,
}: UtilityModalProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("dice");

  const displayTools = TOOLS.map((t) =>
    t.id === "daynight" ? { ...t, icon: dayNight === "night" ? "🌙" : "☀️" } : t
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 bg-mtg-surface border border-mtg-border rounded-2xl w-80 max-w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-mtg-border/40">
          <span className="font-display text-[10px] tracking-[0.2em] text-mtg-text-muted uppercase">
            Tools
          </span>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full border border-mtg-border/40 flex items-center justify-center text-mtg-text-muted text-sm hover:border-mtg-border hover:text-mtg-text transition-colors"
          >
            ×
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-mtg-border/40 bg-mtg-bg/30">
          {displayTools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
              className={cn(
                "flex-1 py-2 text-center text-base transition-colors relative",
                activeTool === tool.id
                  ? "text-mtg-gold"
                  : "text-mtg-text-muted hover:text-mtg-text"
              )}
            >
              {tool.icon}
              {activeTool === tool.id && (
                <motion.div
                  layoutId="tool-tab-indicator"
                  className="absolute bottom-0 left-1 right-1 h-px bg-mtg-gold rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="p-4 min-h-[200px]">
          {activeTool === "dice" && <DicePanel />}
          {activeTool === "coin" && <CoinPanel />}
          {activeTool === "monarch" && (
            <TokenPanel
              label="Monarch"
              icon="👑"
              players={players}
              activeId={monarchId}
              onSet={onSetMonarch}
            />
          )}
          {activeTool === "initiative" && (
            <TokenPanel
              label="Initiative"
              icon="⚔️"
              players={players}
              activeId={initiativeId}
              onSet={onSetInitiative}
            />
          )}
          {activeTool === "daynight" && (
            <DayNightPanel value={dayNight} onSet={onSetDayNight} />
          )}
          {activeTool === "storm" && (
            <StormPanel count={stormCount} onSet={onSetStormCount} />
          )}
          {activeTool === "game" && (
            <GamePanel menuItems={menuItems} onClose={onClose} />
          )}
        </div>

        {/* Simulator shortcut */}
        <div className="px-4 pb-4 pt-0">
          <div className="h-px bg-mtg-border/30 mb-3" />
          <button
            onClick={onOpenSimulator}
            className="w-full py-2.5 rounded-lg border border-mtg-gold/30 bg-mtg-gold/8 text-mtg-gold font-display text-[11px] tracking-wider hover:bg-mtg-gold/15 hover:border-mtg-gold/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>🧪</span>
            <span>Simulator</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── SimulatorModal ────────────────────────────────────────────────────────────

function SimulatorModal({ format, onClose }: { format: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative z-10 flex flex-col rounded-2xl overflow-hidden bg-mtg-surface border border-mtg-border shadow-2xl"
        style={{ width: "90vw", height: "95vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — fixed above scrollable content */}
        <div className="flex-shrink-0 flex justify-end px-3 py-2 bg-mtg-surface border-b border-mtg-border/40">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-mtg-gold/60 bg-mtg-gold/15 text-mtg-gold text-xl font-bold leading-none flex items-center justify-center hover:bg-mtg-gold/30 hover:border-mtg-gold transition-colors shadow-md"
          >
            ×
          </button>
        </div>

        {/* Scrollable simulator content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StackSimulator format={format} />
        </div>
      </div>
    </motion.div>
  );
}

// ── DicePanel ─────────────────────────────────────────────────────────────────

function DicePanel() {
  const [singleRoll, setSingleRoll] = useState<{ die: number; result: number; key: number } | null>(null);
  const [allRolls, setAllRolls] = useState<{ die: number; result: number }[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function rollSingle(sides: number) {
    clearInterval(intervalRef.current);
    setAllRolls(null);
    const final = Math.floor(Math.random() * sides) + 1;
    let tick = 0;
    intervalRef.current = setInterval(() => {
      tick++;
      if (tick >= 9) {
        clearInterval(intervalRef.current);
        setSingleRoll({ die: sides, result: final, key: tick });
      } else {
        setSingleRoll({ die: sides, result: Math.floor(Math.random() * sides) + 1, key: tick });
      }
    }, 55);
  }

  function rollAll() {
    clearInterval(intervalRef.current);
    setSingleRoll(null);
    const finals = DICE_TYPES.map((d) => ({ die: d, result: Math.floor(Math.random() * d) + 1 }));
    let tick = 0;
    intervalRef.current = setInterval(() => {
      tick++;
      if (tick >= 9) {
        clearInterval(intervalRef.current);
        setAllRolls(finals);
      }
    }, 55);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Die buttons */}
      <div className="grid grid-cols-6 gap-1.5">
        {DICE_TYPES.map((d) => (
          <button
            key={d}
            onClick={() => rollSingle(d)}
            className="aspect-square rounded-lg bg-mtg-gold/8 border border-mtg-gold/25 text-mtg-gold font-display text-[11px] font-bold hover:bg-mtg-gold/15 active:scale-95 transition-all"
          >
            d{d}
          </button>
        ))}
      </div>

      <button
        onClick={rollAll}
        className="w-full py-2 rounded-lg border border-mtg-border text-mtg-text-muted font-display text-[10px] tracking-wider hover:border-mtg-gold/40 hover:text-mtg-gold transition-colors active:scale-[0.98]"
      >
        Roll All
      </button>

      {/* Single result */}
      {singleRoll && !allRolls && (
        <div className="flex flex-col items-center pt-1">
          <div className="text-[9px] text-mtg-text-dim font-display tracking-[0.2em] uppercase mb-1">
            d{singleRoll.die}
          </div>
          <motion.div
            key={singleRoll.key}
            initial={{ scale: 0.75, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="text-6xl font-display font-bold text-mtg-gold leading-none tabular-nums"
          >
            {singleRoll.result}
          </motion.div>
        </div>
      )}

      {/* Roll All results */}
      {allRolls && (
        <div className="grid grid-cols-6 gap-1 text-center pt-1">
          {allRolls.map(({ die, result }) => (
            <motion.div
              key={die}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="flex flex-col items-center"
            >
              <span className="text-[8px] text-mtg-text-dim font-display leading-none mb-0.5">d{die}</span>
              <span className="text-xl font-display font-bold text-mtg-gold leading-none tabular-nums">
                {result}
              </span>
            </motion.div>
          ))}
          <div className="col-span-6 text-center mt-1">
            <span className="text-[9px] text-mtg-text-muted font-display">
              total: {allRolls.reduce((s, r) => s + r.result, 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CoinPanel ─────────────────────────────────────────────────────────────────

function CoinPanel() {
  const [state, setState] = useState<"idle" | "flipping" | "heads" | "tails">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function flip() {
    if (state === "flipping") return;
    setState("flipping");
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState(Math.random() < 0.5 ? "heads" : "tails");
    }, 650);
  }

  const isHeads = state === "heads";
  const isTails = state === "tails";
  const isResult = isHeads || isTails;

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <motion.button
        onClick={flip}
        animate={state === "flipping" ? { scaleX: [1, 0, 1, 0, 1, 0, 1] } : {}}
        transition={{ duration: 0.65, times: [0, 0.15, 0.3, 0.45, 0.6, 0.78, 1] }}
        className={cn(
          "w-24 h-24 rounded-full border-2 flex items-center justify-center font-display font-bold text-3xl select-none transition-colors duration-300",
          isHeads
            ? "border-mtg-gold bg-mtg-gold/10 text-mtg-gold"
            : isTails
            ? "border-slate-500 bg-slate-500/10 text-slate-400"
            : "border-mtg-border/60 bg-mtg-surface text-mtg-text-muted hover:border-mtg-gold/40 hover:bg-mtg-gold/5"
        )}
      >
        {state === "idle" ? "?" : state === "flipping" ? "?" : isHeads ? "H" : "T"}
      </motion.button>

      <AnimatePresence mode="wait">
        {isResult && (
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "font-display tracking-[0.25em] text-sm uppercase",
              isHeads ? "text-mtg-gold" : "text-slate-400"
            )}
          >
            {isHeads ? "Heads" : "Tails"}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-mtg-text-muted/50 text-[10px] font-display tracking-wide">
        {state === "flipping" ? "flipping…" : "tap to flip"}
      </p>
    </div>
  );
}

// ── TokenPanel (Monarch / Initiative) ────────────────────────────────────────

function TokenPanel({
  label,
  icon,
  players,
  activeId,
  onSet,
}: {
  label: string;
  icon: string;
  players: Player[];
  activeId: number | null;
  onSet: (id: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-[10px] tracking-wide text-mtg-text-muted">
        {activeId !== null
          ? `${icon} Player ${activeId} has the ${label}`
          : `No ${label}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => onSet(activeId === p.id ? null : p.id)}
            className={cn(
              "py-2.5 rounded-lg border font-display text-sm transition-all active:scale-[0.97]",
              activeId === p.id
                ? "border-mtg-gold/60 bg-mtg-gold/12 text-mtg-gold"
                : "border-mtg-border/60 text-mtg-text-muted hover:border-mtg-gold/30 hover:text-mtg-text"
            )}
          >
            {activeId === p.id ? `${icon} ` : ""}P{p.id}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── DayNightPanel ─────────────────────────────────────────────────────────────

function DayNightPanel({
  value,
  onSet,
}: {
  value: "day" | "night" | null;
  onSet: (v: "day" | "night" | null) => void;
}) {
  const options: { v: "day" | "night" | null; icon: string; label: string }[] = [
    { v: null,    icon: "—",  label: "None" },
    { v: "day",   icon: "☀️", label: "Day" },
    { v: "night", icon: "🌙", label: "Night" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-[10px] tracking-wide text-mtg-text-muted">
        {value === null ? "Day/Night not tracking" : value === "day" ? "☀️ It is Day" : "🌙 It is Night"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({ v, icon, label }) => (
          <button
            key={label}
            onClick={() => onSet(v)}
            className={cn(
              "py-3 rounded-lg border font-display text-xs flex flex-col items-center gap-1.5 transition-all active:scale-[0.97]",
              value === v
                ? "border-mtg-gold/60 bg-mtg-gold/12 text-mtg-gold"
                : "border-mtg-border/60 text-mtg-text-muted hover:border-mtg-gold/30 hover:text-mtg-text"
            )}
          >
            <span className="text-xl leading-none">{icon}</span>
            <span className="tracking-wide">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── StormPanel ────────────────────────────────────────────────────────────────

function StormPanel({
  count,
  onSet,
}: {
  count: number;
  onSet: (n: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-1">
      <div className="text-[9px] text-mtg-text-dim font-display tracking-[0.2em] uppercase">
        Storm Count
      </div>
      <div className="flex items-center gap-5">
        <button
          onClick={() => onSet(Math.max(0, count - 1))}
          className="w-10 h-10 rounded-full border border-mtg-border text-mtg-text-muted text-xl font-display hover:border-mtg-gold/50 hover:text-mtg-gold transition-colors active:scale-95"
        >
          −
        </button>
        <motion.div
          key={count}
          initial={{ scale: 0.75, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="text-6xl font-display font-bold text-mtg-gold w-16 text-center leading-none tabular-nums"
        >
          {count}
        </motion.div>
        <button
          onClick={() => onSet(count + 1)}
          className="w-10 h-10 rounded-full border border-mtg-border text-mtg-text-muted text-xl font-display hover:border-mtg-gold/50 hover:text-mtg-gold transition-colors active:scale-95"
        >
          +
        </button>
      </div>
      <button
        onClick={() => onSet(0)}
        className="text-[10px] text-mtg-text-muted/50 font-display tracking-wide hover:text-mtg-text-muted transition-colors"
      >
        ↺ Reset
      </button>
    </div>
  );
}

// ── GamePanel ─────────────────────────────────────────────────────────────────

function GamePanel({
  menuItems,
  onClose,
}: {
  menuItems: { label: string; action: () => void; disabled?: boolean }[];
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      {menuItems.map(({ label, action, disabled }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          disabled={disabled}
          className={cn(
            "w-full px-3 py-3 text-left font-display text-[11px] tracking-wide rounded-lg transition-colors",
            disabled
              ? "text-mtg-text-muted opacity-35 cursor-not-allowed"
              : "text-mtg-text hover:bg-mtg-gold/10 hover:text-mtg-gold active:bg-mtg-gold/20"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── CounterPill ───────────────────────────────────────────────────────────────

function CounterPill({
  icon,
  color,
  value,
  onIncrement,
  onDecrement,
}: {
  icon: string;
  color: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div
      className="flex items-center rounded-full overflow-hidden border"
      style={{ borderColor: `${color}50`, backgroundColor: `${color}0d` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onPointerDown={(e) => { e.stopPropagation(); onDecrement(); }}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] leading-none transition-opacity active:opacity-50 hover:opacity-70"
        style={{ color }}
      >
        −
      </button>
      <button
        onPointerDown={(e) => { e.stopPropagation(); onIncrement(); }}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 pr-1.5 py-0.5 text-[10px] leading-none transition-opacity active:opacity-50 hover:opacity-70"
        style={{ color }}
      >
        <span className="text-[9px]">{icon}</span>
        <span className="font-display font-bold tabular-nums">{value}</span>
      </button>
    </div>
  );
}

// ── CommanderDamagePill ───────────────────────────────────────────────────────

function CommanderDamagePill({
  playerId,
  damage,
  lethal,
  onIncrement,
  onDecrement,
}: {
  playerId: number;
  damage: number;
  lethal: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const color = lethal ? "#ef4444" : "#64748b";
  return (
    <div
      className="flex items-center rounded-full overflow-hidden border"
      style={{ borderColor: `${color}50`, backgroundColor: `${color}0d` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onPointerDown={(e) => { e.stopPropagation(); onDecrement(); }}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] leading-none transition-opacity active:opacity-50 hover:opacity-70"
        style={{ color }}
      >
        −
      </button>
      <button
        onPointerDown={(e) => { e.stopPropagation(); onIncrement(); }}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 pr-1.5 py-0.5 transition-opacity active:opacity-50 hover:opacity-70"
        style={{ color }}
      >
        <span className="font-display text-[8px] leading-none opacity-70">P{playerId}</span>
        <span className="font-display font-bold text-[10px] leading-none tabular-nums">
          {lethal ? "☠" : damage}
        </span>
      </button>
    </div>
  );
}

// ── CounterBar ────────────────────────────────────────────────────────────────

function CounterBar({
  player,
  isCommander,
  allPlayers,
  onChangeCounter,
  onChangeCommanderDamage,
  onCollapse,
}: {
  player: Player;
  isCommander: boolean;
  allPlayers: Player[];
  onChangeCounter: (key: CounterKey, amount: number) => void;
  onChangeCommanderDamage: (fromId: number, amount: number) => void;
  onCollapse: () => void;
}) {
  const opponents = isCommander ? allPlayers.filter((p) => p.id !== player.id) : [];
  const hasAnyDamage = opponents.some((opp) => (player.commanderDamage[opp.id] ?? 0) > 0);

  return (
    <div
      className="flex flex-col items-center gap-1 mt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {COUNTER_CONFIGS.map(({ key, icon, color, step }) => (
          <CounterPill
            key={key}
            icon={icon}
            color={color}
            value={player[key]}
            onIncrement={() => onChangeCounter(key, step)}
            onDecrement={() => onChangeCounter(key, -step)}
          />
        ))}
        <button
          onPointerDown={(e) => { e.stopPropagation(); onCollapse(); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded-full border border-mtg-border/40 flex items-center justify-center text-mtg-text-muted/40 text-[9px] leading-none hover:border-mtg-border hover:text-mtg-text-muted transition-colors ml-0.5"
        >
          ×
        </button>
      </div>

      {isCommander && opponents.length > 0 && (
        <div className="flex gap-1 flex-wrap justify-center">
          {opponents.map((opp) => {
            const dmg = player.commanderDamage[opp.id] ?? 0;
            const lethal = dmg >= 21;
            if (dmg === 0 && !hasAnyDamage) return null;
            return (
              <CommanderDamagePill
                key={opp.id}
                playerId={opp.id}
                damage={dmg}
                lethal={lethal}
                onIncrement={() => onChangeCommanderDamage(opp.id, 1)}
                onDecrement={() => onChangeCommanderDamage(opp.id, -1)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PlayerCard ────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  player: Player;
  compact: boolean;
  fullscreen: boolean;
  rotation: Rotation;
  isCommander: boolean;
  allPlayers: Player[];
  monarchId: number | null;
  initiativeId: number | null;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onChangeCounter: (key: CounterKey, amount: number) => void;
  onChangeCommanderDamage: (fromId: number, amount: number) => void;
  onTransferMonarch: (playerId: number) => void;
  onTransferInitiative: (playerId: number) => void;
}

function PlayerCard({
  player,
  compact,
  fullscreen,
  rotation,
  isCommander,
  allPlayers,
  monarchId,
  initiativeId,
  onClick,
  onChangeCounter,
  onChangeCommanderDamage,
  onTransferMonarch,
  onTransferInitiative,
}: PlayerCardProps) {
  const [countersExpanded, setCountersExpanded] = useState(false);
  const dead = player.life <= 0;
  const isMonarch = monarchId === player.id;
  const hasInitiative = initiativeId === player.id;
  const isSideways = rotation === 90 || rotation === 270;
  const plusOnRight = rotation === 90;
  const plusAtBottom = rotation === 180;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden select-none cursor-pointer touch-manipulation transition-all duration-300",
        fullscreen
          ? cn(
              "w-full h-full min-h-0",
              dead ? "bg-red-950/20" : isMonarch ? "bg-[rgba(201,169,97,0.07)]" : "bg-mtg-surface"
            )
          : cn(
              "rounded-xl border",
              compact ? "h-52" : "h-44",
              dead
                ? "border-red-900/60 bg-red-950/20"
                : isMonarch
                ? "border-mtg-gold/45 bg-mtg-gold/5"
                : "border-mtg-border bg-mtg-surface"
            )
      )}
    >
      {/* Monarch gold edge glow (fullscreen only) */}
      {isMonarch && fullscreen && (
        <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-mtg-gold/40" />
      )}

      {isSideways ? (
        <>
          <div
            className={cn(
              "absolute inset-y-0 w-1/2 flex items-center justify-center pointer-events-none",
              plusOnRight ? "right-0" : "left-0"
            )}
          >
            <span
              style={{ transform: `rotate(${rotation}deg)` }}
              className={cn("text-mtg-text-muted/15 font-display select-none", fullscreen ? "text-4xl" : "text-xl")}
            >
              +
            </span>
          </div>
          <div
            className={cn(
              "absolute inset-y-0 w-1/2 flex items-center justify-center pointer-events-none",
              plusOnRight ? "left-0" : "right-0"
            )}
          >
            <span
              style={{ transform: `rotate(${rotation}deg)` }}
              className={cn("text-mtg-text-muted/15 font-display select-none", fullscreen ? "text-4xl" : "text-xl")}
            >
              −
            </span>
          </div>
          <div className="absolute top-3 bottom-3 left-1/2 w-px bg-mtg-border/25 pointer-events-none" />
        </>
      ) : (
        <>
          <div
            className={cn(
              "absolute left-0 right-0 flex justify-center pointer-events-none",
              plusAtBottom
                ? "top-1/2 bottom-0 items-end pb-3"
                : "top-0 bottom-1/2 items-start pt-3"
            )}
          >
            <span className={cn("text-mtg-text-muted/15 font-display select-none leading-none", fullscreen ? "text-4xl" : "text-xl")}>+</span>
          </div>
          <div
            className={cn(
              "absolute left-0 right-0 flex justify-center pointer-events-none",
              plusAtBottom
                ? "top-0 bottom-1/2 items-start pt-3"
                : "top-1/2 bottom-0 items-end pb-3"
            )}
          >
            <span className={cn("text-mtg-text-muted/15 font-display select-none leading-none", fullscreen ? "text-4xl" : "text-xl")}>−</span>
          </div>
          <div className="absolute left-3 right-3 top-1/2 h-px bg-mtg-border/25 pointer-events-none" />
        </>
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : undefined}
          className="flex flex-col items-center"
        >
          {/* Monarch / Initiative transfer badges */}
          {(monarchId !== null || initiativeId !== null) && (
            <div className="flex items-center gap-2 mb-1.5">
              {monarchId !== null && (
                <button
                  onPointerDown={(e) => { e.stopPropagation(); onTransferMonarch(player.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "text-base leading-none transition-all duration-200",
                    isMonarch ? "opacity-100" : "opacity-15 hover:opacity-45"
                  )}
                >
                  👑
                </button>
              )}
              {initiativeId !== null && (
                <button
                  onPointerDown={(e) => { e.stopPropagation(); onTransferInitiative(player.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "text-base leading-none transition-all duration-200",
                    hasInitiative ? "opacity-100" : "opacity-15 hover:opacity-45"
                  )}
                >
                  ⚔️
                </button>
              )}
            </div>
          )}

          <span className={cn(
            "font-display tracking-[0.12em] text-mtg-text-muted uppercase mb-1",
            fullscreen ? (compact ? "text-xs" : "text-sm") : "text-[9px]"
          )}>
            Player {player.id}
          </span>
          <span
            className={cn(
              "font-display font-bold leading-none",
              dead ? "text-red-400" : "text-mtg-gold",
              fullscreen
                ? compact ? "text-7xl" : "text-9xl"
                : compact ? "text-4xl" : "text-5xl"
            )}
          >
            {player.life}
          </span>
          {player.delta !== 0 && (
            <span
              className={cn(
                "font-display font-semibold mt-1",
                fullscreen ? (compact ? "text-lg" : "text-2xl") : "text-[11px]",
                player.delta > 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {player.delta > 0 ? `+${player.delta}` : player.delta}
            </span>
          )}

          {countersExpanded ? (
            <CounterBar
              player={player}
              isCommander={isCommander}
              allPlayers={allPlayers}
              onChangeCounter={onChangeCounter}
              onChangeCommanderDamage={onChangeCommanderDamage}
              onCollapse={() => setCountersExpanded(false)}
            />
          ) : (
            <button
              onPointerDown={(e) => { e.stopPropagation(); setCountersExpanded(true); }}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 w-5 h-5 rounded-full border border-mtg-border/30 flex items-center justify-center text-mtg-text-muted/30 text-[10px] leading-none hover:border-mtg-border/60 hover:text-mtg-text-muted/60 transition-colors"
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
