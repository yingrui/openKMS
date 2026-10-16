import { useEffect, useRef, useState } from 'react';

/**
 * Which section of a long page the reader is in — for a table of contents that follows along.
 *
 * The rule is pure (`pickActive`), and the subtle half is *which end* to take: the sections are tall,
 * so several sit inside the reading zone (the top ~40% of the pane) at once, and the reader is in the
 * **last** of them — the one scrolled furthest into. Taking the first (which this did) leaves the
 * highlight parked on the opening section for most of the page, which reads as "it never moves".
 *
 * When nothing is in the zone (between two sections, or past the last one) the previous one stays: a
 * highlight that blinks off mid-scroll is worse than one that lags a moment.
 */

/** Ids cannot contain it, so it is a safe way to carry a list through a primitive dependency. */
const SEPARATOR = '\u0000';

/** The current section: the one furthest down among those in the zone. */
export function pickActive(
  intersecting: string[],
  order: string[],
  previous: string | null,
): string | null {
  const inZone = order.filter((id) => intersecting.includes(id));
  return inZone.length > 0 ? inZone[inZone.length - 1] : previous;
}

/**
 * Observe the given element ids and report the active one.
 *
 * `IntersectionObserver` is not in every environment (jsdom, older browsers): without it this returns
 * `null` and the caller simply shows no highlight, which is the honest degradation.
 */
export function useActiveSection(ids: string[]): {
  active: string | null;
  /** Set it directly, so a click moves the highlight at once instead of during the scroll. */
  markActive: (id: string) => void;
} {
  const [active, setActive] = useState<string | null>(null);
  /** Kept in a ref so the effect does not re-subscribe on every highlight change. */
  const previous = useRef<string | null>(null);
  /* The caller derives `ids` on every render, so the effect keys off a primitive instead of the
     array identity — and reads the ids back out of that key, which keeps refs out of render. */
  const key = ids.join(SEPARATOR);

  useEffect(() => {
    const current = key ? key.split(SEPARATOR) : [];
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
        const next = pickActive([...inside], current, previous.current);
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

  return {
    active,
    markActive: (id: string) => {
      previous.current = id;
      setActive(id);
    },
  };
}
