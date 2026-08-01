// Turns a player's display name into a URL-safe handle, e.g.
// "Samarth K." -> "samarth-k". Used so a signed-in player's own profile
// can live at eztren.xyz/<their-name> instead of eztren.xyz/join.
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
