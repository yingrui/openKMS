/** Pure helpers + the prop type shared by the agent files panel and its hook. */

export const TREE_MIN_PX = 160;
export const TREE_MAX_PX = 480;
export const TREE_DEFAULT_PX = 240;
export const VIEWER_MIN_PX = 160;
export const VIEWER_DEFAULT_PX = 480;
export const INNER_HANDLE_PX = 8;
export const TREE_WIDTH_KEY = 'openkms_agents_files_tree_width_px_v1';
export const VIEWER_WIDTH_KEY = 'openkms_agents_files_viewer_width_px_v1';

export const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  if (abs < 31_536_000_000) return rtf.format(Math.round(diff / 2_592_000_000), 'month');
  return rtf.format(Math.round(diff / 31_536_000_000), 'year');
}

export function readTreeWidth(): number {
  try {
    const raw = localStorage.getItem(TREE_WIDTH_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return TREE_DEFAULT_PX;
}

export function readViewerWidth(): number {
  try {
    const raw = localStorage.getItem(VIEWER_WIDTH_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return VIEWER_DEFAULT_PX;
}

export function clampTreeWidth(w: number, totalRailPx: number, viewerWidthPx: number): number {
  const max = Math.max(TREE_MIN_PX, totalRailPx - viewerWidthPx - INNER_HANDLE_PX);
  return Math.round(Math.min(Math.min(TREE_MAX_PX, max), Math.max(TREE_MIN_PX, w)));
}

export function parentPath(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm) return '';
  const i = norm.lastIndexOf('/');
  return i === -1 ? '' : norm.slice(0, i);
}

export function isPathUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Block delete for openKMS-managed dirs only; files under them (e.g. legacy config.json) may be removed. */
export function isProtectedProjectPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return norm === '.openkms' || norm === '.openkms/skills';
}


export interface AgentFilesPanelProps {
  projectId: string;
  gitInitialized: boolean;
  railWidthPx: number;
  onRailWidthChange?: (width: number) => void;
  onGitChange?: () => void;
  /** Desktop side rail vs mobile bottom sheet (no fixed flex widths / resize). */
  variant?: 'rail' | 'sheet';
  onCloseSheet?: () => void;
}
