import { useCallback, useEffect, useRef, useState } from 'react';
import { pushSnapshot, sameSnapshot, type Snapshot } from './explorationHistory';

/**
 * Undo and redo for what an exploration *is*: its conditions, its charts, its columns.
 *
 * Every click on a chart narrows the set and every edit changes the layout, and until now neither could be taken
 * back — the only cure was to reload and start again. The snapshot is the URL plus the two pieces of state the URL
 * does not carry, so an undo restores exactly what was on screen.
 */
export function useExplorationHistory({
  snapshot,
  apply,
}: {
  snapshot: Snapshot;
  apply: (next: Snapshot) => void;
}) {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const last = useRef<Snapshot>(snapshot);
  const restoring = useRef(false);
  /* The stacks live in refs (they are history, not display), but the buttons need their depth — and reading a ref
     during render is not allowed, so the depth is mirrored into state whenever the stacks change. */
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const sync = () => setDepth({ past: past.current.length, future: future.current.length });

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false;
      last.current = snapshot;
      return;
    }
    if (sameSnapshot(last.current, snapshot)) return;
    past.current = pushSnapshot(past.current, last.current);
    future.current = [];
    last.current = snapshot;
    sync();
  }, [snapshot]);

  const step = useCallback(
    (from: React.RefObject<Snapshot[]>, to: React.RefObject<Snapshot[]>) => {
      const target = from.current.pop();
      if (!target) return;
      to.current = [...to.current, last.current];
      restoring.current = true;
      last.current = target;
      apply(target);
      sync();
    },
    [apply]
  );

  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  /* The shortcut people already know, except where they are typing. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, undo]);

  return {
    undo,
    redo,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
