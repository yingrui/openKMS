import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Database, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDataset,
  deleteDataset,
  fetchDatasets,
  fetchTablesFromSource,
  updateDataset,
  type DatasetResponse,
  type TableInfo,
} from '../../data/datasetsApi';
import { fetchAllDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

export function DatasetsListPage() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const [items, setItems] = useState<DatasetResponse[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<DatasetResponse | null>(null);
  const [formDataSourceId, setFormDataSourceId] = useState('');
  const [formSchema, setFormSchema] = useState('');
  const [formTable, setFormTable] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [filterDataSourceId, setFilterDataSourceId] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pgDataSources = dataSources.filter((ds) => ds.kind === 'postgresql');

  const filteredItems = items.filter((d) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const displayName = (d.display_name || `${d.schema_name}.${d.table_name}`).toLowerCase();
    const schemaTable = `${d.schema_name}.${d.table_name}`.toLowerCase();
    const dataSource = (d.data_source_name ?? '').toLowerCase();
    return displayName.includes(s) || schemaTable.includes(s) || dataSource.includes(s);
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, dRes] = await Promise.all([
        fetchDatasets(filterDataSourceId ? { data_source_id: filterDataSourceId } : undefined),
        fetchAllDataSources(),
      ]);
      setItems(dsRes.items);
      setDataSources(dRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filterDataSourceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTables = async (dataSourceId: string) => {
    if (!dataSourceId) {
      setTables([]);
      return;
    }
    setLoadingTables(true);
    try {
      setTables(await fetchTablesFromSource(dataSourceId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadTablesFailed'));
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    const defaultPg = pgDataSources[0]?.id ?? '';
    setFormDataSourceId(defaultPg);
    setFormSchema('');
    setFormTable('');
    setFormDisplayName('');
    setTables([]);
    if (defaultPg) void loadTables(defaultPg);
    setShowForm(true);
  };

  const openEdit = (d: DatasetResponse) => {
    setEditItem(d);
    setFormDataSourceId(d.data_source_id);
    setFormSchema(d.schema_name);
    setFormTable(d.table_name);
    setFormDisplayName(d.display_name ?? '');
    setTables([{ schema_name: d.schema_name, table_name: d.table_name }]);
    setShowForm(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setShowForm(false);
  };

  const handleDataSourceChange = (id: string) => {
    setFormDataSourceId(id);
    setFormSchema('');
    setFormTable('');
    if (id) void loadTables(id);
    else setTables([]);
  };

  const handleSubmit = async () => {
    if (!formDataSourceId || !formSchema.trim() || !formTable.trim()) {
      toast.error(t('datasets.requiredFields'));
      return;
    }
    setSubmitting(true);
    try {
      if (editItem) {
        await updateDataset(editItem.id, {
          schema_name: formSchema.trim(),
          table_name: formTable.trim(),
          display_name: formDisplayName.trim() || undefined,
        });
        toast.success(t('datasets.updated'));
      } else {
        await createDataset({
          data_source_id: formDataSourceId,
          schema_name: formSchema.trim(),
          table_name: formTable.trim(),
          display_name: formDisplayName.trim() || undefined,
        });
        toast.success(t('datasets.created'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDataset(id);
      toast.success(t('datasets.deleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.deleteFailed'));
    }
  };

  const showEmptyState =
    !loading && items.length === 0 && !search.trim() && !filterDataSourceId;

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('datasets.title')}</h1>
          <p className="page-subtitle">{t('datasets.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={pgDataSources.length === 0}
        >
          <Plus size={18} aria-hidden />
          <span>{t('datasets.create')}</span>
        </button>
      </header>

      <div className="ontology-admin-content">
        {!showEmptyState && (
          <div className="console-datasets-toolbar">
            <div className="console-datasets-search">
              <Search size={18} aria-hidden />
              <input
                type="search"
                aria-label={t('datasets.searchAria')}
                placeholder={t('datasets.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {dataSources.length > 0 && (
              <label className="console-datasets-filter">
                {t('datasets.filterLabel')}
                <select
                  value={filterDataSourceId}
                  onChange={(e) => setFilterDataSourceId(e.target.value)}
                >
                  <option value="">{t('datasets.filterAll')}</option>
                  {dataSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : showEmptyState ? (
          <EmptyState
            icon={<Database size={32} aria-hidden />}
            title={pgDataSources.length === 0 ? t('datasets.emptyNeedPg') : t('datasets.emptyList')}
            action={
              pgDataSources.length > 0 ? (
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  <Plus size={16} aria-hidden />
                  {t('datasets.create')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.displayName')}</th>
                  <th>{t('datasets.dataSource')}</th>
                  <th>{t('datasets.schemaTable')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {search.trim() ? t('datasets.emptyNoMatch') : t('datasets.emptyList')}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link
                          to={`/ontology-manager/datasets/${d.id}`}
                          className="ontology-manager-list__api-link"
                        >
                          <strong>{d.display_name || `${d.schema_name}.${d.table_name}`}</strong>
                        </Link>
                      </td>
                      <td>{d.data_source_name ?? t('datasets.dash')}</td>
                      <td className="console-table-muted">
                        {d.schema_name}.{d.table_name}
                      </td>
                      <td className="console-table-actions">
                        <div className="console-table-btns">
                          <Link
                            to={`/ontology-manager/datasets/${d.id}/sharing`}
                            title={t('datasets.sharing')}
                            className="console-table-icon-link"
                            aria-label={t('datasets.sharing')}
                          >
                            <Users size={16} aria-hidden />
                          </Link>
                          <button
                            type="button"
                            title={t('datasets.edit')}
                            aria-label={t('datasets.edit')}
                            onClick={() => openEdit(d)}
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            title={t('shared.delete')}
                            aria-label={t('shared.delete')}
                            onClick={() => void handleDelete(d.id)}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={closeForm}
        closeDisabled={submitting}
        title={editItem ? t('datasets.modalEditTitle') : t('datasets.modalNewTitle')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={submitting}>
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={!formDataSourceId || !formSchema.trim() || !formTable.trim() || submitting}
            >
              {submitting ? t('shared.saving') : editItem ? t('datasets.update') : t('datasets.create')}
            </button>
          </>
        }
      >
        <FormField label={t('datasets.fieldDataSource')}>
          <select
            value={formDataSourceId}
            onChange={(e) => handleDataSourceChange(e.target.value)}
            disabled={!!editItem || submitting}
          >
            <option value="">{t('datasets.selectDataSource')}</option>
            {pgDataSources.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name} ({ds.kind})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t('datasets.fieldTable')} htmlFor="om-dataset-table">
          <div className="openkms-table-picker-row">
            <select
              id="om-dataset-table"
              value={tables.length ? `${formSchema}.${formTable}` : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  const [s, tbl] = v.split('.');
                  setFormSchema(s);
                  setFormTable(tbl);
                }
              }}
              disabled={!formDataSourceId || loadingTables || tables.length === 0 || submitting}
              className="openkms-flex-1"
            >
              <option value="">
                {loadingTables ? t('datasets.loadingTables') : t('datasets.selectTable')}
              </option>
              {tables.map((tbl) => (
                <option
                  key={`${tbl.schema_name}.${tbl.table_name}`}
                  value={`${tbl.schema_name}.${tbl.table_name}`}
                >
                  {tbl.schema_name}.{tbl.table_name}
                </option>
              ))}
            </select>
            {formDataSourceId && !editItem && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void loadTables(formDataSourceId)}
                disabled={loadingTables || submitting}
                aria-label={t('datasets.refreshTables')}
              >
                <RefreshCw size={14} aria-hidden />
              </button>
            )}
          </div>
        </FormField>
        <FormField label={t('datasets.fieldDisplayName')}>
          <input
            type="text"
            value={formDisplayName}
            onChange={(e) => setFormDisplayName(e.target.value)}
            placeholder={t('datasets.displayNamePlaceholder')}
            disabled={submitting}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
