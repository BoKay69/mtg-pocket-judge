import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Core palette — aged parchment meets dark arcana
        mtg: {
          bg: "#0a0a0c",
          surface: "#141418",
          "surface-hover": "#1c1c22",
          card: "#18181e",
          border: "#2a2a35",
          "border-light": "#3a3a48",
          text: "#e8e6e3",
          "text-dim": "#8a8894",
          "text-muted": "#5a5868",
          gold: "#c9a961",
          "gold-dim": "#a08540",
        },
        // Mana colors
        mana: {
          white: "#f9faf4",
          blue: "#0e68ab",
          black: "#2b2a2a",
          red: "#d3202a",
          green: "#00733e",
          colorless: "#c4c1b8",
        },
      },
      fontFamily: {
        display: ["Crimson Text", "Georgia", "serif"],
        body: ["Crimson Text", "Georgia", "serif"],
      },
      animation: {
        "slide-in": "slideIn 0.3s ease forwards",
        "fade-in": "fadeIn 0.3s ease forwards",
        "fade-up": "fadeUp 0.4s ease forwards",
        "stack-pop": "stackPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        slideIn: {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        stackPop: {
          from: { opacity: "0", transform: "scale(0.95) translateY(-4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        glow: {
          from: { boxShadow: "0 0 8px rgba(201, 169, 97, 0.2)" },
          to: { boxShadow: "0 0 20px rgba(201, 169, 97, 0.4)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
