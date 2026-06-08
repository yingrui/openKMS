import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Plus, Settings, Sparkles, Trash2 } from 'lucide-react';
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
  onRename?: (sessionId: string, title: string) => void | Promise<void>;
  onAutoRename?: (sessionId: string) => void | Promise<void>;
  onDelete?: (sessionId: string) => void;
}

export function AgentSessionSidebar({
  projectId,
  projectName,
  projectSlug,
  conversations,
  activeId,
  onNewChat,
  onRename,
  onAutoRename,
  onDelete,
}: Props) {
  const { t } = useTranslation('agents');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [autoRenamingId, setAutoRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [conversations],
  );

  useEffect(() => {
    if (!menuOpenId) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const startRename = (c: AgentConversationResponse) => {
    setMenuOpenId(null);
    setRenamingId(c.id);
    setRenameValue(c.title?.trim() || label(c));
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    if (!title || !onRename) {
      cancelRename();
      return;
    }
    void Promise.resolve(onRename(id, title)).finally(cancelRename);
  };

  const runAutoRename = (id: string) => {
    if (!onAutoRename || autoRenamingId) return;
    setMenuOpenId(null);
    setAutoRenamingId(id);
    void Promise.resolve(onAutoRename(id)).finally(() => setAutoRenamingId(null));
  };

  const showActions = Boolean(onRename || onAutoRename || onDelete);

  return (
    <aside className="agents-sessions">
      <div className="agents-sessions-head">
        <Link to="/agents" className="agents-sessions-back">
          <ArrowLeft size={14} />
          {t('sessions.back')}
        </Link>
        <div className="agents-sessions-project-block">
          <div className="agents-sessions-project-line">
            <div className="agents-sessions-project">{projectName}</div>
            <Link
              to={`/projects/${projectId}/settings`}
              className="agents-sessions-settings"
              title={t('settings.title')}
              aria-label={t('settings.title')}
            >
              <Settings size={16} strokeWidth={1.75} />
            </Link>
          </div>
          <div className="agents-sessions-sub">{projectSlug}</div>
        </div>
        <button type="button" className="agents-sessions-new" onClick={onNewChat}>
          <Plus size={15} strokeWidth={2} />
          {t('sessions.newChat')}
        </button>
      </div>
      <div className="agents-sessions-scroll">
        {sorted.map((c) => (
          <div
            key={c.id}
            className={`agents-session-row${activeId === c.id ? ' agents-session-row--active' : ''}`}
          >
            {renamingId === c.id ? (
              <input
                ref={renameInputRef}
                type="text"
                className="agents-session-rename"
                value={renameValue}
                maxLength={512}
                aria-label={t('sessions.rename')}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename(c.id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                onBlur={() => commitRename(c.id)}
              />
            ) : (
              <Link
                to={projectWorkspacePath(projectId, c.id)}
                className="agents-session-item"
                title={label(c)}
              >
                {label(c)}
              </Link>
            )}
            {showActions && renamingId !== c.id ? (
              <div className="agents-session-actions" ref={menuOpenId === c.id ? menuRef : undefined}>
                <button
                  type="button"
                  className="agents-session-more"
                  aria-label={t('sessions.actions')}
                  aria-expanded={menuOpenId === c.id}
                  aria-haspopup="menu"
                  disabled={autoRenamingId === c.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpenId((prev) => (prev === c.id ? null : c.id));
                  }}
                >
                  {autoRenamingId === c.id ? (
                    <Loader2 size={15} className="agents-session-more-spinner" />
                  ) : (
                    <MoreHorizontal size={15} />
                  )}
                </button>
                {menuOpenId === c.id ? (
                  <div className="agents-session-menu" role="menu">
                    {onAutoRename ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="agents-session-menu-item"
                        disabled={Boolean(autoRenamingId)}
                        onClick={() => runAutoRename(c.id)}
                      >
                        <Sparkles size={14} />
                        <span>{t('sessions.autoRename')}</span>
                      </button>
                    ) : null}
                    {onRename ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="agents-session-menu-item"
                        onClick={() => startRename(c)}
                      >
                        <Pencil size={14} />
                        <span>{t('sessions.rename')}</span>
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="agents-session-menu-item agents-session-menu-item--danger"
                        onClick={() => {
                          setMenuOpenId(null);
                          void onDelete(c.id);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>{t('sessions.delete')}</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
