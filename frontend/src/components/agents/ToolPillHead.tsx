import { ChevronRight, Code2, Terminal, type LucideIcon } from 'lucide-react';
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
}

export function ToolPillHead({ name, kind, running, expandable, icon, detail, error }: Props) {
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
