import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Settings, Trash2 } from 'lucide-react';
import type { AgentConversationResponse } from '../../data/agentApi';
import { projectWorkspacePath } from '../../data/projectsApi';
import './AgentsWorkspace.scss';

function label(c: AgentConversationResponse): string {
  if (c.title?.trim()) return c.title.trim();
  return new Date(c.updated_at).toLocaleDateString();
}

interface Props {
  projectId: string;
  projectName: string;
  projectSlug: string;
  conversations: AgentConversationResponse[];
  activeId: string | null;
  onNewChat: () => void;
  onDelete?: (sessionId: string) => void;
}

export function AgentSessionSidebar({
  projectId,
  projectName,
  projectSlug,
  conversations,
  activeId,
  onNewChat,
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
          <Link
            to={`/projects/${projectId}/settings`}
            className="agents-sessions-settings"
            title={t('settings.title')}
            aria-label={t('settings.title')}
          >
            <Settings size={16} strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      <div className="agents-sessions-scroll">
        {sorted.map((c) => (
          <div
            key={c.id}
            className={`agents-session-row${activeId === c.id ? ' agents-session-row--active' : ''}`}
          >
            <Link
              to={projectWorkspacePath(projectId, c.id)}
              className="agents-session-item"
            >
              {label(c)}
            </Link>
            {onDelete ? (
              <button
                type="button"
                className="agents-session-delete"
                aria-label={t('sessions.delete')}
                title={t('sessions.delete')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void onDelete(c.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
