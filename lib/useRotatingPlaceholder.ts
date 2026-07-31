import { useEffect, useRef, useState } from "react";

// Fisher-Yates — gives every item an equal, unbiased chance of any position,
// so the rotation order is genuinely random each time (not just "shuffled
// once and always the same shuffle").
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Cuts to the nearest whole word so a long item doesn't just get chopped
// mid-word when it's shown somewhere with limited width (e.g. a single-line
// input placeholder, which never wraps and would otherwise clip silently).
function truncate(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + "\u2026";
}

// Cycles through `items` in a freshly randomized order, advancing one at a
// time on `intervalMs`. Pauses entirely while `active` is false — e.g. once
// the field has real content, rotating the placeholder underneath it would
// be pointless (placeholders don't show over typed text) and wasteful.
// Reshuffles and restarts once every item in the current pass has been
// shown, so it never repeats a topic back-to-back and never falls into a
// fixed cycle a user could predict. Pass `maxLength` to truncate long items
// (with a trailing ellipsis) so they never overflow a single-line field.
export function useRotatingPlaceholder(
  items: string[],
  intervalMs: number = 3200,
  active: boolean = true,
  maxLength?: number
): string {
  const orderRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const [current, setCurrent] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;
    orderRef.current = shuffle(items);
    indexRef.current = 0;
    setCurrent(orderRef.current[0]);
  }, [items]);

  useEffect(() => {
    if (!active || items.length === 0) return;
    const id = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= orderRef.current.length) {
        orderRef.current = shuffle(items);
        indexRef.current = 0;
      }
      setCurrent(orderRef.current[indexRef.current]);
    }, intervalMs);
    return () => clearInterval(id);
  }, [items, intervalMs, active]);

  return truncate(current, maxLength);
}

