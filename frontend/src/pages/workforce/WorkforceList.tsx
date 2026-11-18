import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  createWorkforceAgent,
  fetchWorkforceAgents,
  type WorkforceAgentResponse,
} from '../../data/workforceApi';
import {
  Dialog,
  EmptyState,
  FormField,
  ListPage,
  Pagination,
  ResourceViewToggle,
} from '../../styles/design-system';
import {
  CARD_PREVIEW_LIMIT,
  LIST_PAGE_SIZE_DEFAULT,
  useStoredViewMode,
  type CardListViewMode,
} from '../../hooks/useStoredViewMode';

const VIEW_STORAGE_KEY = 'workforce-list-view';

/**
 * Workforce agents — the services built on top of knowledge bases.
 *
 * Two ways to read the same set, the same two the knowledge base list offers: cards to take in a
 * handful at a glance, the list to compare what each one is configured with — the sources, skills and
 * credentials that decide which one to open.
 */
export function WorkforceList() {
  const { t } = useTranslation('workforce');
  const { t: tc } = useTranslation('common');
  const [viewMode, setViewMode] = useStoredViewMode<CardListViewMode>(VIEW_STORAGE_KEY, 'card');
  const [agents, setAgents] = useState<WorkforceAgentResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const isCardView = viewMode === 'card';
  const fetchLimit = isCardView ? CARD_PREVIEW_LIMIT : listPageSize;
  const fetchOffset = isCardView ? 0 : listPage * listPageSize;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkforceAgents({ limit: fetchLimit, offset: fetchOffset });
      setAgents(data.items);
      setTotal(data.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
      setAgents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchLimit, fetchOffset, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isCardView) return;
    const maxPage = Math.max(0, Math.ceil(total / listPageSize) - 1);
    if (listPage > maxPage) setListPage(maxPage);
  }, [total, listPageSize, listPage, isCardView]);

  const switchView = (mode: CardListViewMode) => {
    setViewMode(mode);
    setListPage(0);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setName('');
    setDescription('');
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createWorkforceAgent({
        name: name.trim(),
        description: description.trim() || null,
      });
      closeCreate();
      toast.success(t('created'));
      setListPage(0);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      actions={
        <>
          {!loading ? (
            <ResourceViewToggle modes={['card', 'list']} value={viewMode} onChange={switchView} />
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
            aria-label={t('newAgent')}
          >
            <Plus size={18} aria-hidden />
            <span className="ds-compact-label">{t('newAgent')}</span>
          </button>
        </>
      }
    >
      {loading && <p className="ds-resource-list-loading">{t('loading')}</p>}

      {!loading && total === 0 && (
        <EmptyState
          icon={<Users size={48} strokeWidth={1} />}
          description={t('empty')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              {t('newAgent')}
            </button>
          }
        />
      )}

      {!loading && total > 0 && isCardView && total > agents.length ? (
        <p className="ds-card-preview-hint">
          {tc('cardPreviewHint', { shown: agents.length, total })}
          <button type="button" onClick={() => switchView('list')}>
            {tc('viewAllInList')}
          </button>
        </p>
      ) : null}

      {!loading && total > 0 && isCardView ? (
        <div className="ds-resource-list-grid">
          {agents.map((agent) => (
            <Link key={agent.id} to={`/workforce/${agent.id}`} className="ds-resource-list-card">
              <div className="ds-resource-list-card-top">
                <div className="ds-resource-list-icon">
                  <Users size={28} strokeWidth={1.5} />
                </div>
              </div>
              <h3>{agent.name}</h3>
              <p className="ds-resource-list-desc" title={agent.description?.trim() || undefined}>
                {agent.description || t('noDescription')}
              </p>
              <div className="ds-resource-list-meta">
                <span>{t('metaKbs', { count: agent.knowledge_base_count })}</span>
                <span>{t('metaSkills', { count: agent.agent_skills?.length ?? 0 })}</span>
                <span>{t('metaCredentials', { count: agent.credential_count })}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {!loading && total > 0 && !isCardView ? (
        <div className="ds-resource-table-wrap">
          <table className="ds-resource-table">
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('knowledgeTitle')}</th>
                <th>{t('skills')}</th>
                <th>{t('accessTitle')}</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <Link to={`/workforce/${agent.id}`} className="ds-resource-table__link">
                      {agent.name}
                    </Link>
                    <div className="page-subtitle">
                      {agent.description || t('noDescription')}
                    </div>
                  </td>
                  <td>{t('metaKbs', { count: agent.knowledge_base_count })}</td>
                  <td>{t('metaSkills', { count: agent.agent_skills?.length ?? 0 })}</td>
                  <td>{t('metaCredentials', { count: agent.credential_count })}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        </div>
      ) : null}

      <Dialog
        open={showCreate}
        onClose={closeCreate}
        title={t('cardCreateTitle')}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeCreate}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
              onClick={() => void handleCreate()}
            >
              {saving ? t('creating') : t('create')}
            </button>
          </>
        }
      >
        <p className="ds-field__hint">{t('cardCreateHint')}</p>
        <FormField label={t('name')}>
          <input
            className="ds-control"
            value={name}
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label={t('description')}>
          <textarea
            className="ds-control"
            rows={3}
            value={description}
            placeholder={t('descriptionPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </Dialog>
    </ListPage>
  );
}
