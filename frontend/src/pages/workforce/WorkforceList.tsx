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
} from '../../styles/design-system';
import { LIST_PAGE_SIZE_DEFAULT } from '../../hooks/useStoredViewMode';

/**
 * Workforce agents — the services built on top of knowledge bases.
 *
 * A list, not a card gallery: the reader is choosing which service to configure, and the number that
 * decides that is how many knowledge sources it already answers from. The catalog card grid is for
 * browsing content; these are configuration objects.
 */
export function WorkforceList() {
  const { t } = useTranslation('workforce');
  const [agents, setAgents] = useState<WorkforceAgentResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkforceAgents({ limit: pageSize, offset: page * pageSize });
      setAgents(data.items);
      setTotal(data.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
      setAgents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setPage(0);
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
          aria-label={t('newAgent')}
        >
          <Plus size={18} aria-hidden />
          <span className="ds-compact-label">{t('newAgent')}</span>
        </button>
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

      {!loading && agents.length > 0 && (
        <>
          <div className="ds-table-wrap">
            <table className="ds-table">
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
                      <Link to={`/workforce/${agent.id}`}>{agent.name}</Link>
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
          </div>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </>
      )}

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
