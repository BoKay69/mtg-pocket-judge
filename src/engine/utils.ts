let counter = 0;

export function generateId(): string {
  counter++;
  return `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getOpponent(player: "player_a" | "player_b"): "player_a" | "player_b" {
  return player === "player_a" ? "player_b" : "player_a";
}
