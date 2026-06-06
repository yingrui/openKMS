import { ChevronRight, Code2, Terminal, type LucideIcon } from 'lucide-react';
import { toolUsesCodeIcon } from '../wiki/agentStreamToolDisplay';

interface Props {
  name: string;
  kind: string;
  running?: boolean;
  expandable?: boolean;
  icon?: LucideIcon;
}

export function ToolPillHead({ name, kind, running, expandable, icon }: Props) {
  const Icon = icon ?? (toolUsesCodeIcon(name) ? Code2 : Terminal);

  return (
    <>
      <Icon
        size={12}
        strokeWidth={2}
        className="wiki-space-agent-panel__tool-pill-ico"
        aria-hidden
      />
      <span className="wiki-space-agent-panel__tool-pill-kind">{kind}</span>
      {running ? <span className="wiki-space-agent-panel__tool-pill-running">…</span> : null}
      {expandable ? (
        <ChevronRight
          size={12}
          strokeWidth={2}
          className="wiki-space-agent-panel__tool-pill-chevron"
          aria-hidden
        />
      ) : null}
    </>
  );
}
