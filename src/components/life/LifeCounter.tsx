"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FORMATS } from "@/data/formats";
import type { Format } from "@/types";

interface Player {
  id: number;
  life: number;
  delta: number;
}

type Rotation = 0 | 90 | 180 | 270;

interface DiceResult {
  label: string;
  total: number;
  rolls?: number[];
}

function makePlayers(count: number, life: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    life,
    delta: 0,
  }));
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const deltaTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const info = FORMATS.find((f) => f.id === format)!;
    deltaTimers.current.forEach((t) => clearTimeout(t));
    deltaTimers.current.clear();
    setPlayers(makePlayers(info.playerCount, info.startingLife));
    setMenuOpen(false);
    setDiceResult(null);
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
    setPlayers((prev) => [...prev, { id: newId, life: info.startingLife, delta: 0 }]);
    setMenuOpen(false);
  }

  function removePlayer() {
    if (players.length <= 1) return;
    setPlayers((prev) => prev.slice(0, -1));
    setMenuOpen(false);
  }

  function restart() {
    const info = FORMATS.find((f) => f.id === format)!;
    deltaTimers.current.forEach((t) => clearTimeout(t));
    deltaTimers.current.clear();
    setPlayers(makePlayers(info.playerCount, info.startingLife));
    setMenuOpen(false);
  }

  function rollDice(sides: number, count = 1) {
    const rolls = Array.from(
      { length: count },
      () => Math.floor(Math.random() * sides) + 1
    );
    setDiceResult({
      label: count > 1 ? `${count}d${sides}` : `d${sides}`,
      total: rolls.reduce((a, b) => a + b, 0),
      rolls: count > 1 ? rolls : undefined,
    });
    setMenuOpen(false);
  }

  const useGrid = players.length >= 3;
  const isCommander = format === "commander";

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
    { label: "🎲  Roll d20", action: () => rollDice(20) },
    { label: "🎲  Roll d6", action: () => rollDice(6) },
    { label: "🎲  Roll 2d6", action: () => rollDice(6, 2) },
    { label: "↺  Restart Life Counter", action: restart },
    ...(onEndGame
      ? [{ label: "⚔  End Game", action: () => { setMenuOpen(false); onEndGame(); } }]
      : []),
  ];

  // ── Fullscreen layout ────────────────────────────────────────────────────────
  if (fullscreen) {
    const half = Math.ceil(displayPlayers.length / 2);
    const topRow = displayPlayers.slice(0, half);
    const bottomRow = displayPlayers.slice(half);
    const showCross = isCommander && players.length === 4;

    // Gavel button + dropdown — shared between both layout modes
    const gavelMenu = (
      <div className="relative flex items-center justify-center w-full h-full">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "w-10 h-10 rounded-xl overflow-hidden transition-all duration-200 border",
            menuOpen
              ? "border-mtg-gold/70 shadow-md shadow-black/40"
              : "border-mtg-border/60 shadow-sm shadow-black/20"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Options" className="w-full h-full object-cover" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-mtg-surface border border-mtg-border rounded-xl overflow-hidden shadow-2xl z-30"
            >
              {menuItems.map(({ label, action, disabled }) => (
                <button
                  key={label}
                  onClick={action}
                  disabled={disabled}
                  className={cn(
                    "w-full px-4 py-3.5 text-left font-display text-sm tracking-wide border-b border-mtg-border/40 last:border-0 transition-colors",
                    disabled
                      ? "text-mtg-text-muted opacity-40 cursor-not-allowed"
                      : "text-mtg-text hover:bg-mtg-gold/10 hover:text-mtg-gold active:bg-mtg-gold/20"
                  )}
                >
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );

    return (
      <div className="flex flex-col h-full">
        {showCross ? (
          // ── Cross (+) layout for 4-player Commander ──────────────────────────
          <>
            {/* Top row: P1 (left) | vertical-bar | P2 (right) */}
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0">
                <PlayerCard
                  player={{ id: topRow[0].id, life: topRow[0].life, delta: topRow[0].delta }}
                  compact
                  fullscreen
                  rotation={topRow[0].rotation}
                  onClick={(e) => handleCardClick(e, topRow[0].id, topRow[0].rotation)}
                />
              </div>
              {/* Vertical bar — top segment */}
              <div className="w-14 flex-shrink-0 bg-mtg-surface border-l border-r border-mtg-border" />
              <div className="flex-1 min-w-0">
                <PlayerCard
                  player={{ id: topRow[1].id, life: topRow[1].life, delta: topRow[1].delta }}
                  compact
                  fullscreen
                  rotation={topRow[1].rotation}
                  onClick={(e) => handleCardClick(e, topRow[1].id, topRow[1].rotation)}
                />
              </div>
            </div>

            {/* Horizontal bar: left-spacer | intersection (logo) | right-spacer */}
            <div className="flex-shrink-0 h-14 bg-mtg-surface border-t border-b border-mtg-border flex items-stretch relative z-20">
              <div className="flex-1" />
              {/* Intersection square — same w-14 as vertical bar */}
              <div className="w-14 flex-shrink-0">
                {gavelMenu}
              </div>
              <div className="flex-1" />
            </div>

            {/* Bottom row: P4 (left) | vertical-bar | P3 (right) */}
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 min-w-0">
                <PlayerCard
                  player={{ id: bottomRow[0].id, life: bottomRow[0].life, delta: bottomRow[0].delta }}
                  compact
                  fullscreen
                  rotation={bottomRow[0].rotation}
                  onClick={(e) => handleCardClick(e, bottomRow[0].id, bottomRow[0].rotation)}
                />
              </div>
              {/* Vertical bar — bottom segment */}
              <div className="w-14 flex-shrink-0 bg-mtg-surface border-l border-r border-mtg-border" />
              <div className="flex-1 min-w-0">
                <PlayerCard
                  player={{ id: bottomRow[1].id, life: bottomRow[1].life, delta: bottomRow[1].delta }}
                  compact
                  fullscreen
                  rotation={bottomRow[1].rotation}
                  onClick={(e) => handleCardClick(e, bottomRow[1].id, bottomRow[1].rotation)}
                />
              </div>
            </div>
          </>
        ) : (
          // ── Simple top/bottom layout for 2-player etc ────────────────────────
          <>
            <PlayerRow
              players={topRow}
              onCardClick={handleCardClick}
              compact={topRow.length > 1}
            />

            {/* Horizontal center bar */}
            <div className="flex-shrink-0 h-14 bg-mtg-surface border-t border-b border-mtg-border flex items-center justify-center relative z-20">
              {gavelMenu}
            </div>

            <PlayerRow
              players={bottomRow}
              onCardClick={handleCardClick}
              compact={bottomRow.length > 1}
            />
          </>
        )}

        {/* Backdrop */}
        {menuOpen && (
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
        )}

        {/* Dice modal */}
        <AnimatePresence>
          {diceResult && <DiceModal result={diceResult} onClose={() => setDiceResult(null)} />}
        </AnimatePresence>
      </div>
    );
  }

  // ── Embedded (non-fullscreen) layout ────────────────────────────────────────
  const rowCount = useGrid ? Math.ceil(displayPlayers.length / 2) : displayPlayers.length;

  return (
    <div className="relative">
      <div
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
        className={cn("grid gap-3 mb-4", useGrid ? "grid-cols-2" : "grid-cols-1")}
      >
        {displayPlayers.map(({ rotation, ...player }) => (
          <PlayerCard
            key={player.id}
            player={player}
            compact={useGrid}
            fullscreen={false}
            rotation={rotation}
            onClick={(e) => handleCardClick(e, player.id, rotation)}
          />
        ))}
      </div>

      <div className="relative z-20">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "w-full py-2.5 rounded-xl border font-display text-xs tracking-wider transition-all duration-200",
            menuOpen
              ? "border-mtg-gold bg-mtg-gold/10 text-mtg-gold"
              : "border-mtg-border bg-mtg-surface text-mtg-text-dim hover:border-mtg-border-light hover:text-mtg-text"
          )}
        >
          ☰  Options
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-1.5 bg-mtg-surface border border-mtg-border rounded-xl overflow-hidden shadow-xl"
            >
              {menuItems.map(({ label, action, disabled }) => (
                <button
                  key={label}
                  onClick={action}
                  disabled={disabled}
                  className={cn(
                    "w-full px-4 py-3 text-left font-display text-[11px] tracking-wide border-b border-mtg-border/40 last:border-0 transition-colors",
                    disabled
                      ? "text-mtg-text-muted opacity-40 cursor-not-allowed"
                      : "text-mtg-text hover:bg-mtg-gold/10 hover:text-mtg-gold active:bg-mtg-gold/20"
                  )}
                >
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
      )}

      <AnimatePresence>
        {diceResult && <DiceModal result={diceResult} onClose={() => setDiceResult(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  players: (Player & { rotation: Rotation })[];
  onCardClick: (e: React.MouseEvent<HTMLDivElement>, id: number, rotation: Rotation) => void;
  compact: boolean;
}

function PlayerRow({ players, onCardClick, compact }: PlayerRowProps) {
  if (players.length === 0) return <div className="flex-1 min-h-0 bg-mtg-bg" />;

  return (
    <div className="flex flex-1 min-h-0">
      {players.map(({ rotation, ...player }, i) => (
        <div key={player.id} className="flex-1 min-w-0 relative flex">
          {/* Vertical divider between siblings */}
          {i > 0 && (
            <div className="absolute inset-y-0 left-0 w-px bg-mtg-border/40 pointer-events-none" />
          )}
          <PlayerCard
            player={player}
            compact={compact}
            fullscreen
            rotation={rotation}
            onClick={(e) => onCardClick(e, player.id, rotation)}
          />
        </div>
      ))}
    </div>
  );
}

// ── DiceModal ─────────────────────────────────────────────────────────────────

function DiceModal({ result, onClose }: { result: DiceResult; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.88, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="bg-mtg-surface border border-mtg-gold/50 rounded-2xl px-12 py-8 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] text-mtg-text-dim font-display tracking-[0.2em] uppercase mb-3">
          {result.label}
        </div>
        <div className="text-7xl font-display font-bold text-mtg-gold leading-none">
          {result.total}
        </div>
        {result.rolls && (
          <div className="text-mtg-text-muted text-xs font-display mt-2.5">
            {result.rolls.join(" + ")}
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-6 px-6 py-1.5 rounded-lg border border-mtg-border text-mtg-text-dim font-display text-[11px] hover:text-mtg-text hover:border-mtg-border-light transition-colors"
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── PlayerCard ────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  player: Player;
  compact: boolean;
  fullscreen: boolean;
  rotation: Rotation;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function PlayerCard({ player, compact, fullscreen, rotation, onClick }: PlayerCardProps) {
  const dead = player.life <= 0;
  const isSideways = rotation === 90 || rotation === 270;
  const plusOnRight = rotation === 90;
  const plusAtBottom = rotation === 180;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden select-none cursor-pointer touch-manipulation transition-colors duration-300",
        fullscreen
          ? cn("w-full h-full min-h-0", dead ? "bg-red-950/20" : "bg-mtg-surface")
          : cn(
              "rounded-xl border",
              compact ? "h-52" : "h-36",
              dead ? "border-red-900/60 bg-red-950/20" : "border-mtg-border bg-mtg-surface"
            )
      )}
    >
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

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          style={rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : undefined}
          className="flex flex-col items-center"
        >
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
        </div>
      </div>
    </div>
  );
}
