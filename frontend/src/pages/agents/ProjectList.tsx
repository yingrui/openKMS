import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bot, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Dialog, FormField, Pagination } from '../../styles/design-system';
import {
  createProject,
  listGitCredentials,
  listProjects,
  type ProjectResponse,
  type UserGitCredential,
} from '../../data/projectsApi';
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
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [gitCredentialId, setGitCredentialId] = useState('');
  const [credentials, setCredentials] = useState<UserGitCredential[]>([]);

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

  const resetForm = () => {
    setName('');
    setDescription('');
    setGitUrl('');
    setGitBranch('');
    setGitCredentialId('');
    setShowCreate(false);
  };

  const openCreate = () => {
    setName('');
    setDescription('');
    setGitUrl('');
    setGitBranch('');
    setGitCredentialId('');
    setShowCreate(true);
    void listGitCredentials()
      .then(setCredentials)
      .catch(() => setCredentials([]));
  };

  const onCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    const url = gitUrl.trim();
    if (url && !url.startsWith('https://')) {
      toast.error(t('list.gitHttpsOnly'));
      return;
    }
    setCreating(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        git_url: url || undefined,
        git_branch: gitBranch.trim() || undefined,
        git_credential_id: gitCredentialId || undefined,
      });
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
            <Link to="/settings#agent-git-credentials" className="btn btn-secondary agents-settings-btn">
              <Settings size={18} aria-hidden />
              <span className="ds-compact-label">{t('list.settings')}</span>
            </Link>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={18} />
              <span className="ds-compact-label">{t('list.create')}</span>
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
          <div className="agents-empty-card">
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={18} />
              {t('list.createFirst')}
            </button>
          </div>
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
                <p
                  className="agents-card-desc"
                  title={p.description?.trim() || undefined}
                >
                  {p.description || t('list.noDescription')}
                </p>
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

      <Dialog
        open={showCreate}
        onClose={resetForm}
        closeDisabled={creating}
        title={t('list.dialogNew')}
        closeAriaLabel={ts('shared.close')}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={creating}>
              {ts('shared.cancel')}
            </button>
            <button
              type="submit"
              form="agents-project-create-form"
              className="btn btn-primary"
              disabled={!name.trim() || creating}
            >
              {creating ? ts('shared.saving') : ts('shared.create')}
            </button>
          </>
        }
      >
        <form id="agents-project-create-form" onSubmit={(e) => void onCreate(e)}>
          <FormField label={ts('shared.name')}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('list.namePlaceholder')}
              autoFocus
              disabled={creating}
              autoComplete="off"
            />
          </FormField>
          <FormField label={ts('shared.description')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('list.descPlaceholder')}
              rows={3}
              disabled={creating}
            />
          </FormField>
          <FormField label={t('list.gitUrl')} hint={t('list.gitUrlHint')}>
            <input
              type="url"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder={t('list.gitUrlPlaceholder')}
              disabled={creating}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('list.gitBranch')} hint={t('list.gitBranchHint')}>
            <input
              type="text"
              value={gitBranch}
              onChange={(e) => setGitBranch(e.target.value)}
              placeholder={t('list.gitBranchPlaceholder')}
              disabled={creating || !gitUrl.trim()}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('list.gitCredential')} hint={t('list.gitCredentialHint')}>
            <select
              value={gitCredentialId}
              onChange={(e) => setGitCredentialId(e.target.value)}
              disabled={creating || !gitUrl.trim()}
            >
              <option value="">{t('list.gitCredentialNone')}</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.username})
                </option>
              ))}
            </select>
          </FormField>
        </form>
      </Dialog>
    </div>
  );
}
