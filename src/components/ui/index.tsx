"use client";

import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const base =
      "font-display font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed";
    const variants = {
      primary: "bg-mtg-gold text-mtg-bg hover:brightness-110 active:brightness-90",
      secondary:
        "bg-mtg-surface text-mtg-text border border-mtg-border hover:border-mtg-border-light",
      ghost: "bg-transparent text-mtg-text-dim hover:text-mtg-text hover:bg-mtg-surface",
      danger: "bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30",
    };
    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// ─── Card Container ──────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  active?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, active, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-mtg-card rounded-xl border transition-all duration-200",
        active ? "border-mtg-gold" : "border-mtg-border",
        onClick && "cursor-pointer hover:border-mtg-border-light",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold",
        className
      )}
      style={{
        color: color || "#c9a961",
        background: color ? `${color}22` : "rgba(201,169,97,0.15)",
      }}
    >
      {children}
    </span>
  );
}

// ─── Section Label ───────────────────────────────────────────────────────────

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-display text-[9px] uppercase tracking-[2.5px] text-mtg-text-muted font-bold mb-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Animated container ──────────────────────────────────────────────────────

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
