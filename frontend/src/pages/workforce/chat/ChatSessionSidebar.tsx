import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import type { AgentConversationResponse } from '../../../data/agentApi';
import './ChatSessionSidebar.scss';

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
  /** Hide “back to KB” when a parent mobile toolbar already provides exit. */
  hideBackLink?: boolean;
  /** Called after selecting a session or starting a new chat (close mobile panel). */
  onSessionActivate?: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onSelectSession: (conversationId: string) => void;
  onNewChat: () => void;
  onRename: (sessionId: string, title: string) => void | Promise<void>;
  onDelete: (sessionId: string) => void | Promise<void>;
}

export function ChatSessionSidebar({
  kbName,
  conversations,
  activeId,
  loading = false,
  disabled = false,
  hideBackLink = false,
  onSessionActivate,
  onBack,
  onOpenSettings,
  onSelectSession,
  onNewChat,
  onRename,
  onDelete,
}: Props) {
  const { t } = useTranslation('workforce');
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
    <aside className="agent-chat-sessions" aria-label={t('chat.chatsAria')}>
      <div className="agent-chat-sessions-head">
        {!hideBackLink ? (
          <button type="button" className="agent-chat-sessions-back" onClick={onBack}>
            <ArrowLeft size={14} />
            {t('backToAgent')}
          </button>
        ) : null}
        <div className="agent-chat-sessions-context-block">
          <div className="agent-chat-sessions-context-line">
            <div className="agent-chat-sessions-context-title">{kbName}</div>
            <button
              type="button"
              className="agent-chat-sessions-settings"
              title={t('chatSettings')}
              aria-label={t('chatSettings')}
              onClick={onOpenSettings}
            >
              <Settings size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div className="agent-chat-sessions-sub">{t('chatTitle')}</div>
        </div>
        <button
          type="button"
          className="agent-chat-sessions-new"
          onClick={() => {
            onNewChat();
            onSessionActivate?.();
          }}
          disabled={disabled || loading}
        >
          <Plus size={15} strokeWidth={2} />
          {t('chat.newChat')}
        </button>
      </div>
      <div className="agent-chat-sessions-scroll">
        {loading ? (
          <div className="agent-chat-sessions-loading" role="status">
            <Loader2 size={20} className="agent-chat-sessions-spinner" aria-hidden />
            <span>{t('chat.chatsLoading')}</span>
          </div>
        ) : sorted.length === 0 ? (
          <p className="agent-chat-sessions-empty">{t('chat.noChatsYet')}</p>
        ) : (
          sorted.map((c) => (
            <div
              key={c.id}
              className={`agent-chat-session-row${activeId === c.id ? ' agent-chat-session-row--active' : ''}`}
            >
              {renamingId === c.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className="agent-chat-session-rename"
                  value={renameValue}
                  maxLength={512}
                  aria-label={t('chat.sessionRename')}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
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
                  className="agent-chat-session-item"
                  onClick={() => {
                    onSelectSession(c.id);
                    onSessionActivate?.();
                  }}
                >
                  {sessionLabel(c)}
                </button>
              )}
              {renamingId !== c.id ? (
                <div className="agent-chat-session-actions" ref={menuOpenId === c.id ? menuRef : undefined}>
                  <button
                    type="button"
                    className="agent-chat-session-more"
                    aria-label={t('chat.sessionActions')}
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
                    <div className="agent-chat-session-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="agent-chat-session-menu-item"
                        onClick={() => startRename(c)}
                      >
                        <Pencil size={14} />
                        <span>{t('chat.sessionRename')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="agent-chat-session-menu-item agent-chat-session-menu-item--danger"
                        onClick={() => {
                          setMenuOpenId(null);
                          void onDelete(c.id);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>{t('chat.sessionDelete')}</span>
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
