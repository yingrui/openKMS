import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Undo and redo are the browser's own history.
 *
 * The exploration keeps everything that decides what it shows in the URL (conditions, charts, columns, sort,
 * comparison), so a URL entry *is* an exploration state — the back button already undoes one, and a private stack
 * would be a second history that disagrees with it.
 *
 * "Can go back" is readable from the history state React Router keeps. "Can go forward" is not, so it counts the
 * undos made here: something is ahead exactly when this page stepped back. A Back pressed in the browser's own chrome
 * is not counted — its Forward button is the honest control for that case.
 */
export function useBrowserHistory(): {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
} {
  const navigate = useNavigate();
  const [ahead, setAhead] = useState(0);
  const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;

  const undo = useCallback(() => {
    setAhead((count) => count + 1);
    navigate(-1);
  }, [navigate]);

  const redo = useCallback(() => {
    setAhead((count) => Math.max(0, count - 1));
    navigate(1);
  }, [navigate]);

  return { canUndo: index > 0, canRedo: ahead > 0, undo, redo };
}
