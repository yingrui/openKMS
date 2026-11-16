import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, EmptyState, FormField, ListPage } from '../../styles/design-system';
import { createOntologyGroup, fetchOntologyGroups, type OntologyGroupResponse } from '../../data/ontologyFunctionsApi';
import '../ontology/ontology-admin.scss';

export function GroupsListPage() {
  const { t } = useTranslation('ontology');
  const [items, setItems] = useState<OntologyGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchOntologyGroups());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setDisplayName('');
    setDescription('');
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (submitting) return;
    setShowCreate(false);
  };

  const onCreate = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = displayName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      const desc = description.trim();
      await createOntologyGroup({
        display_name: name,
        ...(desc ? { description: desc } : {}),
      });
      toast.success(t('groups.created'));
      setShowCreate(false);
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('groups.loadFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <ListPage
      title={t('groups.title')}
      subtitle={t('groups.subtitle')}
      actions={
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          {t('groups.create')}
        </button>
      }
    >
        {loading ? (
          <div className="ds-loading">
            <Loader2 size={32} className="ds-loading__spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={32} aria-hidden />}
            title={t('groups.emptyList')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('groups.create')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>{t('groups.displayName')}</th>
                  <th>{t('groups.objectTypes')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link to={`/ontology-manager/groups/${g.id}`} className="ontology-manager-list__api-link">
                        {g.display_name}
                      </Link>
                    </td>
                    <td className="ds-table-muted">{g.object_type_ids.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </ListPage>

      <Dialog
        open={showCreate}
        onClose={closeCreate}
        closeDisabled={submitting}
        title={t('groups.create')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeCreate} disabled={submitting}>
              {t('shared.cancel')}
            </button>
            <button
              type="submit"
              form="ontology-group-create-form"
              className="btn btn-primary"
              disabled={submitting || !displayName.trim()}
            >
              {submitting ? t('shared.saving') : t('groups.create')}
            </button>
          </>
        }
      >
        <form id="ontology-group-create-form" onSubmit={(e) => void onCreate(e)}>
          <FormField label={t('groups.displayName')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('groups.displayNamePlaceholder')}
              autoFocus
              disabled={submitting}
            />
          </FormField>
          <FormField label={t('groups.description')} hint={t('groups.descriptionOptionalHint')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('groups.descriptionPlaceholder')}
              rows={3}
              disabled={submitting}
            />
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
