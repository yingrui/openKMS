import { ChevronRight, Code2, Terminal, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toolUsesCodeIcon } from './agentStreamToolDisplay';

interface Props {
  name: string;
  kind: string;
  running?: boolean;
  expandable?: boolean;
  icon?: LucideIcon;
  detail?: string;
  /** Why it failed. Shown on the row: "it went red" is not a reason a reader can act on. */
  error?: string;
  /** When the call started. Used for one thing: a call that is still running long enough to worry about. */
  startedAt?: number;
}

/** How long a call may run before the row says so: silence only reads as "hung" after this. */
const SLOW_CALL_SECONDS = 10;

/**
 * "still running 24s", and nothing before ten seconds.
 *
 * A counter from the first millisecond is noise while the answer is still streaming; a `…` that never changes after a
 * minute reads as a hang. This is the middle: quiet until the wait is long enough that the reader wonders.
 */
function RunningTime({ startedAt }: { startedAt: number }) {
  const { t } = useTranslation('agents');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  if (seconds < SLOW_CALL_SECONDS) {
    return <span className="agents-stream__tool-pill-running">…</span>;
  }
  return (
    <span className="agents-stream__tool-pill-slow">
      {t('stream.toolStillRunning', { seconds })}
    </span>
  );
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
}: Props) {
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
      {running ? (startedAt ? <RunningTime startedAt={startedAt} /> : <span className="agents-stream__tool-pill-running">…</span>) : null}
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
