import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Copy, Paperclip, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { AgentAssistantStreamBody } from './AgentAssistantStreamBody';
import { PERSISTED_AGENT_MESSAGE_ID } from './agentConstants';
import { AgentInterruptBar } from './AgentInterruptBar';
import { AgentPlanPanel } from './AgentPlanPanel';
import type { AgentAttachment } from '../../data/agentApi';
import type { AssistantStreamPart } from '../wiki/wikiCopilotStreamParts';
import './AgentsWorkspace.scss';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streamParts?: AssistantStreamPart[];
  id?: string;
  created_at?: string;
  attachments?: AgentAttachment[];
}

interface Props {
  sessionTitle: string | null;
  messages: ChatMessage[];
  loading: boolean;
  planMode: boolean;
  onPlanModeChange: (v: boolean) => void;
  onSend: (text: string, attachments: AgentAttachment[]) => void;
  /** Uploads an image for the current session; returns the staged attachment. */
  onUploadAttachment?: (file: File) => Promise<AgentAttachment>;
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
  loadingOlder?: boolean;
  onLoadOlderMessages?: () => Promise<boolean>;
  /** When true, omit the in-pane session title (parent chrome shows it). */
  hideSessionHeader?: boolean;
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
  collapseTools: boolean;
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
  collapseTools,
  tRevertTitle,
  tRevertAria,
}: MessageRowProps) {
  const time = formatTime(message.created_at);

  if (message.role === 'user') {
    const showRevert = onRevertUserMessage && message.id && PERSISTED_AGENT_MESSAGE_ID.test(message.id);
    return (
      <div className="agents-chat-msg agents-chat-msg--user">
        <div className="agents-chat-msg-user-col">
          {message.attachments?.length ? (
            <div className="agents-chat-msg-attachments">
              {message.attachments.map((a) =>
                a.url ? (
                  <a
                    key={a.id}
                    className="agents-chat-msg-attachment"
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    title={a.name}
                  >
                    <img src={a.url} alt={a.name} loading="lazy" />
                  </a>
                ) : null,
              )}
            </div>
          ) : null}
          {message.content ? <div className="agents-chat-msg-body">{message.content}</div> : null}
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
          collapseTools={collapseTools}
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
  onUploadAttachment,
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
  loadingOlder = false,
  onLoadOlderMessages,
  hideSessionHeader = false,
}: Props) {
  const { t } = useTranslation('agents');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<AgentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingScrollRestoreRef = useRef(0);

  const addFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      if (!onUploadAttachment || loading) return;
      const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!images.length) return;
      setUploading(true);
      try {
        for (const file of images) {
          try {
            const att = await onUploadAttachment(file);
            setPending((prev) => [...prev, att]);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('chat.attachFailed'));
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [loading, onUploadAttachment, t],
  );

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
    // User scrolled up into history — don't yank them to the bottom on poll/merge.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 120) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingOlder || !hasMoreOlder || !onLoadOlderMessages) return;
    if (el.scrollTop > 80) return;
    const prevHeight = el.scrollHeight;
    pendingScrollRestoreRef.current = prevHeight;
    void onLoadOlderMessages();
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
    if (uploading || loading || (!text && !pending.length)) return;
    const attachments = pending;
    setInput('');
    setPending([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(text, attachments);
  };

  return (
    <main className="agents-chat-main">
      {!hideSessionHeader && sessionTitle ? (
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
          messages.map((m, idx) => {
            const isLiveAssistant =
              loading && m.role === 'assistant' && idx === messages.length - 1;
            return (
              <LazyContent key={m.id}>
                <MessageRow
                  message={m}
                  onRevertUserMessage={onRevertUserMessage}
                  reverting={reverting}
                  loading={loading}
                  collapseTools={!isLiveAssistant}
                  tRevertTitle={t('chat.revertTitle')}
                  tRevertAria={t('chat.revertAria')}
                />
              </LazyContent>
            );
          })
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
      <div
        className={`agents-composer-wrap${dragActive ? ' is-drag-active' : ''}`}
        onDragOver={(e) => {
          if (!onUploadAttachment || loading) return;
          if (!Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={(e) => {
          if (!onUploadAttachment || loading) return;
          e.preventDefault();
          setDragActive(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <form className="agents-composer-inner" onSubmit={submit}>
          {pending.length ? (
            <div className="agents-composer-attachments">
              {pending.map((a) => (
                <span className="agents-composer-attachment" key={a.id}>
                  {a.url ? <img src={a.url} alt={a.name} /> : null}
                  <button
                    type="button"
                    className="agents-composer-attachment-remove"
                    onClick={() => setPending((prev) => prev.filter((p) => p.id !== a.id))}
                    aria-label={t('chat.attachRemove')}
                    title={t('chat.attachRemove')}
                  >
                    <X size={11} strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="agents-composer-box">
            {onUploadAttachment ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="agents-composer-attach"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || uploading}
                  title={t('chat.attach')}
                  aria-label={t('chat.attach')}
                >
                  <Paperclip size={15} strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : null}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              onPaste={(e) => {
                if (!onUploadAttachment) return;
                const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
                if (!files.length) return;
                e.preventDefault();
                void addFiles(files);
              }}
              placeholder={pending.length ? '' : t('chat.placeholder')}
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
              disabled={loading || uploading || (!input.trim() && !pending.length)}
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
            {uploading ? <span className="agents-composer-hint">{t('chat.attaching')}</span> : null}
          </div>
        </form>
      </div>
    </main>
  );
}
