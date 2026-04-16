import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
