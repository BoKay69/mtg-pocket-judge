"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { STACK_SCENARIOS, SCENARIO_CATEGORIES } from "@/data/scenarios";
import type { StackScenario } from "@/types";
import { Button, Badge, SectionLabel, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function StackVisualizer() {
  const [scenario, setScenario] = useState<StackScenario>(STACK_SCENARIOS[0]);
  const [phase, setPhase] = useState<"stack" | "resolving">("stack");
  const [resolveStep, setResolveStep] = useState(0);

  const resetScenario = (s: StackScenario) => {
    setScenario(s);
    setPhase("stack");
    setResolveStep(0);
  };

  const handleResolve = () => {
    if (phase === "stack") {
      setPhase("resolving");
      setResolveStep(0);
    } else if (resolveStep < scenario.resolution.length - 1) {
      setResolveStep((p) => p + 1);
    }
  };

  const canAdvance =
    phase === "stack" || resolveStep < scenario.resolution.length - 1;

  return (
    <div>
      {/* Scenario picker */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {STACK_SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => resetScenario(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-display font-semibold border transition-all duration-200",
              scenario.id === s.id
                ? "border-mtg-gold bg-mtg-gold/10 text-mtg-gold"
                : "border-mtg-border bg-mtg-surface text-mtg-text-dim hover:border-mtg-border-light"
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <p className="text-sm text-mtg-text-dim italic mb-4">
        {scenario.description}
      </p>

      {/* Stack visualization */}
      <div className="relative mb-5">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-mtg-gold/30 to-transparent" />

        <SectionLabel className="pl-9">
          {phase === "stack" ? "The Stack (Top → Bottom)" : "Resolution"}
        </SectionLabel>

        <AnimatePresence mode="wait">
          {phase === "stack" ? (
            <motion.div
              key="stack"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[...scenario.steps].reverse().map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-3 mb-2 pl-9 relative"
                >
                  {/* Timeline dot */}
                  <div
                    className="absolute left-2.5 w-3 h-3 rounded-full border-2 border-mtg-bg"
                    style={{
                      background: s.color,
                      boxShadow: `0 0 8px ${s.color}66`,
                    }}
                  />

                  <Card className="flex-1 !p-3 flex justify-between items-center">
                    <div>
                      <div className="text-sm font-bold font-display text-mtg-text">
                        {s.card}
                      </div>
                      <div className="text-[11px] text-mtg-text-muted mt-0.5">
                        {s.owner} ·{" "}
                        <span style={{ color: s.color }}>{s.type}</span> ·
                        Target: {s.target}
                      </div>
                    </div>
                    {i === 0 && <Badge>Resolves Next</Badge>}
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="resolving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {scenario.resolution.map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{
                    opacity: i <= resolveStep ? 1 : 0.25,
                    x: 0,
                  }}
                  transition={{ delay: i === resolveStep ? 0.1 : 0 }}
                  className="pl-9 mb-2.5 relative"
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute left-2.5 w-3 h-3 rounded-full border-2 border-mtg-bg transition-colors duration-300",
                      i <= resolveStep ? "bg-green-500" : "bg-mtg-border"
                    )}
                  />

                  <Card
                    className={cn(
                      "!p-3 transition-colors duration-300",
                      i === resolveStep && "!border-mtg-gold"
                    )}
                  >
                    <div className="text-[10px] text-mtg-text-muted font-bold mb-1">
                      Step {r.step}
                    </div>
                    <div className="text-[13px] text-mtg-text leading-relaxed">
                      {r.text}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          onClick={handleResolve}
          disabled={!canAdvance}
          className="flex-1"
        >
          {phase === "stack"
            ? "▶ Resolve Stack"
            : resolveStep < scenario.resolution.length - 1
              ? "Next Step →"
              : "✓ Complete"}
        </Button>
        <Button variant="secondary" onClick={() => resetScenario(scenario)}>
          ↺ Reset
        </Button>
      </div>
    </div>
  );
}
