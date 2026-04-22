import { useCallback, useState } from 'react';
import { Bot, Send } from 'lucide-react';
import './WikiSpaceAgentPanel.css';

type ChatRole = 'user' | 'assistant';

type ChatLine = { id: string; role: ChatRole; text: string };

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type WikiSpaceAgentPanelProps = {
  spaceId: string;
  spaceName: string | null;
};

/**
 * Design prototype: wiki assistant shell (wiki-skills-style workflows planned on backend).
 * Chat is local only until `/api/agent` exists.
 */
export function WikiSpaceAgentPanel({ spaceId, spaceName }: WikiSpaceAgentPanelProps) {
  const [lines, setLines] = useState<ChatLine[]>(() => [
    {
      id: 'intro',
      role: 'assistant',
      text:
        'This panel previews the wiki assistant. When the backend agent is connected, you can ask to outline pages, refine a note, or work from linked channel documents. Workflows align with the wiki-skills pattern (init / ingest / query / lint / update).',
    },
  ]);
  const [draft, setDraft] = useState('');

  const send = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    setLines((prev) => [
      ...prev,
      { id: lineId(), role: 'user', text: t },
      {
        id: lineId(),
        role: 'assistant',
        text:
          'Design prototype: there is no agent API on the server yet. After implementation, this will call the embedded LangGraph agent in the openKMS backend (separate service from the qa-agent KB RAG stack).',
      },
    ]);
  }, [draft]);

  return (
    <aside className="wiki-space-agent-panel" aria-label="Wiki assistant (prototype)">
      <div className="wiki-space-agent-panel__head">
        <Bot size={20} className="wiki-space-agent-panel__head-icon" aria-hidden />
        <div>
          <h2 className="wiki-space-agent-panel__title">Wiki assistant</h2>
          <p className="wiki-space-agent-panel__sub">Prototype UI · space {spaceName ?? spaceId}</p>
        </div>
      </div>
      <p className="wiki-space-agent-panel__banner">
        UI-only prototype — backend conversation and LangGraph agent are not wired yet.
      </p>
      <div className="wiki-space-agent-panel__thread" role="log" aria-live="polite">
        {lines.map((m) => (
          <div
            key={m.id}
            className={`wiki-space-agent-panel__msg wiki-space-agent-panel__msg--${m.role}`}
          >
            <span className="wiki-space-agent-panel__msg-label">{m.role === 'user' ? 'You' : 'Assistant'}</span>
            <p className="wiki-space-agent-panel__msg-text">{m.text}</p>
          </div>
        ))}
      </div>
      <div className="wiki-space-agent-panel__composer">
        <label htmlFor="wiki-agent-draft" className="wiki-space-agent-panel__sr-only">
          Message
        </label>
        <textarea
          id="wiki-agent-draft"
          className="wiki-space-agent-panel__input"
          rows={3}
          placeholder="Ask about this wiki (prototype)…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="wiki-space-agent-panel__composer-footer">
          <p className="wiki-space-agent-panel__composer-hint">
            <kbd className="wiki-space-agent-panel__kbd">Enter</kbd> to send ·{' '}
            <kbd className="wiki-space-agent-panel__kbd">Shift</kbd>+<kbd className="wiki-space-agent-panel__kbd">Enter</kbd>{' '}
            new line
          </p>
          <button
            type="button"
            className="btn btn-primary wiki-space-agent-panel__send"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
          >
            <Send size={18} strokeWidth={2} aria-hidden />
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
