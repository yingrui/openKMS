import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Copy, RefreshCw } from 'lucide-react';
import { AgentAssistantStreamBody } from './AgentAssistantStreamBody';
import { PERSISTED_AGENT_MESSAGE_ID } from './agentConstants';
import { AgentInterruptBar } from './AgentInterruptBar';
import { AgentPlanPanel } from './AgentPlanPanel';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import './AgentsWorkspace.scss';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streamParts?: AssistantStreamPart[];
  id?: string;
  created_at?: string;
}

interface Props {
  sessionTitle: string | null;
  messages: ChatMessage[];
  loading: boolean;
  planMode: boolean;
  onPlanModeChange: (v: boolean) => void;
  onSend: (text: string) => void;
  todos?: unknown[];
  todoRevision?: number;
  onDismissPlan?: () => void;
  interruptSummary?: string | null;
  interruptBusy?: boolean;
  onInterruptApprove?: () => void;
  onInterruptReject?: () => void;
  prefillInput?: string | null;
  onPrefillApplied?: () => void;
  onRevertUserMessage?: (msg: ChatMessage) => void;
  reverting?: boolean;
  hasMoreOlder?: boolean;
  onLoadOlderMessages?: () => Promise<boolean>;
}

/** Deferred content wrapper: only renders children when scrolled within rootMargin px of viewport. */
function LazyContent({ children, rootMargin = 400 }: { children: React.ReactNode; rootMargin?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: `${rootMargin}px 0px ${rootMargin}px 0px` },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref}>
      {visible ? children : <div style={{ minHeight: 60 }} aria-hidden />}
    </div>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  onRevertUserMessage?: (msg: ChatMessage) => void;
  reverting: boolean;
  loading: boolean;
  tRevertTitle: string;
  tRevertAria: string;
}

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MessageRow = memo(function MessageRow({
  message,
  onRevertUserMessage,
  reverting,
  loading,
  tRevertTitle,
  tRevertAria,
}: MessageRowProps) {
  const time = formatTime(message.created_at);

  if (message.role === 'user') {
    const showRevert = onRevertUserMessage && message.id && PERSISTED_AGENT_MESSAGE_ID.test(message.id);
    return (
      <div className="agents-chat-msg agents-chat-msg--user">
        <div className="agents-chat-msg-user-col">
          <div className="agents-chat-msg-body">{message.content}</div>
          {(showRevert || time) ? (
            <div className="agents-chat-msg-meta">
              {time ? <span className="agents-chat-msg-time">{time}</span> : null}
              {showRevert ? (
                <button
                  type="button"
                  className="agents-chat-revert-btn"
                  onClick={() => onRevertUserMessage!(message)}
                  disabled={loading || reverting}
                  title={tRevertTitle}
                  aria-label={tRevertAria}
                >
                  <RefreshCw size={13} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="agents-chat-msg agents-chat-msg--assistant">
      <div className="agents-chat-msg-body">
        <AgentAssistantStreamBody
          streamParts={message.streamParts}
          fallbackText={message.content}
        />
      </div>
      {time ? (
        <div className="agents-chat-msg-meta">
          <button
            type="button"
            className="agents-chat-copy-btn"
            title="Copy message"
            onClick={() => {
              void navigator.clipboard.writeText(message.content);
            }}
          >
            <Copy size={13} strokeWidth={2} aria-hidden />
          </button>
          <span className="agents-chat-msg-time">{time}</span>
        </div>
      ) : null}
    </div>
  );
});

export function AgentChatMain({
  sessionTitle,
  messages,
  loading,
  planMode,
  onPlanModeChange,
  onSend,
  todos,
  todoRevision,
  onDismissPlan,
  interruptSummary,
  interruptBusy = false,
  onInterruptApprove,
  onInterruptReject,
  prefillInput,
  onPrefillApplied,
  onRevertUserMessage,
  reverting = false,
  hasMoreOlder = false,
  onLoadOlderMessages,
}: Props) {
  const { t } = useTranslation('agents');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingScrollRestoreRef = useRef(0);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    if (prefillInput == null) return;
    setInput(prefillInput);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
    onPrefillApplied?.();
  }, [prefillInput, onPrefillApplied]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pendingScrollRestoreRef.current > 0) {
      el.scrollTop = el.scrollHeight - pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = 0;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingOlder || !hasMoreOlder || !onLoadOlderMessages) return;
    if (el.scrollTop > 80) return;
    setLoadingOlder(true);
    const prevHeight = el.scrollHeight;
    pendingScrollRestoreRef.current = prevHeight;
    onLoadOlderMessages().finally(() => setLoadingOlder(false));
  }, [hasMoreOlder, loadingOlder, onLoadOlderMessages]);

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
          <h1 title={sessionTitle}>{sessionTitle}</h1>
        </header>
      ) : null}
      {todos && todos.length > 0 ? (
        <AgentPlanPanel
          todos={todos}
          loading={loading}
          revision={todoRevision}
          onDismiss={onDismissPlan}
        />
      ) : null}
      <div className="agents-chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <p className="agents-chat-empty">{t('chat.hero')}</p>
        ) : (
          messages.map((m) => (
            <LazyContent key={m.id}>
              <MessageRow
                message={m}
                onRevertUserMessage={onRevertUserMessage}
                reverting={reverting}
                loading={loading}
                tRevertTitle={t('chat.revertTitle')}
                tRevertAria={t('chat.revertAria')}
              />
            </LazyContent>
          ))
        )}
        {loading ? <div className="agents-chat-typing">{t('chat.thinking')}</div> : null}
      </div>
      {interruptSummary && onInterruptApprove && onInterruptReject ? (
        <AgentInterruptBar
          summary={interruptSummary}
          busy={interruptBusy}
          onApprove={onInterruptApprove}
          onReject={onInterruptReject}
        />
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
