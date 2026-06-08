import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolPillHead } from './ToolPillHead';
import { AgentMessageBody } from './AgentMessageBody';
import {
  formatToolInputForDisplay,
  formatToolOutputForDisplay,
  shouldHideToolRow,
  toolKindLabel,
} from '../wiki/agentStreamToolDisplay';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import './AgentMessage.scss';

interface Props {
  streamParts?: AssistantStreamPart[];
  fallbackText?: string;
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
  const hasIo = Boolean(step.input || step.output || step.error);
  const expandable = hasIo && (step.status !== 'running' || Boolean(step.input));

  if (!expandable) {
    return (
      <div className="agents-stream__tool-row">
        <div className="agents-stream__tool-pill-line">
          <ToolPillHead name={step.name} kind={kind} running={step.status === 'running'} />
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

export function AgentAssistantStreamBody({ streamParts, fallbackText = '' }: Props) {
  const { t } = useTranslation('agents');

  if (!streamParts?.length) {
    return <AgentMessageBody text={fallbackText} variant="assistant" />;
  }

  return (
    <div className="agents-stream__assistant" aria-label={t('stream.replyAria')}>
      {streamParts.map((part, i) => {
        if (part.type === 'text') {
          return <AgentMessageBody key={`t-${i}`} text={part.text} variant="assistant" />;
        }
        if (part.type === 'subagent') {
          return <SubagentRow key={part.step.id} part={part} />;
        }
        if (shouldHideToolRow(part.step.name)) return null;
        return (
          <ToolRow
            key={part.step.runId ? `tool-${part.step.runId}-${i}` : `tool-${i}`}
            part={part}
          />
        );
      })}
    </div>
  );
}
