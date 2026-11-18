import { useEffect, useRef, useState } from 'react';

/**
 * Which section of a long page the reader is in — for a table of contents that follows along.
 *
 * Two rules, both learned from the same complaint ("the menu is on the wrong item"):
 *
 * 1. **The zone is a line, not a band.** It used to be the top 40% of the pane, and because a short
 *    section plus the *start* of the next one both fit in 40%, clicking "Knowledge" highlighted "Data and
 *    ontology" — the following section was already inside the zone. The zone is now the thin strip under
 *    the pane's top edge: the section the reader is actually looking at.
 * 2. **The last section needs the bottom of the pane.** Scrolled to the end, a short final section never
 *    reaches the top edge, so nothing would ever light it up — clicking it left the highlight on its
 *    neighbour. At the end of the scroll, the last section is the one being read.
 *
 * When nothing is in the zone (between two sections) the previous one stays: a highlight that blinks off
 * mid-scroll is worse than one that lags a moment.
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
 * `pickActive`, plus the two places the intersection zone cannot speak for itself:
 *
 * * **at the end** — a short final section never reaches the top edge, so it would never light up;
 * * **at the start** — the page opens on its header, where no section is being read yet, and keeping the
 *   previous highlight there leaves the menu pointing at something the reader left behind.
 */
export function pickActiveSection({
  intersecting,
  order,
  previous,
  scrollTop,
  atEnd,
}: {
  intersecting: string[];
  order: string[];
  previous: string | null;
  scrollTop: number;
  atEnd: boolean;
}): string | null {
  if (atEnd && order.length > 0) return order[order.length - 1];
  if (scrollTop <= 2) return null;
  return pickActive(intersecting, order, previous);
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

    const root = document.querySelector<HTMLElement>('.entity-view__main');
    const inside = new Set<string>();

    /* Recomputed from the observer *and* from scrolling. The observer alone is not enough: it reports
       changes, and the two cases this rule exists for (the very top, the very end) end with the same
       sections intersecting as before — no change, no callback, a highlight left on the neighbour. */
    const recompute = () => {
      const atEnd = root
        ? root.scrollHeight > root.clientHeight + 4 &&
          root.scrollTop + root.clientHeight >= root.scrollHeight - 8
        : false;
      const next = pickActiveSection({
        intersecting: [...inside],
        order: current,
        previous: previous.current,
        scrollTop: root ? root.scrollTop : 0,
        atEnd,
      });
      if (next === previous.current) return;
      previous.current = next;
      setActive(next);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) inside.add(id);
          else inside.delete(id);
        }
        recompute();
      },
      {
        // Only the strip just under the pane's top edge counts as "being read"; the rest is still
        // approaching. A wider band lit the *next* section as soon as a short one was scrolled to.
        root,
        rootMargin: '0px 0px -92% 0px',
        threshold: 0,
      },
    );
    elements.forEach((element) => observer.observe(element));

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recompute();
      });
    };
    root?.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      root?.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);

  return {
    active,
    markActive: (id: string) => {
      previous.current = id;
      setActive(id);
    },
  };
}
