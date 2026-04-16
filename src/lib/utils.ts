import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ─── Mana Parsing ────────────────────────────────────────────────────────────

const MANA_SYMBOLS: Record<string, string> = {
  W: "☀",
  U: "💧",
  B: "💀",
  R: "🔥",
  G: "🌿",
  C: "◇",
};

export function parseManaSymbols(manaCost: string): string[] {
  const matches = manaCost.match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.replace(/[{}]/g, ""));
}

export function manaToEmoji(symbol: string): string {
  return MANA_SYMBOLS[symbol] || symbol;
}

// ─── Color Mapping ───────────────────────────────────────────────────────────

export const MANA_COLORS: Record<string, string> = {
  W: "#f9faf4",
  U: "#0e68ab",
  B: "#2b2a2a",
  R: "#d3202a",
  G: "#00733e",
  C: "#c4c1b8",
};

export const STACK_TYPE_COLORS: Record<string, string> = {
  instant: "#3b82f6",
  sorcery: "#8b5cf6",
  creature: "#22c55e",
  triggered: "#f59e0b",
  activated: "#ec4899",
  static: "#6b7280",
  phase: "#737373",
};

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Debounce ────────────────────────────────────────────────────────────────

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
