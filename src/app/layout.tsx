import type { Metadata } from "next";
import { Cinzel, Spectral } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MTG: Pocket Judge — Stack Visualizer & Rules Reference",
  description:
    "Settle rules disputes at the table. Visual stack resolution, keyword glossary, card search with official rulings, and format-aware legality checking for Magic: The Gathering.",
  keywords: [
    "MTG",
    "Magic: The Gathering",
    "rules",
    "judge",
    "stack",
    "priority",
    "keywords",
    "rulings",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${spectral.variable}`}>
      <body>{children}</body>
    </html>
  );
}
