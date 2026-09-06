import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Bot,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Minus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { askQuestionStream, type SearchResult } from '../../data/knowledgeBasesApi';
import { AgentMessageBody } from '../../components/agents/AgentMessageBody';
import './AgentAssistantDock.scss';

/** Credit knowledge base (qa-agent w/ guarantee-ring / exposure / penetration skills). */
const CREDIT_KB_ID = 'cb389d44-5207-420a-9757-c7cbe4f3e17b';

/** Quick-prompt chips shown above the thread (i18n keys). */
const QUICK_KEYS = ['chip_1', 'chip_2', 'chip_3', 'chip_4'] as const;

type ToolLine = { runId: string; name: string; detail: string; status: 'running' | 'done' | 'error' };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolLine[];
  sources: SearchResult[];
  error: string | null;
  streaming: boolean;
};

/** Pull a short human label out of a tool-call input JSON for the streaming tool row. */
function toolDetail(input: string): string {
  if (!input) return '';
  try {
    const o = JSON.parse(input) as Record<string, unknown>;
    for (const k of ['question', 'query', 'cypher', 'path', 'pattern', 'command', 'description', 'prompt']) {
      const v = o[k];
      if (typeof v === 'string' && v) return v.slice(0, 90);
    }
    const first = Object.values(o).find((v) => typeof v === 'string' && v);
    return first ? String(first).slice(0, 90) : '';
  } catch {
    return input.slice(0, 90);
  }
}

let msgSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${msgSeq++}`;

/**
 * Floating, draggable "AI credit assistant" chat dock. Collapsed it's a pill button in the
 * bottom-right; expanded it's a conversational window backed by the credit KB's streaming
 * Q&A (askQuestionStream) — showing the agent's tool calls (graph queries / exposure maths)
 * and grounded sources, without interrupting the page body.
 */
export function AgentAssistantDock() {
  const { t } = useTranslation('workflow');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // --- dragging (header handle) ---
  const onDragMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const w = panelRef.current?.offsetWidth ?? 420;
    const h = panelRef.current?.offsetHeight ?? 400;
    let x = e.clientX - dragRef.current.dx;
    let y = e.clientY - dragRef.current.dy;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    setPos({ x, y });
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  }, [onDragMove]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      setPos({ x: rect.left, y: rect.top });
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      e.preventDefault();
    },
    [onDragMove, onDragEnd]
  );

  // keep the thread pinned to the latest message
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // cancel any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      setInput('');

      // conversation_history from completed turns (skip the streaming placeholder / errored replies)
      const history = messages
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.text && !m.error))
        .map((m) => ({ role: m.role, content: m.text }));

      const userMsg: ChatMessage = {
        id: nextId('u'),
        role: 'user',
        text: question,
        tools: [],
        sources: [],
        error: null,
        streaming: false,
      };
      const asstId = nextId('a');
      const asstMsg: ChatMessage = {
        id: asstId,
        role: 'assistant',
        text: '',
        tools: [],
        sources: [],
        error: null,
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, asstMsg]);
      setBusy(true);

      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === asstId ? fn(m) : m)));

      const ac = new AbortController();
      abortRef.current = ac;

      askQuestionStream(
        CREDIT_KB_ID,
        { question, conversation_history: history },
        (ev) => {
          switch (ev.type) {
            case 'delta':
              patch((m) => ({ ...m, text: m.text + ev.t }));
              break;
            case 'tool_start':
              patch((m) => ({
                ...m,
                tools: [
                  ...m.tools,
                  { runId: ev.run_id, name: ev.name, detail: toolDetail(ev.input), status: 'running' },
                ],
              }));
              break;
            case 'tool_end':
              patch((m) => ({
                ...m,
                tools: m.tools.map((tl) => (tl.runId === ev.run_id ? { ...tl, status: 'done' } : tl)),
              }));
              break;
            case 'tool_error':
              patch((m) => ({
                ...m,
                tools: m.tools.map((tl) => (tl.runId === ev.run_id ? { ...tl, status: 'error' } : tl)),
              }));
              break;
            case 'done':
              patch((m) => ({ ...m, text: ev.answer || m.text, sources: ev.sources, streaming: false }));
              break;
            case 'error':
              patch((m) => ({ ...m, error: ev.detail, text: ev.answer ?? m.text, streaming: false }));
              break;
            default:
              break;
          }
        },
        { signal: ac.signal }
      )
        .then(() => patch((m) => ({ ...m, streaming: false })))
        .catch((e) => {
          if (ac.signal.aborted) return;
          const msg = e instanceof Error ? e.message : t('chatError');
          patch((m) => ({ ...m, error: msg, streaming: false }));
        })
        .finally(() => {
          setBusy(false);
          abortRef.current = null;
        });
    },
    [messages, busy, t]
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      send(input);
    }
  };

  const closeDock = () => {
    abortRef.current?.abort();
    setOpen(false);
    setPos(null);
    setMessages([]);
    setBusy(false);
  };

  if (!open) {
    return (
      <button type="button" className="agent-dock__fab" onClick={() => setOpen(true)} aria-label={t('dockTitle')}>
        <Sparkles size={18} aria-hidden />
        <span className="agent-dock__fab-label">{t('dockTitle')}</span>
      </button>
    );
  }

  const panelStyle = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;

  return (
    <div
      className="agent-dock__panel agent-dock__panel--chat"
      ref={panelRef}
      style={panelStyle}
      role="dialog"
      aria-label={t('dockTitle')}
    >
      <div className="agent-dock__header" onPointerDown={onHeaderPointerDown}>
        <div className="agent-dock__header-title">
          <Bot size={16} aria-hidden />
          <span>{t('dockTitle')}</span>
        </div>
        <div className="agent-dock__header-actions">
          <button
            type="button"
            className="agent-dock__header-btn"
            onClick={() => setOpen(false)}
            aria-label={t('dockMinimize')}
            title={t('dockMinimize')}
          >
            <Minus size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="agent-dock__header-btn"
            onClick={closeDock}
            aria-label={t('dockClose')}
            title={t('dockClose')}
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>

      {/* quick-prompt chips */}
      <div className="agent-dock__chips">
        {QUICK_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="agent-dock__chip"
            disabled={busy}
            onClick={() => send(t(k))}
            title={t(k)}
          >
            {t(k)}
          </button>
        ))}
      </div>

      {/* message thread */}
      <div className="agent-dock__thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="agent-dock__greeting">
            <Sparkles size={16} aria-hidden />
            <p>{t('chatGreeting')}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`agent-dock__msg agent-dock__msg--${m.role}`}>
              {m.role === 'user' ? (
                <div className="agent-dock__bubble agent-dock__bubble--user">{m.text}</div>
              ) : (
                <div className="agent-dock__bubble agent-dock__bubble--assistant">
                  {m.tools.length > 0 && (
                    <div className="agent-dock__tools">
                      {m.tools.map((tl, i) => (
                        <span
                          key={`${tl.runId}-${i}`}
                          className={`agent-dock__tool agent-dock__tool--${tl.status}`}
                        >
                          {tl.status === 'running' ? (
                            <Loader2 size={11} className="agent-dock__spinner" aria-hidden />
                          ) : tl.status === 'error' ? (
                            <X size={11} aria-hidden />
                          ) : (
                            <Check size={11} aria-hidden />
                          )}
                          <span className="agent-dock__tool-name">{tl.name}</span>
                          {tl.detail && <span className="agent-dock__tool-detail">{tl.detail}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text ? (
                    <AgentMessageBody text={m.text} variant="assistant" />
                  ) : m.streaming && !m.error ? (
                    <div className="agent-dock__thinking">
                      <Loader2 size={14} className="agent-dock__spinner" aria-hidden />
                      <span>{t('chatThinking')}</span>
                    </div>
                  ) : null}
                  {m.sources.length > 0 && (
                    <div className="agent-dock__sources">
                      <span className="agent-dock__sources-title">{t('chatSources')}</span>
                      {m.sources.slice(0, 6).map((s, i) => {
                        const label = s.source_name || s.document_id || `#${i + 1}`;
                        const href = s.document_id ? `/documents/view/${s.document_id}` : null;
                        return href ? (
                          <a
                            key={`${s.id}-${i}`}
                            className="agent-dock__source agent-dock__source--link"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText size={11} aria-hidden />
                            <span>{label}</span>
                            <ExternalLink size={10} aria-hidden />
                          </a>
                        ) : (
                          <span key={`${s.id}-${i}`} className="agent-dock__source">
                            <FileText size={11} aria-hidden />
                            <span>{label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {m.error && (
                    <div className="agent-dock__error">
                      <AlertTriangle size={13} aria-hidden />
                      {m.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* composer */}
      <div className="agent-dock__composer">
        <textarea
          className="agent-dock__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          placeholder={t('chatPlaceholder')}
          rows={1}
        />
        <button
          type="button"
          className="agent-dock__send"
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label={t('chatSend')}
          title={t('chatSend')}
        >
          {busy ? <Loader2 size={16} className="agent-dock__spinner" aria-hidden /> : <Send size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
