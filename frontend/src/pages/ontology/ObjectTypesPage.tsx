import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Database, Users, Box } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import {
  fetchObjectTypes,
  deleteObjectType,
  indexObjectTypesToNeo4j,
  indexObjectTypeToNeo4j,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchAllDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import {
  fetchOntologyGroups,
  type OntologyGroupResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { ObjectTypeCreateWizard } from '../ontology-manager/ObjectTypeCreateWizard';
import './ontology-admin.scss';

export function ObjectTypesPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterGroupId = searchParams.get('group') ?? '';
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [groups, setGroups] = useState<OntologyGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [showIndexDialog, setShowIndexDialog] = useState(false);
  const [showIndexOneDialog, setShowIndexOneDialog] = useState(false);
  const [indexOneType, setIndexOneType] = useState<ObjectTypeResponse | null>(null);
  const [indexNeo4jId, setIndexNeo4jId] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexingTypeId, setIndexingTypeId] = useState<string | null>(null);

  const neo4jDataSources = dataSources.filter((ds) => ds.kind === 'neo4j');

  const setFilterGroupId = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('group', id);
        else next.delete('group');
        return next;
      },
      { replace: true },
    );
  };

  const filteredTypes = useMemo(() => {
    if (!filterGroupId) return types;
    const group = groups.find((g) => g.id === filterGroupId);
    if (!group) return types;
    const ids = new Set(group.object_type_ids);
    return types.filter((ot) => ids.has(ot.id));
  }, [types, groups, filterGroupId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, dsRes, dsSourcesRes, groupsRes] = await Promise.all([
        fetchObjectTypes(),
        fetchDatasets(),
        fetchAllDataSources(),
        fetchOntologyGroups(),
      ]);
      setTypes(typesRes.items);
      setDatasets(dsRes.items);
      setDataSources(dsSourcesRes);
      setGroups(groupsRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setShowCreateWizard(true);

  const handleIndexConfirm = async () => {
    if (!indexNeo4jId) return;
    setIndexing(true);
    try {
      const res = await indexObjectTypesToNeo4j(indexNeo4jId);
      toast.success(`Indexed ${res.object_types_indexed} object types, ${res.nodes_created} nodes created`);
      setShowIndexDialog(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Index failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleIndexOneConfirm = async () => {
    if (!indexNeo4jId || !indexOneType) return;
    setIndexingTypeId(indexOneType.id);
    try {
      const res = await indexObjectTypeToNeo4j(indexOneType.id, indexNeo4jId);
      toast.success(`Indexed ${res.object_types_indexed} object type, ${res.nodes_created} nodes created`);
      setShowIndexOneDialog(false);
      setIndexOneType(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Index failed');
    } finally {
      setIndexingTypeId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: t('objectTypes.deleteTitle'),
        message: t('objectTypes.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteObjectType(id);
      toast.success(t('objectTypes.deleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.saveFailed'));
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{t('objectTypes.title')}</h1>
          <p className="page-subtitle">{t('objectTypes.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          {neo4jDataSources.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              title={t('objectTypes.indexHeading')}
              disabled={indexing || indexingTypeId !== null || showIndexOneDialog || showIndexDialog}
              onClick={() => {
                setIndexNeo4jId(neo4jDataSources[0]?.id || '');
                setShowIndexDialog(true);
              }}
            >
              <Database size={18} />
              <span>{t('objectTypes.index')}</span>
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            <span>{t('objectTypes.create')}</span>
          </button>
        </div>
      </div>

      <div className="ontology-admin-content">
        {!loading && types.length > 0 && groups.length > 0 && (
          <div className="console-datasets-toolbar">
            <label className="console-datasets-filter">
              {t('objectTypes.filterByGroup')}
              <select
                value={filterGroupId}
                onChange={(e) => setFilterGroupId(e.target.value)}
                aria-label={t('objectTypes.filterByGroup')}
              >
                <option value="">{t('objectTypes.filterAllGroups')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name} ({g.object_type_ids.length})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" />
            <p>{t('shared.loading')}</p>
          </div>
        ) : types.length === 0 ? (
          <EmptyState
            icon={<Box size={32} aria-hidden />}
            title={t('objectTypes.emptyList')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('objectTypes.create')}
              </button>
            }
          />
        ) : filteredTypes.length === 0 ? (
          <EmptyState
            icon={<Box size={32} aria-hidden />}
            title={t('objectTypes.emptyNoGroupMatch')}
            action={
              <button type="button" className="btn btn-secondary" onClick={() => setFilterGroupId('')}>
                {t('objectTypes.filterAllGroups')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('objectTypes.name')}</th>
                  <th>{t('objectTypes.description')}</th>
                  <th>{t('objectTypes.dataset')}</th>
                  <th>{t('objectTypes.masterData')}</th>
                  <th>{t('objectTypes.displayProperty')}</th>
                  <th>{t('objectTypes.properties')}</th>
                  <th>{t('objectTypes.instances')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTypes.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        to={`/ontology-manager/object-types/${row.id}`}
                        className="ontology-manager-list__api-link"
                      >
                        <strong>{row.name}</strong>
                      </Link>
                    </td>
                    <td>{row.description || '—'}</td>
                    <td>{row.dataset_name || '—'}</td>
                    <td>{row.is_master_data ? 'Yes' : '—'}</td>
                    <td>{row.display_property || '—'}</td>
                    <td>{(row.properties || []).length}</td>
                    <td>{row.instance_count}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        {(row.dataset_id || row.instance_count > 0) && neo4jDataSources.length > 0 ? (
                          <button
                            type="button"
                            title={t('objectTypes.indexHeading')}
                            disabled={indexing || indexingTypeId !== null || showIndexOneDialog || showIndexDialog}
                            onClick={() => {
                              setIndexOneType(row);
                              setIndexNeo4jId(neo4jDataSources[0]?.id || '');
                              setShowIndexOneDialog(true);
                            }}
                          >
                            {indexingTypeId === row.id ? (
                              <Loader2 size={16} className="console-loading-spinner" />
                            ) : (
                              <Database size={16} />
                            )}
                          </button>
                        ) : null}
                        <Link
                          to={`/ontology-manager/object-types/${row.id}/sharing`}
                          title={t('objectTypes.sharing')}
                          className="console-table-icon-link"
                        >
                          <Users size={16} />
                        </Link>
                        <button
                          type="button"
                          title={t('objectTypes.properties')}
                          onClick={() => navigate(`/ontology-manager/object-types/${row.id}/properties`)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('shared.delete')}
                          onClick={() => handleDelete(row.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ObjectTypeCreateWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        groups={groups}
        datasets={datasets}
        initialGroupId={filterGroupId}
        onCreated={() => void load()}
      />

      {showIndexDialog && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !indexing && !indexingTypeId && setShowIndexDialog(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>Index Objects to Knowledge Graph</h2>
              <button
                type="button"
                onClick={() => !indexing && !indexingTypeId && setShowIndexDialog(false)}
                disabled={indexing || indexingTypeId !== null}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-modal-hint">
                Index all object types that have a linked dataset or stored instances to the selected Neo4j database as
                nodes.
              </p>
              <label>
                <span>Neo4j Data Source</span>
                <select
                  value={indexNeo4jId}
                  onChange={(e) => setIndexNeo4jId(e.target.value)}
                  disabled={indexing || indexingTypeId !== null}
                >
                  <option value="">Select…</option>
                  {neo4jDataSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.host}:{ds.port ?? 7687})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !indexing && !indexingTypeId && setShowIndexDialog(false)}
                disabled={indexing || indexingTypeId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIndexConfirm}
                disabled={!indexNeo4jId || indexing || indexingTypeId !== null}
              >
                {indexing ? (
                  <>
                    <Loader2 size={18} className="console-loading-spinner" />
                    <span>Indexing…</span>
                  </>
                ) : (
                  'Confirm & Index'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIndexOneDialog && indexOneType && (
        <div
          className="console-modal-overlay"
          onClick={(e) => {
            if (e.target !== e.currentTarget || indexingTypeId) return;
            setShowIndexOneDialog(false);
            setIndexOneType(null);
          }}
        >
          <div
            className={`console-modal${
              indexOneType.dataset_id
                ? ' console-modal--index-one-dataset'
                : ' console-modal--index-one-instances'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="console-modal-header">
              <h2>
                {indexOneType.dataset_id
                  ? 'Index from linked dataset'
                  : 'Index from saved instances'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (indexingTypeId) return;
                  setShowIndexOneDialog(false);
                  setIndexOneType(null);
                }}
                disabled={!!indexingTypeId}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              {indexOneType.dataset_id ? (
                <>
                  <p className="console-modal-index-lead">
                    <strong>{indexOneType.name}</strong> is tied to a data table. Choose where to write graph nodes,
                    then confirm.
                  </p>
                  <div className="console-modal-index-callout console-modal-index-callout--dataset" role="note">
                    Rows are read from the linked table and merged into the knowledge graph using the same property
                    names as columns.
                  </div>
                </>
              ) : (
                <>
                  <p className="console-modal-index-lead">
                    <strong>{indexOneType.name}</strong> is not tied to a data table. Indexing uses{' '}
                    <strong>{indexOneType.instance_count}</strong>{' '}
                    {indexOneType.instance_count === 1 ? 'instance' : 'instances'} you saved in the app.
                  </p>
                  <div className="console-modal-index-callout console-modal-index-callout--instances" role="note">
                    Each saved instance becomes one node in the graph. Property keys match what you stored on each
                    instance.
                  </div>
                </>
              )}
              <label>
                <span>Neo4j Data Source</span>
                <select
                  value={indexNeo4jId}
                  onChange={(e) => setIndexNeo4jId(e.target.value)}
                  disabled={!!indexingTypeId}
                >
                  <option value="">Select…</option>
                  {neo4jDataSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.host}:{ds.port ?? 7687})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (indexingTypeId) return;
                  setShowIndexOneDialog(false);
                  setIndexOneType(null);
                }}
                disabled={!!indexingTypeId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIndexOneConfirm}
                disabled={!indexNeo4jId || !!indexingTypeId}
              >
                {indexingTypeId ? (
                  <>
                    <Loader2 size={18} className="console-loading-spinner" />
                    <span>Indexing…</span>
                  </>
                ) : indexOneType.dataset_id ? (
                  'Index from dataset'
                ) : (
                  'Index instances'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
