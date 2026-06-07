import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import type { AgentConversationResponse } from '../../data/agentApi';
import './KbQaSessionSidebar.scss';

function sessionLabel(c: AgentConversationResponse): string {
  if (c.title?.trim()) return c.title.trim();
  return new Date(c.updated_at).toLocaleDateString();
}

interface Props {
  kbName: string;
  conversations: AgentConversationResponse[];
  activeId: string | null;
  loading?: boolean;
  disabled?: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onSelectSession: (conversationId: string) => void;
  onNewChat: () => void;
  onRename: (sessionId: string, title: string) => void | Promise<void>;
  onDelete: (sessionId: string) => void | Promise<void>;
}

export function KbQaSessionSidebar({
  kbName,
  conversations,
  activeId,
  loading = false,
  disabled = false,
  onBack,
  onOpenSettings,
  onSelectSession,
  onNewChat,
  onRename,
  onDelete,
}: Props) {
  const { t } = useTranslation('knowledgeBase');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
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
    setRenameValue(c.title?.trim() || sessionLabel(c));
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    if (!title) {
      cancelRename();
      return;
    }
    void Promise.resolve(onRename(id, title)).finally(cancelRename);
  };

  return (
    <aside className="kb-qa-sessions" aria-label={t('detail.qaChatsAria')}>
      <div className="kb-qa-sessions-head">
        <button type="button" className="kb-qa-sessions-back" onClick={onBack}>
          <ArrowLeft size={14} />
          {t('detail.qaBackToKb')}
        </button>
        <div className="kb-qa-sessions-context-block">
          <div className="kb-qa-sessions-context-line">
            <div className="kb-qa-sessions-context-title">{kbName}</div>
            <button
              type="button"
              className="kb-qa-sessions-settings"
              title={t('detail.qaSettingsTitle')}
              aria-label={t('detail.qaSettingsTitle')}
              onClick={onOpenSettings}
            >
              <Settings size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div className="kb-qa-sessions-sub">{t('detail.qaTitle')}</div>
        </div>
        <button
          type="button"
          className="kb-qa-sessions-new"
          onClick={onNewChat}
          disabled={disabled || loading}
        >
          <Plus size={15} strokeWidth={2} />
          {t('detail.qaNewChat')}
        </button>
      </div>
      <div className="kb-qa-sessions-scroll">
        {loading ? (
          <div className="kb-qa-sessions-loading" role="status">
            <Loader2 size={20} className="kb-qa-sessions-spinner" aria-hidden />
            <span>{t('detail.qaChatsLoading')}</span>
          </div>
        ) : sorted.length === 0 ? (
          <p className="kb-qa-sessions-empty">{t('detail.qaNoChatsYet')}</p>
        ) : (
          sorted.map((c) => (
            <div
              key={c.id}
              className={`kb-qa-session-row${activeId === c.id ? ' kb-qa-session-row--active' : ''}`}
            >
              {renamingId === c.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className="kb-qa-session-rename"
                  value={renameValue}
                  maxLength={512}
                  aria-label={t('detail.qaSessionRename')}
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
                <button
                  type="button"
                  className="kb-qa-session-item"
                  onClick={() => onSelectSession(c.id)}
                >
                  {sessionLabel(c)}
                </button>
              )}
              {renamingId !== c.id ? (
                <div className="kb-qa-session-actions" ref={menuOpenId === c.id ? menuRef : undefined}>
                  <button
                    type="button"
                    className="kb-qa-session-more"
                    aria-label={t('detail.qaSessionActions')}
                    aria-expanded={menuOpenId === c.id}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpenId((prev) => (prev === c.id ? null : c.id));
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {menuOpenId === c.id ? (
                    <div className="kb-qa-session-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="kb-qa-session-menu-item"
                        onClick={() => startRename(c)}
                      >
                        <Pencil size={14} />
                        <span>{t('detail.qaSessionRename')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="kb-qa-session-menu-item kb-qa-session-menu-item--danger"
                        onClick={() => {
                          setMenuOpenId(null);
                          void onDelete(c.id);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>{t('detail.qaSessionDelete')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
