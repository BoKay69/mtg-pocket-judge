import { NextRequest, NextResponse } from "next/server";

const SCRYFALL_BASE = "https://api.scryfall.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("cardId");

  if (!cardId) {
    return NextResponse.json(
      { error: "Missing query parameter 'cardId'" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${SCRYFALL_BASE}/cards/${cardId}/rulings`, {
      headers: { "User-Agent": "MTGPocketJudge/1.0" },
      next: { revalidate: 3600 }, // Cache rulings for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch rulings" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ rulings: data.data });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch rulings" },
      { status: 500 }
    );
  }
}
