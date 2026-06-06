import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';
import { AgentAssistantStreamBody } from './AgentAssistantStreamBody';
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
  sessionTitle: string | null;
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
  sessionTitle,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(text);
  };

  return (
    <main className="agents-chat-main">
      {sessionTitle ? (
        <header className="agents-chat-header">
          <h1>{sessionTitle}</h1>
        </header>
      ) : null}
      {todos && todos.length > 0 ? (
        <div className="agents-todos">
          <strong>{t('chat.todos')}</strong>
          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(todos, null, 2)}</pre>
        </div>
      ) : null}
      <div className="agents-chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="agents-chat-empty">{t('chat.hero')}</p>
        ) : (
          messages.map((m, i) => (
            <div key={m.id ?? i} className={`agents-chat-msg agents-chat-msg--${m.role}`}>
              <div className="agents-chat-msg-body">
                {m.role === 'assistant' ? (
                  <AgentAssistantStreamBody
                    streamParts={m.streamParts}
                    fallbackText={m.content}
                  />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}
        {loading ? <div className="agents-chat-typing">{t('chat.thinking')}</div> : null}
      </div>
      {interruptSummary && onInterruptApprove && onInterruptReject ? (
        <AgentInterruptBar summary={interruptSummary} onApprove={onInterruptApprove} onReject={onInterruptReject} />
      ) : null}
      <div className="agents-composer-wrap">
        <form className="agents-composer-inner" onSubmit={submit}>
          <div className="agents-composer-box">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              placeholder={t('chat.placeholder')}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
                    return;
                  }
                  e.preventDefault();
                  submit(e);
                }
              }}
            />
            <button
              type="submit"
              className="agents-composer-send"
              disabled={loading || !input.trim()}
              aria-label={t('chat.send')}
            >
              <ArrowUp size={16} strokeWidth={2.25} />
            </button>
          </div>
          <div className="agents-composer-meta">
            <label className="agents-plan-toggle">
              <input type="checkbox" checked={planMode} onChange={(e) => onPlanModeChange(e.target.checked)} />
              {t('chat.planMode')}
            </label>
          </div>
        </form>
      </div>
    </main>
  );
}
