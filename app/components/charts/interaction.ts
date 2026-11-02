/** Shared chart hooks: measured width and keyboard/hover active index. */

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Rendered width of a container, so SVG text stays at its real size at
 * every width. `fallback` is used for SSR and the first paint.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Which mark is highlighted; arrow keys, Home/End and Escape move it. */
export function useActiveIndex(count: number) {
  const [active, setActive] = useState<number | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    const last = count - 1;
    const moves: Record<string, (a: number | null) => number | null> = {
      ArrowRight: (a) => (a === null ? 0 : Math.min(last, a + 1)),
      ArrowDown: (a) => (a === null ? 0 : Math.min(last, a + 1)),
      ArrowLeft: (a) => (a === null ? last : Math.max(0, a - 1)),
      ArrowUp: (a) => (a === null ? last : Math.max(0, a - 1)),
      Home: () => 0,
      End: () => last,
      Escape: () => null,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setActive(move);
  };

  return {
    active,
    setActive,
    containerProps: {
      tabIndex: 0,
      onKeyDown,
      onBlur: () => setActive(null),
      onMouseLeave: () => setActive(null),
    },
  };
}
