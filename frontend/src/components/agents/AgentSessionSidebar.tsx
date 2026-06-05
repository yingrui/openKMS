import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import type { AgentConversationResponse } from '../../data/agentApi';
import './AgentsWorkspace.scss';

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function label(c: AgentConversationResponse): string {
  if (c.title?.trim()) return c.title.trim();
  return new Date(c.updated_at).toLocaleDateString();
}

interface Props {
  projectName: string;
  conversations: AgentConversationResponse[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete?: () => void;
}

export function AgentSessionSidebar({
  projectName,
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: Props) {
  const { t } = useTranslation('agents');
  const groups = useMemo(() => {
    const m = new Map<string, AgentConversationResponse[]>();
    for (const c of conversations) {
      const k = monthKey(c.updated_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [conversations]);

  return (
    <aside className="agents-sessions">
      <div className="agents-sessions-head">
        <Link to="/agents" className="agents-sessions-back">
          <ArrowLeft size={14} />
          {t('sessions.back')}
        </Link>
        <strong>{projectName}</strong>
        <button type="button" className="btn btn-sm btn-primary" onClick={onNewChat}>
          <Plus size={14} /> {t('sessions.newChat')}
        </button>
      </div>
      <div className="agents-sessions-scroll">
        {groups.map(([month, items]) => (
          <div key={month}>
            <div style={{ padding: '6px 14px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{month}</div>
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`agents-session-item${activeId === c.id ? ' agents-session-item--active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                {label(c)}
              </button>
            ))}
          </div>
        ))}
      </div>
      {activeId && onDelete ? (
        <div style={{ padding: 10, borderTop: '1px solid var(--color-border)' }}>
          <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
            {t('sessions.delete')}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
