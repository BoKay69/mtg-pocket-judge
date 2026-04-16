import { NextRequest, NextResponse } from "next/server";

const SCRYFALL_BASE = "https://api.scryfall.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const format = searchParams.get("format");
  const page = searchParams.get("page") || "1";

  if (!q) {
    return NextResponse.json(
      { error: "Missing query parameter 'q'" },
      { status: 400 }
    );
  }

  try {
    let query = q;
    if (format) {
      query += ` legal:${format}`;
    }

    const params = new URLSearchParams({
      q: query,
      order: "name",
      page,
    });

    const res = await fetch(`${SCRYFALL_BASE}/cards/search?${params}`, {
      headers: { "User-Agent": "MTGPocketJudge/1.0" },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ details: "Unknown error" }));
      return NextResponse.json(
        { error: error.details || "Scryfall search failed" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      cards: data.data,
      total: data.total_cards,
      hasMore: data.has_more,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}
