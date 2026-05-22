"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Format } from "@/types";
import { FORMATS } from "@/data/formats";

// ─── App Header ──────────────────────────────────────────────────────────────

export function AppHeader() {
  return (
    <header className="px-5 pt-10 pb-5 bg-gradient-to-b from-mtg-surface to-mtg-bg border-b border-mtg-border">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 animate-glow -mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="MTG Pocket Judge"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="-mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/title.png"
            alt="Pocket Judge"
            className="h-9 w-auto object-contain"
          />
          <p className="text-[10px] text-mtg-text-dim font-display tracking-widest mt-0.5">
            Simulate&nbsp;&nbsp;|&nbsp;&nbsp;Track Life&nbsp;&nbsp;|&nbsp;&nbsp;Learn
          </p>
        </div>
      </div>
    </header>
  );
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface TabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-0.5 bg-mtg-surface rounded-xl p-1 border border-mtg-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 py-2.5 px-2 rounded-lg font-display text-[11px] font-medium transition-all duration-200",
            active === tab.id
              ? "bg-mtg-gold text-mtg-bg font-bold"
              : "text-mtg-text-dim hover:text-mtg-text"
          )}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Format Picker ───────────────────────────────────────────────────────────

interface FormatPickerProps {
  selected: Format;
  onSelect: (format: Format) => void;
}

export function FormatPicker({ selected, onSelect }: FormatPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FORMATS.map((f) => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={cn(
            "p-4 rounded-xl border text-center transition-all duration-200",
            selected === f.id
              ? "border-mtg-gold bg-mtg-gold/10"
              : "border-mtg-border bg-mtg-surface hover:border-mtg-border-light"
          )}
        >
          <div
            className={cn(
              "text-sm font-display font-semibold",
              selected === f.id ? "text-mtg-gold" : "text-mtg-text"
            )}
          >
            {f.label}
          </div>
          <div className="text-[10px] text-mtg-text-muted mt-0.5">
            {f.description}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Format Dropdown ─────────────────────────────────────────────────────────

interface FormatDropdownProps {
  selected: Format;
  onSelect: (format: Format) => void;
}

export function FormatDropdown({ selected, onSelect }: FormatDropdownProps) {
  const [open, setOpen] = useState(false);
  const current = FORMATS.find((f) => f.id === selected);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-mtg-border bg-mtg-surface transition-all duration-200 hover:border-mtg-border-light"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-display font-semibold text-mtg-gold">
            {current?.label}
          </span>
          <span className="text-[10px] text-mtg-text-muted">{current?.description}</span>
        </div>
        <span className={cn("text-mtg-text-dim text-xs transition-transform duration-200", open && "rotate-180")}>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-mtg-surface border border-mtg-border rounded-xl shadow-lg overflow-hidden">
          <div className="grid grid-cols-2 gap-2 p-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => { onSelect(f.id); setOpen(false); }}
                className={cn(
                  "p-3 rounded-lg border text-center transition-all duration-200",
                  selected === f.id
                    ? "border-mtg-gold bg-mtg-gold/10"
                    : "border-mtg-border bg-mtg-bg hover:border-mtg-border-light"
                )}
              >
                <div className={cn("text-xs font-display font-semibold", selected === f.id ? "text-mtg-gold" : "text-mtg-text")}>
                  {f.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
