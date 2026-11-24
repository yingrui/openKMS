import { ChevronRight, Code2, Terminal, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toolUsesCodeIcon } from '../wiki/agentStreamToolDisplay';

interface Props {
  name: string;
  kind: string;
  running?: boolean;
  expandable?: boolean;
  icon?: LucideIcon;
  detail?: string;
  /** Why it failed. Shown on the row: "it went red" is not a reason a reader can act on. */
  error?: string;
  /** When the call started, so the row can count up while it runs instead of a number appearing at the end. */
  startedAt?: number;
  /** How long it took, once it finished. */
  durationMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

export function ToolPillHead({
  name,
  kind,
  running,
  expandable,
  icon,
  detail,
  error,
  startedAt,
  durationMs,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const elapsed = running && startedAt ? now - startedAt : durationMs;
  const Icon = icon ?? (toolUsesCodeIcon(name) ? Code2 : Terminal);

  return (
    <>
      <Icon size={12} strokeWidth={2} className="agents-stream__tool-pill-ico" aria-hidden />
      <span className="agents-stream__tool-pill-kind">{kind}</span>
      {detail ? (
        <span className="agents-stream__tool-pill-detail" title={detail}>{detail}</span>
      ) : null}
      {error ? (
        <span className="agents-stream__tool-pill-error" title={error}>
          {error.length > 70 ? `${error.slice(0, 69)}…` : error}
        </span>
      ) : null}
      {elapsed !== undefined ? (
        <span className="agents-stream__tool-pill-time">{formatDuration(elapsed)}</span>
      ) : null}
      {running ? <span className="agents-stream__tool-pill-running">…</span> : null}
      {expandable ? (
        <ChevronRight
          size={12}
          strokeWidth={2}
          className="agents-stream__tool-pill-chevron"
          aria-hidden
        />
      ) : null}
    </>
  );
}
