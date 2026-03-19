import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, RefreshCw, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasets,
  fetchTablesFromSource,
  createDataset,
  updateDataset,
  deleteDataset,
  type DatasetResponse,
  type TableInfo,
} from '../../data/datasetsApi';
import { fetchDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import './ConsoleObjectTypes.css';

export function ConsoleDatasets() {
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
  const [filterDataSourceId, setFilterDataSourceId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        fetchDataSources(),
      ]);
      setItems(dsRes.items);
      setDataSources(dRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterDataSourceId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadTables = async (dataSourceId: string) => {
    if (!dataSourceId) {
      setTables([]);
      return;
    }
    setLoadingTables(true);
    try {
      const t = await fetchTablesFromSource(dataSourceId);
      setTables(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tables');
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setFormDataSourceId(dataSources[0]?.id ?? '');
    setFormSchema('');
    setFormTable('');
    setFormDisplayName('');
    setTables([]);
    if (dataSources[0]?.id) {
      loadTables(dataSources[0].id);
    }
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

  const handleDataSourceChange = (id: string) => {
    setFormDataSourceId(id);
    setFormSchema('');
    setFormTable('');
    if (id) {
      loadTables(id);
    } else {
      setTables([]);
    }
  };

  const handleSubmit = async () => {
    if (!formDataSourceId || !formSchema.trim() || !formTable.trim()) {
      toast.error('Data source, schema, and table are required');
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
        toast.success('Dataset updated');
      } else {
        await createDataset({
          data_source_id: formDataSourceId,
          schema_name: formSchema.trim(),
          table_name: formTable.trim(),
          display_name: formDisplayName.trim() || undefined,
        });
        toast.success('Dataset created');
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this dataset?')) return;
    try {
      await deleteDataset(id);
      toast.success('Dataset deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const pgDataSources = dataSources.filter((ds) => ds.kind === 'postgresql');

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Datasets</h1>
          <p className="page-subtitle">
            Map PostgreSQL tables from data sources. Can be linked to Object Types and Link Types later.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={pgDataSources.length === 0}
        >
          <Plus size={18} />
          <span>New Dataset</span>
        </button>
      </div>

      <div className="console-object-types-content">
      <div className="console-datasets-toolbar">
        <div className="console-datasets-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search datasets"
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {dataSources.length > 0 && (
          <label className="console-datasets-filter">
            Filter by data source:
            <select
              value={filterDataSourceId}
              onChange={(e) => setFilterDataSourceId(e.target.value)}
            >
              <option value="">All</option>
              {dataSources.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="console-object-types-table-wrap">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : (
          <table className="console-table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Data Source</th>
                <th>Schema.Table</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="console-table-empty">
                    {pgDataSources.length === 0
                      ? 'Add a PostgreSQL data source first.'
                      : search.trim()
                        ? 'No matching datasets.'
                        : 'No datasets yet. Create one to get started.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/console/datasets/${d.id}`} className="console-dataset-link">
                        <strong>{d.display_name || `${d.schema_name}.${d.table_name}`}</strong>
                      </Link>
                    </td>
                    <td>{d.data_source_name ?? '—'}</td>
                    <td>{d.schema_name}.{d.table_name}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button type="button" title="Edit" onClick={() => openEdit(d)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDelete(d.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      </div>

      {showForm && (
        <div className="console-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}>
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editItem ? 'Edit Dataset' : 'New Dataset'}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>Data Source</span>
                <select
                  value={formDataSourceId}
                  onChange={(e) => handleDataSourceChange(e.target.value)}
                  disabled={!!editItem}
                >
                  <option value="">Select data source</option>
                  {pgDataSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>{ds.name} ({ds.kind})</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Table (from source)</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={tables.length ? `${formSchema}.${formTable}` : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) {
                        const [s, t] = v.split('.');
                        setFormSchema(s);
                        setFormTable(t);
                      }
                    }}
                    disabled={!formDataSourceId || loadingTables || tables.length === 0}
                    style={{ flex: 1 }}
                  >
                    <option value="">{loadingTables ? 'Loading…' : 'Select table'}</option>
                    {tables.map((t) => (
                      <option key={`${t.schema_name}.${t.table_name}`} value={`${t.schema_name}.${t.table_name}`}>
                        {t.schema_name}.{t.table_name}
                      </option>
                    ))}
                  </select>
                  {formDataSourceId && !editItem && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => loadTables(formDataSourceId)}
                      disabled={loadingTables}
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </label>
              <label>
                <span>Display Name (optional)</span>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="e.g. Diseases table"
                />
              </label>
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!formDataSourceId || !formSchema.trim() || !formTable.trim() || submitting}
              >
                {submitting ? 'Saving…' : editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
