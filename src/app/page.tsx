"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppHeader, TabBar, FormatPicker } from "@/components/layout";
import {
  StackSimulator,
} from "@/components/stack";
import { KeywordDictionary } from "@/components/glossary";
import { CardSearch } from "@/components/glossary/CardSearch";
import { SectionLabel } from "@/components/ui";
import type { Format } from "@/types";

const TABS = [
  { id: "simulator", label: "Simulator", icon: "⚖" },
  { id: "glossary", label: "Glossary", icon: "📖" },
  { id: "search", label: "Search", icon: "🔍" },
];

export default function HomePage() {
  const [format, setFormat] = useState<Format>("modern");
  const [activeTab, setActiveTab] = useState("simulator");

  return (
    <div className="min-h-screen bg-mtg-bg">
      <AppHeader />

      <main className="px-4 pb-24 max-w-xl mx-auto">
        {/* Format Picker */}
        <section className="mt-4 mb-5">
          <SectionLabel>Format</SectionLabel>
          <FormatPicker selected={format} onSelect={setFormat} />
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
      </main>
    </div>
  );
}
