import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUp, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, FileText, GitMerge, MessageSquare, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AgentMessageBody } from '../../components/agents/AgentMessageBody';
import { SessionReviewEventCard } from '../../components/agents/SessionReviewEventCard';
import {
  chatImprovementsStream,
  getArtifacts,
  getLessons,
  makeEventId,
  mergeLessons,
  putLessons,
  reviewSession,
  saveArtifact,
  type ArtifactFile,
  type ImprovementStreamEvent,
  type LessonEvent,
  type LessonEventWithState,
} from '../../data/sessionReviewApi';
import { getProject, projectWorkspacePath } from '../../data/projectsApi';
import type { ProjectResponse } from '../../data/projectsApi';
import '../../components/agents/SessionReview.scss';

const COL_MIN = 280;

export function SessionReviewPage() {
  const { projectId = '', sessionId = '' } = useParams<{ projectId: string; sessionId: string }>();
  const { t } = useTranslation('agents');
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [lessons, setLessons] = useState<LessonEventWithState[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([]);
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [lessonsCollapsed, setLessonsCollapsed] = useState(false);

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => toast.error('Failed to load project'));
    getLessons(projectId).then(setLessons).catch(() => {});
    getArtifacts(projectId).then(setArtifacts).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    document.body.classList.add('openkms-agents-fullpage');
    return () => document.body.classList.remove('openkms-agents-fullpage');
  }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const saveToBackend = useCallback(
    async (items: LessonEventWithState[]) => {
      try {
        await putLessons(projectId, items);
      } catch (e) {
        toast.error(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [projectId],
  );

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const events = await reviewSession(projectId, sessionId);
      if (events.length === 0) {
        toast.info(t('sessions.reviewNoEvents'));
        return;
      }
      const now = new Date().toISOString();
      const newEvents: LessonEventWithState[] = events.map((e) => ({
        ...e,
        id: makeEventId(),
        status: 'pending' as const,
        session_id: sessionId,
        timestamp: now,
      }));
      setLessons((prev) => {
        const merged = [...newEvents, ...prev];
        void saveToBackend(merged);
        return merged;
      });
      toast.success(t('sessions.reviewDone', { count: events.length }));
    } catch (e) {
      toast.error(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  }, [projectId, sessionId, saveToBackend, t]);

  const handleMerge = useCallback(async () => {
    if (lessons.length === 0) {
      toast.info(t('sessions.mergeNoEvents'));
      return;
    }
    setMerging(true);
    try {
      const merged = await mergeLessons(projectId, lessons, sessionId);
      setLessons(merged);
      toast.success(t('sessions.mergeDone', { count: merged.length }));
    } catch (e) {
      toast.error(`Merge failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMerging(false);
    }
  }, [projectId, sessionId, lessons, t]);

  const handleApprove = useCallback(
    (event: LessonEvent, status: 'pending' | 'approved' | 'rejected') => {
      const id = (event as LessonEventWithState).id;
      setLessons((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, status } : l));
        void saveToBackend(next);
        return next;
      });
    },
    [saveToBackend],
  );

  const handleEdit = useCallback(
    (oldEvent: LessonEvent, updated: LessonEvent, status: 'pending' | 'approved' | 'rejected') => {
      const id = (oldEvent as LessonEventWithState).id;
      setLessons((prev) => {
        const next = prev.map((l) => {
          if (l.id !== id) return l;
          return {
            ...l,
            type: updated.type,
            severity: updated.severity,
            context: updated.context,
            what_went_wrong: updated.what_went_wrong,
            what_fixed_it: updated.what_fixed_it,
            message_ids: updated.message_ids,
            status,
          };
        });
        void saveToBackend(next);
        return next;
      });
    },
    [saveToBackend],
  );

  const handleReject = useCallback(
    (id: string) => {
      setLessons((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, status: 'rejected' as const } : l));
        void saveToBackend(next);
        return next;
      });
    },
    [saveToBackend],
  );

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatBusy) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user' as const, content: msg }]);
    setChatBusy(true);
    try {
      await chatImprovementsStream(projectId, msg, (ev: ImprovementStreamEvent) => {
        if (ev.type === 'delta') {
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              const next = [...prev];
              next[next.length - 1] = { ...last, content: last.content + ev.t };
              return next;
            }
            return [...prev, { role: 'assistant' as const, content: ev.t }];
          });
        } else if (ev.type === 'tool_start') {
          setChatMessages((prev) => [
            ...prev,
            { role: 'tool' as const, content: ev.input, toolName: ev.name },
          ]);
        } else if (ev.type === 'tool_end') {
          // tool completed — keep the tool row
        } else if (ev.type === 'tool_error') {
          setChatMessages((prev) => [
            ...prev,
            { role: 'tool' as const, content: ev.error, toolName: `${ev.name} (error)` },
          ]);
        } else if (ev.type === 'error') {
          throw new Error(ev.detail);
        }
      });
    } catch (e) {
      toast.error(`Chat failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChatBusy(false);
    }
  }, [projectId, chatInput, chatBusy]);

  const handleQuickPrompt = useCallback((prompt: string) => {
    setChatInput(prompt);
  }, []);

  const sessionLessons = lessons.filter((l) => l.session_id === sessionId);
  const otherLessons = lessons.filter(
    (l) => l.session_id !== sessionId && l.status !== 'rejected',
  );
  const hasApprovedLessons = lessons.some((l) => l.status === 'approved');
  const allLessons = [...sessionLessons, ...otherLessons];

  return (
    <div className="sreview-page">
      <header className="sreview-page-header">
        <Link to={projectWorkspacePath(projectId, sessionId)} className="sreview-page-back">
          <ArrowLeft size={16} />
        </Link>
        <span className="sreview-page-title">
          {project?.name ?? projectId} · Session Review
        </span>
        <button
          type="button"
          className="sreview-analyze-btn"
          disabled={analyzing}
          onClick={handleAnalyze}
          title={t('sessions.reviewAnalyzeHint')}
        >
          {analyzing ? (
            <span className="sreview-analyze-spinner" />
          ) : (
            <Sparkles size={14} />
          )}
          {analyzing ? t('sessions.reviewAnalyzing') : t('sessions.reviewAnalyze')}
        </button>
        <button
          type="button"
          className="sreview-analyze-btn sreview-merge-btn"
          disabled={merging}
          onClick={handleMerge}
          title={t('sessions.mergeHint')}
        >
          {merging ? (
            <span className="sreview-analyze-spinner" />
          ) : (
            <GitMerge size={14} />
          )}
          {merging ? t('sessions.mergeRunning') : t('sessions.mergeButton')}
        </button>
      </header>

      <div className="sreview-columns">
        {/* ——— Left: Lessons ——— */}
        <div className={`sreview-col sreview-col--events${lessonsCollapsed ? ' sreview-col--collapsed' : ''}`}
             style={lessonsCollapsed ? { width: 44, minWidth: 44, maxWidth: 44 } : { minWidth: COL_MIN }}>
          <div className="sreview-col-head">
            <FileText size={14} />
            {!lessonsCollapsed && <span>{t('sessions.reviewEvents')}</span>}
            {!lessonsCollapsed && <span className="sreview-col-count">{allLessons.length}</span>}
            <button
              type="button"
              className="sreview-col-collapse-btn"
              onClick={() => setLessonsCollapsed((v) => !v)}
              title={lessonsCollapsed ? 'Expand lessons' : 'Collapse lessons'}
            >
              {lessonsCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            </button>
          </div>
          {!lessonsCollapsed ? (
          <div className="sreview-col-body">
            {allLessons.length === 0 && !analyzing ? (
              <div className="sreview-empty">
                <p>{t('sessions.reviewEmpty')}</p>
                <p>{t('sessions.reviewEmptyHint')}</p>
              </div>
            ) : (
              <div className="sreview-event-list">
                {sessionLessons.map((l) => (
                  <SessionReviewEventCard
                    key={l.id}
                    event={l}
                    status={l.status}
                    onApprove={(ev, status) => handleApprove(ev, status)}
                    onEdit={(oldEv, upd, status) => handleEdit(oldEv, upd, status)}
                    onReject={() => handleReject(l.id)}
                  />
                ))}
                {otherLessons.map((l) => (
                  <SessionReviewEventCard
                    key={l.id}
                    event={l}
                    status={l.status}
                    onApprove={(ev, status) => handleApprove(ev, status)}
                    onEdit={(oldEv, upd, status) => handleEdit(oldEv, upd, status)}
                    onReject={() => handleReject(l.id)}
                  />
                ))}
              </div>
            )}
          </div>
          ) : null}
        </div>

        {/* ——— Middle: Chat ——— */}
        <div className="sreview-col sreview-col--chat" style={{ minWidth: COL_MIN }}>
          <div className="sreview-col-head">
            <MessageSquare size={14} />
            <span>{t('sessions.improveChat')}</span>
          </div>
          {!hasApprovedLessons ? (
            <div className="sreview-col-body">
              <p className="sreview-hint">{t('sessions.improveNoApproved')}</p>
            </div>
          ) : (
            <>
              <div className="sreview-col-body sreview-col-body--chat" ref={chatScrollRef}>
                {chatMessages.length === 0 ? (
                  <div className="sreview-chat-qs">
                    <p className="sreview-hint">{t('sessions.improveChatHint')}</p>
                    <div className="sreview-chat-qrow">
                      {([
                        t('sessions.improveQ1'),
                        t('sessions.improveQ2'),
                        t('sessions.improveQ3'),
                      ] as string[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="sreview-chat-q"
                          onClick={() => handleQuickPrompt(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} className={`agents-chat-msg agents-chat-msg--${m.role}`}>
                      {m.role === 'tool' ? (
                        <div className="sreview-chat-tool">
                          <span className="sreview-chat-tool-name">{m.toolName}</span>
                        </div>
                      ) : m.role === 'user' ? (
                        <div className="agents-chat-msg-user-col">
                          <div className="agents-chat-msg-body">{m.content}</div>
                        </div>
                      ) : (
                        <div className="agents-chat-msg-body">
                          <AgentMessageBody text={m.content} variant="assistant" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {chatBusy ? <div className="sreview-chat-typing">{t('sessions.improveChatting')}</div> : null}
              </div>
              <div className="sreview-chat-composer">
                <div className="sreview-chat-composer-inner">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={t('sessions.improvePlaceholder')}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleChatSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="sreview-chat-send"
                    disabled={chatBusy || !chatInput.trim()}
                    onClick={() => void handleChatSend()}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ——— Right: Artifacts ——— */}
        <div className="sreview-col sreview-col--artifacts" style={{ minWidth: COL_MIN }}>
          <div className="sreview-col-head">
            <Sparkles size={14} />
            <span>{t('sessions.improveArtifacts')}</span>
          </div>
          <div className="sreview-col-body">
            <div className="sreview-artifacts">
              {artifacts.map((a) => (
                <ArtifactPanel
                  key={a.path}
                  artifact={a}
                  projectId={projectId}
                  onSaved={(content) =>
                    setArtifacts((prev) =>
                      prev.map((x) => (x.path === a.path ? { ...x, content } : x)),
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactPanel({
  artifact,
  projectId,
  onSaved,
}: {
  artifact: ArtifactFile;
  projectId: string;
  onSaved: (content: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);
  const [saving, setSaving] = useState(false);

  const isNew = !artifact.content?.trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveArtifact(projectId, artifact.path, editContent);
      onSaved(editContent);
      setEditing(false);
      toast.success(`${artifact.path} saved`);
    } catch (e) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sreview-artifact">
      <button
        type="button"
        className="sreview-artifact-head"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="sreview-artifact-name">{artifact.path}</span>
        {isNew ? <span className="sreview-artifact-new">new</span> : null}
      </button>
      {open ? (
        <div className="sreview-artifact-body">
          {editing ? (
            <div className="sreview-artifact-edit">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                className="sreview-artifact-textarea"
              />
              <div className="sreview-artifact-edit-actions">
                <button type="button" className="sreview-btn sreview-btn--save" disabled={saving} onClick={handleSave}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="sreview-btn sreview-btn--cancel" onClick={() => { setEditContent(artifact.content); setEditing(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="sreview-artifact-preview">
              {isNew ? (
                <p className="sreview-artifact-empty">Does not exist yet. Create it to persist project knowledge.</p>
              ) : (
                <pre className="sreview-artifact-content">{artifact.content.slice(0, 1500)}{artifact.content.length > 1500 ? '\n…' : ''}</pre>
              )}
              <button
                type="button"
                className="sreview-btn sreview-btn--edit"
                onClick={() => { setEditContent(artifact.content); setEditing(true); }}
              >
                Edit
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
