import { memo, useMemo, type ReactNode } from 'react';
import { Bot, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolPillHead } from './ToolPillHead';
import { AgentMessageBody } from './AgentMessageBody';
import {
  formatToolInputForDisplay,
  formatToolOutputForDisplay,
  shouldHideToolRow,
  toolDetailLabel,
  toolKindLabel,
} from '../wiki/agentStreamToolDisplay';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import './AgentMessage.scss';

const MIN_TOOLS_TO_FOLD = 2;

interface Props {
  streamParts?: AssistantStreamPart[];
  fallbackText?: string;
  /** When true, fold consecutive tool/subagent rows (completed turns). */
  collapseTools?: boolean;
}

type VisiblePart =
  | { kind: 'text'; part: Extract<AssistantStreamPart, { type: 'text' }>; key: string }
  | { kind: 'tool'; part: Extract<AssistantStreamPart, { type: 'tool' }>; key: string }
  | { kind: 'subagent'; part: Extract<AssistantStreamPart, { type: 'subagent' }>; key: string };

type Segment =
  | { type: 'text'; item: Extract<VisiblePart, { kind: 'text' }> }
  | { type: 'tools'; items: Extract<VisiblePart, { kind: 'tool' | 'subagent' }>[] };

function visibleParts(streamParts: AssistantStreamPart[]): VisiblePart[] {
  const out: VisiblePart[] = [];
  streamParts.forEach((part, i) => {
    if (part.type === 'text') {
      out.push({ kind: 'text', part, key: `t-${i}` });
      return;
    }
    if (part.type === 'subagent') {
      out.push({ kind: 'subagent', part, key: part.step.id });
      return;
    }
    if (shouldHideToolRow(part.step.name)) return;
    out.push({
      kind: 'tool',
      part,
      key: part.step.runId ? `tool-${part.step.runId}-${i}` : `tool-${i}`,
    });
  });
  return out;
}

function segmentVisibleParts(parts: VisiblePart[]): Segment[] {
  const segments: Segment[] = [];
  for (const item of parts) {
    if (item.kind === 'text') {
      segments.push({ type: 'text', item });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.type === 'tools') {
      last.items.push(item);
    } else {
      segments.push({ type: 'tools', items: [item] });
    }
  }
  return segments;
}

function ToolIoBlock({
  name,
  input,
  output,
  error,
}: {
  name: string;
  input?: string;
  output?: string;
  error?: string;
}) {
  const displayInput = formatToolInputForDisplay(name, input);
  const displayOutput = formatToolOutputForDisplay(name, output);

  return (
    <div className="agents-stream__tool-io">
      {displayInput ? <pre className="agents-stream__tool-pre">{displayInput}</pre> : null}
      {displayOutput ? <pre className="agents-stream__tool-pre">{displayOutput}</pre> : null}
      {error ? (
        <pre className="agents-stream__tool-pre agents-stream__tool-pre--err">{error}</pre>
      ) : null}
    </div>
  );
}

function ToolRow({ part }: { part: Extract<AssistantStreamPart, { type: 'tool' }> }) {
  const { step } = part;
  const kind = toolKindLabel(step.name);
  const detail = toolDetailLabel(step.name, step.input);
  const hasIo = Boolean(step.input || step.output || step.error);
  const expandable = hasIo && (step.status !== 'running' || Boolean(step.input));

  if (!expandable) {
    return (
      <div className="agents-stream__tool-row">
        <div className="agents-stream__tool-pill-line">
          <ToolPillHead name={step.name} kind={kind} running={step.status === 'running'} detail={detail} />
        </div>
      </div>
    );
  }

  return (
    <details className="agents-stream__tool-row agents-stream__tool-row--expand">
      <summary className="agents-stream__tool-pill-line">
        <ToolPillHead
          name={step.name}
          kind={kind}
          running={step.status === 'running'}
          expandable
          detail={detail}
        />
      </summary>
      <ToolIoBlock name={step.name} input={step.input} output={step.output} error={step.error} />
    </details>
  );
}

function SubagentRow({ part }: { part: Extract<AssistantStreamPart, { type: 'subagent' }> }) {
  const { t } = useTranslation('agents');
  const { step } = part;

  return (
    <div className="agents-stream__tool-row agents-stream__tool-row--subagent">
      <div className="agents-stream__tool-pill-line">
        <Bot size={12} strokeWidth={2} className="agents-stream__tool-pill-ico" aria-hidden />
        <span className="agents-stream__tool-pill-kind">{t('stream.subagentLabel')}</span>
        <span className="agents-stream__tool-pill-detail" title={step.label}>
          {step.label}
        </span>
        {step.status === 'running' ? (
          <span className="agents-stream__tool-pill-running">…</span>
        ) : null}
      </div>
    </div>
  );
}

function renderToolish(item: Extract<VisiblePart, { kind: 'tool' | 'subagent' }>): ReactNode {
  if (item.kind === 'subagent') {
    return <SubagentRow key={item.key} part={item.part} />;
  }
  return <ToolRow key={item.key} part={item.part} />;
}

function ToolsFold({ items }: { items: Extract<VisiblePart, { kind: 'tool' | 'subagent' }>[] }) {
  const { t } = useTranslation('agents');
  if (items.length < MIN_TOOLS_TO_FOLD) {
    return <>{items.map(renderToolish)}</>;
  }
  return (
    <details className="agents-stream__tools-fold">
      <summary className="agents-stream__tools-fold-summary">
        <ChevronRight size={14} strokeWidth={2} className="agents-stream__tools-fold-chevron" aria-hidden />
        <span>{t('stream.toolsFold', { count: items.length })}</span>
      </summary>
      <div className="agents-stream__tools-fold-body">{items.map(renderToolish)}</div>
    </details>
  );
}

export const AgentAssistantStreamBody = memo(function AgentAssistantStreamBody({
  streamParts,
  fallbackText = '',
  collapseTools = false,
}: Props) {
  const { t } = useTranslation('agents');
  const segments = useMemo(() => {
    if (!streamParts?.length) return null;
    return segmentVisibleParts(visibleParts(streamParts));
  }, [streamParts]);

  if (!segments) {
    return <AgentMessageBody text={fallbackText} variant="assistant" />;
  }

  return (
    <div className="agents-stream__assistant" aria-label={t('stream.replyAria')}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <AgentMessageBody key={seg.item.key} text={seg.item.part.text} variant="assistant" />;
        }
        if (collapseTools) {
          return <ToolsFold key={`tools-${i}`} items={seg.items} />;
        }
        return <div key={`tools-${i}`}>{seg.items.map(renderToolish)}</div>;
      })}
    </div>
  );
});
