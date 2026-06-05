import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send } from 'lucide-react';
import { WikiAgentMessageBody } from '../wiki/WikiAgentMessageBody';
import { AgentInterruptBar } from './AgentInterruptBar';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import '../wiki/WikiSpaceAgentPanel.scss';
import './AgentsWorkspace.scss';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streamParts?: AssistantStreamPart[];
  id?: string;
}

interface Props {
  projectName: string;
  messages: ChatMessage[];
  loading: boolean;
  planMode: boolean;
  onPlanModeChange: (v: boolean) => void;
  onSend: (text: string) => void;
  todos?: unknown[];
  interruptSummary?: string | null;
  onInterruptApprove?: () => void;
  onInterruptReject?: () => void;
}

export function AgentChatMain({
  projectName,
  messages,
  loading,
  planMode,
  onPlanModeChange,
  onSend,
  todos,
  interruptSummary,
  onInterruptApprove,
  onInterruptReject,
}: Props) {
  const { t } = useTranslation('agents');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    onSend(text);
  };

  return (
    <main className="agents-chat-main">
      {todos && todos.length > 0 ? (
        <div className="agents-todos">
          <strong>{t('chat.todos')}</strong>
          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(todos, null, 2)}</pre>
        </div>
      ) : null}
      <div className="agents-chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--color-text-muted)' }}>
            <Sparkles size={32} style={{ marginBottom: 12 }} />
            <h2>{projectName}</h2>
            <p>{t('chat.hero')}</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id ?? i} className={`kb-qa-msg kb-qa-msg--${m.role}`}>
              <WikiAgentMessageBody text={m.content} variant={m.role} />
              {m.streamParts?.map((p, j) =>
                p.type === 'tool' ? (
                  <div key={j} className="wiki-space-agent-panel__tool-pill">
                    <span>{p.step.name}</span>
                    <span>{p.step.status}</span>
                  </div>
                ) : null,
              )}
            </div>
          ))
        )}
        {loading ? <div className="kb-qa-typing">{t('chat.thinking')}</div> : null}
      </div>
      {interruptSummary && onInterruptApprove && onInterruptReject ? (
        <AgentInterruptBar summary={interruptSummary} onApprove={onInterruptApprove} onReject={onInterruptReject} />
      ) : null}
      <form className="agents-composer" onSubmit={submit}>
        <label className="agents-plan-toggle">
          <input type="checkbox" checked={planMode} onChange={(e) => onPlanModeChange(e.target.checked)} />
          {t('chat.planMode')}
        </label>
        <div className="agents-composer-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </form>
    </main>
  );
}
