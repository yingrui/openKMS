import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Settings, Trash2 } from 'lucide-react';
import type { AgentConversationResponse } from '../../data/agentApi';
import './AgentsWorkspace.scss';

function label(c: AgentConversationResponse): string {
  if (c.title?.trim()) return c.title.trim();
  return new Date(c.updated_at).toLocaleDateString();
}

interface Props {
  projectName: string;
  projectSlug: string;
  conversations: AgentConversationResponse[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onDelete?: () => void;
}

export function AgentSessionSidebar({
  projectName,
  projectSlug,
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onOpenSettings,
  onDelete,
}: Props) {
  const { t } = useTranslation('agents');

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [conversations],
  );

  return (
    <aside className="agents-sessions">
      <div className="agents-sessions-head">
        <Link to="/agents" className="agents-sessions-back">
          <ArrowLeft size={14} />
          {t('sessions.back')}
        </Link>
        <div className="agents-sessions-project">{projectName}</div>
        <div className="agents-sessions-sub">{projectSlug}</div>
        <div className="agents-sessions-head-actions">
          <button type="button" className="agents-sessions-new" onClick={onNewChat}>
            <Plus size={15} strokeWidth={2} />
            {t('sessions.newChat')}
          </button>
          <button
            type="button"
            className="agents-sessions-settings"
            onClick={onOpenSettings}
            title={t('settings.title')}
            aria-label={t('settings.title')}
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="agents-sessions-scroll">
        {sorted.map((c) => (
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
      {activeId && onDelete ? (
        <div className="agents-sessions-foot">
          <button type="button" className="agents-sessions-delete" onClick={onDelete}>
            <Trash2 size={13} />
            {t('sessions.delete')}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
