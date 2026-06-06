import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolPillHead } from './ToolPillHead';
import {
  formatToolInputForDisplay,
  formatToolOutputForDisplay,
  shouldHideToolRow,
  toolCommandHint,
  toolDetailFromInput,
  toolKindLabel,
  toolShowsCommandHint,
} from '../wiki/agentStreamToolDisplay';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import { WikiAgentMessageBody } from '../wiki/WikiAgentMessageBody';

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
    <div className="wiki-space-agent-panel__tool-io">
      {displayInput ? (
        <pre className="wiki-space-agent-panel__tool-pre">{displayInput}</pre>
      ) : null}
      {displayOutput ? (
        <pre className="wiki-space-agent-panel__tool-pre">{displayOutput}</pre>
      ) : null}
      {error ? (
        <pre className="wiki-space-agent-panel__tool-pre wiki-space-agent-panel__tool-pre--err">
          {error}
        </pre>
      ) : null}
    </div>
  );
}

function ToolRow({ part }: { part: Extract<AssistantStreamPart, { type: 'tool' }> }) {
  const { step } = part;
  const kind = toolKindLabel(step.name);
  const detail = toolDetailFromInput(step.name, step.input);
  const hint = toolShowsCommandHint(step.name) ? toolCommandHint(step.name, step.input) : undefined;
  const hasIo = Boolean(step.input || step.output || step.error);
  const expandable = hasIo && (step.status !== 'running' || Boolean(step.input));

  if (!expandable) {
    return (
      <div className="wiki-space-agent-panel__tool-row">
        <div className="wiki-space-agent-panel__tool-pill-line">
          <ToolPillHead
            name={step.name}
            kind={kind}
            detail={detail}
            hint={hint}
            running={step.status === 'running'}
          />
        </div>
      </div>
    );
  }

  return (
    <details className="wiki-space-agent-panel__tool-row wiki-space-agent-panel__tool-row--expand">
      <summary className="wiki-space-agent-panel__tool-pill-line">
        <ToolPillHead
          name={step.name}
          kind={kind}
          detail={detail}
          hint={hint}
          running={step.status === 'running'}
          expandable
        />
      </summary>
      <ToolIoBlock name={step.name} input={step.input} output={step.output} error={step.error} />
    </details>
  );
}

function SubagentRow({ part }: { part: Extract<AssistantStreamPart, { type: 'subagent' }> }) {
  const { t } = useTranslation('wikiSpace');
  const { step } = part;

  return (
    <div className="wiki-space-agent-panel__tool-row wiki-space-agent-panel__tool-row--subagent">
      <div className="wiki-space-agent-panel__tool-pill-line">
        <Bot
          size={12}
          strokeWidth={2}
          className="wiki-space-agent-panel__tool-pill-ico"
          aria-hidden
        />
        <span className="wiki-space-agent-panel__tool-pill-kind">{t('copilot.subagentLabel')}</span>
        <span className="wiki-space-agent-panel__tool-pill-detail" title={step.label}>
          {step.label}
        </span>
        {step.status === 'running' ? (
          <span className="wiki-space-agent-panel__tool-pill-running">…</span>
        ) : null}
      </div>
    </div>
  );
}

export function AgentAssistantStreamBody({ streamParts, fallbackText = '' }: Props) {
  const { t } = useTranslation('wikiSpace');

  if (!streamParts?.length) {
    return <WikiAgentMessageBody text={fallbackText} variant="assistant" />;
  }

  return (
    <div className="wiki-space-agent-panel__assistant-stream" aria-label={t('copilot.replyAria')}>
      {streamParts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <WikiAgentMessageBody key={`t-${i}`} text={part.text} variant="assistant" />
          );
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
