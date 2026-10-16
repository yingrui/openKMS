import { useEffect, useRef, useState } from 'react';

/**
 * Which section of a long page the reader is in — for a table of contents that follows along.
 *
 * The rule is deliberately simple and pure (`pickActive`): among the sections inside the reading zone
 * (the top ~40% of the scrolling pane), the **first in document order** is the current one; when
 * nothing is in the zone (between two sections, or at the very bottom), the previous one stays — a
 * highlight that blinks off while scrolling is worse than one that lags for a moment.
 */

/** The current section, from the ids currently in the zone and the document's order. */
export function pickActive(
  intersecting: string[],
  order: string[],
  previous: string | null,
): string | null {
  if (intersecting.length === 0) return previous;
  return order.find((id) => intersecting.includes(id)) ?? previous;
}

/**
 * Observe the given element ids and report the active one.
 *
 * `IntersectionObserver` is not in every environment (jsdom, older browsers): without it this returns
 * `null` and the caller simply shows no highlight, which is the honest degradation.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  /** Kept in a ref so the effect does not re-subscribe on every highlight change. */
  const previous = useRef<string | null>(null);
  /* The caller derives `ids` on every render; a primitive key keeps the observer from being rebuilt. */
  const key = ids.join('\n');
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    const current = idsRef.current;
    if (current.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const elements = current
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const inside = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) inside.add(id);
          else inside.delete(id);
        }
        const next = pickActive([...inside], idsRef.current, previous.current);
        previous.current = next;
        setActive(next);
      },
      {
        // Only the top of the pane counts as "being read"; the rest is still approaching.
        root: document.querySelector('.entity-view__main'),
        rootMargin: '0px 0px -60% 0px',
        threshold: 0,
      },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);

  return active;
}
