import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import { createOntologyGroup, fetchOntologyGroups, type OntologyGroupResponse } from '../../data/ontologyFunctionsApi';
import '../ontology/ontology-admin.scss';

export function GroupsListPage() {
  const { t } = useTranslation('ontology');
  const [items, setItems] = useState<OntologyGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);

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

  const onCreate = async () => {
    const name = window.prompt(t('groups.displayName'));
    if (!name?.trim()) return;
    try {
      await createOntologyGroup({ display_name: name.trim() });
      toast.success(t('groups.created'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('groups.loadFailed'));
    }
  };

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('groups.title')}</h1>
          <p className="page-subtitle">{t('groups.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void onCreate()}>
          <Plus size={16} aria-hidden />
          {t('groups.create')}
        </button>
      </header>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={32} aria-hidden />}
            title={t('groups.emptyList')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => void onCreate()}>
                <Plus size={16} aria-hidden />
                {t('groups.create')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
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
                    <td className="console-table-muted">{g.object_type_ids.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
