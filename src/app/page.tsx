"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppHeader, TabBar, FormatPicker, FormatDropdown } from "@/components/layout";
import { StackSimulator } from "@/components/stack";
import { KeywordDictionary } from "@/components/glossary";
import { CardSearch } from "@/components/glossary/CardSearch";
import { LifeCounter } from "@/components/life";
import { SectionLabel } from "@/components/ui";
import type { Format } from "@/types";

const TABS = [
  { id: "simulator", label: "Simulator", iconSrc: "/icons/robot.svg" },
  { id: "glossary", label: "Glossary", iconSrc: "/icons/book.svg" },
  { id: "search", label: "Search", iconSrc: "/icons/glass.svg" },
  { id: "life", label: "Life", iconSrc: "/icons/heart.svg" },
];

export default function HomePage() {
  const [format, setFormat] = useState<Format>("modern");
  const [formatChosen, setFormatChosen] = useState(false);
  const [activeTab, setActiveTab] = useState("simulator");

  function handleFormatSelect(f: Format) {
    setFormat(f);
    setFormatChosen(true);
    setActiveTab("simulator");
  }

  function handleEndGame() {
    setActiveTab("simulator");
  }

  // Life tab takes over the full screen
  if (formatChosen && activeTab === "life") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="life-fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-mtg-bg z-50 flex flex-col"
        >
          <LifeCounter format={format} onEndGame={handleEndGame} fullscreen />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="min-h-screen bg-mtg-bg">
      <AppHeader />

      <AnimatePresence mode="wait">
        {!formatChosen ? (
          <motion.main
            key="format-picker"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="px-4 pt-6 pb-24 max-w-xl mx-auto"
          >
            <div className="mb-6 text-center">
              <h2 className="font-display text-lg font-bold text-mtg-gold tracking-wide">
                Choose Your Format
              </h2>
              <p className="text-xs text-mtg-text-dim mt-1">
                Select a format to get started
              </p>
            </div>
            <FormatPicker selected={format} onSelect={handleFormatSelect} />
          </motion.main>
        ) : (
          <motion.main
            key="app"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="px-4 pb-24 max-w-xl mx-auto"
          >
            {/* Format Dropdown */}
            <section className="mt-4 mb-3">
              <FormatDropdown selected={format} onSelect={setFormat} />
            </section>

            {/* Tab Navigation */}
            <section className="mb-5">
              <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
            </section>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.section
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "simulator" && <StackSimulator format={format} />}

                {activeTab === "glossary" && (
                  <>
                    <SectionLabel>Keyword Dictionary</SectionLabel>
                    <KeywordDictionary />
                  </>
                )}

                {activeTab === "search" && (
                  <>
                    <SectionLabel>Card Search & Rulings</SectionLabel>
                    <CardSearch format={format} />
                  </>
                )}
              </motion.section>
            </AnimatePresence>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}
