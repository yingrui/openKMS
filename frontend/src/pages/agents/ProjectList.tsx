import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Plus, Settings, X } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Pagination } from '../../styles/design-system';
import { createProject, listProjects, type ProjectResponse } from '../../data/projectsApi';
import { AgentsAreaNav } from '../../components/agents/AgentsAreaNav';
import { AgentsListSkeleton } from '../../components/agents/AgentsPageSkeleton';
import './ProjectList.scss';

const PROJECT_PAGE_SIZE_DEFAULT = 24;

export function ProjectList() {
  const { t } = useTranslation('agents');
  const { t: ts } = useTranslation('explore');
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(PROJECT_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const emptyNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects({
        limit: listPageSize,
        offset: listPage * listPageSize,
      });
      setProjects(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('list.loadFailed'));
      setProjects([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listPage, listPageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / listPageSize) - 1);
    if (listPage > maxPage) setListPage(maxPage);
  }, [total, listPageSize, listPage]);

  useEffect(() => {
    if (!loading && projects.length === 0) {
      emptyNameRef.current?.focus();
    }
  }, [loading, projects.length]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setShowCreate(false);
  };

  const onCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const p = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setProjects((prev) => [p, ...prev]);
      setTotal((n) => n + 1);
      resetForm();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('list.createError'));
    } finally {
      setCreating(false);
    }
  };

  const formatUpdated = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const hasProjects = !loading && !error && total > 0;

  return (
    <div className={`agents-list page${!loading && projects.length === 0 ? ' agents-list--empty' : ''}`}>
      <AgentsAreaNav />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {hasProjects ? (
        <div className="page-header agents-toolbar">
          <h1>{t('list.pageTitle')}</h1>
          <div className="agents-toolbar-actions">
            <Link to="/profile#agent-git-credentials" className="btn btn-secondary agents-settings-btn">
              <Settings size={18} aria-hidden />
              <span>{t('list.settings')}</span>
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowCreate(true);
                setName('');
                setDescription('');
              }}
            >
              <Plus size={18} />
              <span>{t('list.create')}</span>
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <AgentsListSkeleton /> : null}

      {!loading && !error && projects.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-hero">
            <div className="agents-empty-icon" aria-hidden>
              <Bot size={36} strokeWidth={1.5} />
            </div>
            <h2>{t('list.emptyTitle')}</h2>
            <p className="agents-empty-lead">{t('list.emptyLead')}</p>
          </div>
          <form className="agents-empty-card" onSubmit={onCreate}>
            <label>
              <span>{ts('shared.name')}</span>
              <input
                ref={emptyNameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('list.namePlaceholder')}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()}>
              <Plus size={18} />
              {creating ? ts('shared.saving') : t('list.createFirst')}
            </button>
          </form>
        </div>
      ) : null}

      {!loading && !error && projects.length > 0 ? (
        <>
        <div className="agents-grid">
          {projects.map((p) => (
            <div key={p.id} className="agents-card">
              <div className="agents-card-top">
                <Link to={`/projects/${p.id}`} className="agents-card-icon" aria-hidden>
                  <Bot size={26} strokeWidth={1.5} />
                </Link>
                <div className="agents-card-actions">
                  <Link
                    to={`/projects/${p.id}/settings`}
                    title={t('settings.title')}
                    aria-label={t('settings.title')}
                  >
                    <Settings size={15} />
                  </Link>
                </div>
              </div>
              <Link to={`/projects/${p.id}`} className="agents-card-body">
                <h3>{p.name}</h3>
                <p className="agents-card-desc">{p.description || t('list.noDescription')}</p>
                <span className="agents-card-meta">{t('list.updated', { date: formatUpdated(p.updated_at) })}</span>
              </Link>
            </div>
          ))}
        </div>
        {total > listPageSize ? (
          <Pagination
            total={total}
            page={listPage}
            pageSize={listPageSize}
            loading={loading}
            onPageChange={setListPage}
            onPageSizeChange={(size) => {
              setListPageSize(size);
              setListPage(0);
            }}
          />
        ) : null}
        </>
      ) : null}

      {showCreate ? (
        <div className="agents-dialog-overlay" onClick={resetForm} role="presentation">
          <div
            className="agents-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-labelledby="agents-create-title"
          >
            <div className="agents-dialog-header">
              <h2 id="agents-create-title">{t('list.dialogNew')}</h2>
              <button type="button" className="agents-dialog-close" aria-label={ts('shared.close')} onClick={resetForm}>
                <X size={20} />
              </button>
            </div>
            <form
              className="agents-dialog-body"
              onSubmit={(e) => {
                void onCreate(e);
              }}
            >
              <label>
                <span>{ts('shared.name')}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('list.namePlaceholder')}
                  autoFocus
                />
              </label>
              <label>
                <span>{ts('shared.description')}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('list.descPlaceholder')}
                  rows={3}
                />
              </label>
              <div className="agents-dialog-footer">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  {ts('shared.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={!name.trim() || creating}>
                  {creating ? ts('shared.saving') : ts('shared.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
