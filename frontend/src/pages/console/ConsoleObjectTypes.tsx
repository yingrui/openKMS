import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  createObjectType,
  updateObjectType,
  deleteObjectType,
  indexObjectTypesToNeo4j,
  type ObjectTypeResponse,
  type PropertyDef,
} from '../../data/ontologyApi';
import {
  fetchDatasets,
  fetchDatasetMetadata,
  type DatasetResponse,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import { fetchDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import './ConsoleObjectTypes.css';

const PROPERTY_TYPES = ['string', 'number', 'boolean'];

/** Map PostgreSQL data_type to our property type */
function mapPgTypeToPropType(dataType: string): string {
  const t = dataType.toLowerCase();
  if (
    t.includes('int') ||
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float')
  ) {
    return 'number';
  }
  if (t.includes('bool')) return 'boolean';
  return 'string';
}

type FormProperty = PropertyDef & { enabled?: boolean };

function PropertyRow({
  prop,
  fromDataset,
  onChange,
  onRemove,
  onToggleEnabled,
}: {
  prop: FormProperty;
  fromDataset: boolean;
  onChange: (p: FormProperty) => void;
  onRemove: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
}) {
  return (
    <div className="console-obj-property-row">
      {fromDataset && onToggleEnabled && (
        <label className="console-obj-property-enabled" title="Include this property">
          <input
            type="checkbox"
            checked={prop.enabled !== false}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
        </label>
      )}
      <input
        type="text"
        placeholder="Property name"
        value={prop.name}
        onChange={(e) => onChange({ ...prop, name: e.target.value })}
        readOnly={fromDataset}
      />
      <select
        value={prop.type}
        onChange={(e) => onChange({ ...prop, type: e.target.value })}
      >
        {PROPERTY_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <label className="console-obj-property-required">
        <input
          type="checkbox"
          checked={prop.required}
          onChange={(e) => onChange({ ...prop, required: e.target.checked })}
        />
        Required
      </label>
      {!fromDataset && (
        <button type="button" onClick={onRemove} aria-label="Remove property">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function ConsoleObjectTypes() {
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState<ObjectTypeResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDatasetId, setFormDatasetId] = useState('');
  const [formProperties, setFormProperties] = useState<FormProperty[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [showIndexDialog, setShowIndexDialog] = useState(false);
  const [indexNeo4jId, setIndexNeo4jId] = useState('');
  const [indexing, setIndexing] = useState(false);

  const neo4jDataSources = dataSources.filter((ds) => ds.kind === 'neo4j');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, dsRes, dsSourcesRes] = await Promise.all([
        fetchObjectTypes(),
        fetchDatasets(),
        fetchDataSources(),
      ]);
      setTypes(typesRes.items);
      setDatasets(dsRes.items);
      setDataSources(dsSourcesRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load object types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savedPropNamesRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!formDatasetId) {
      setFormProperties([]);
      savedPropNamesRef.current = null;
      return;
    }
    const enabledNames = savedPropNamesRef.current;
    savedPropNamesRef.current = null;
    let cancelled = false;
    setLoadingMetadata(true);
    fetchDatasetMetadata(formDatasetId)
      .then((cols: ColumnMetadata[]) => {
        if (cancelled) return;
        const props: FormProperty[] = cols.map((c) => ({
          name: c.column_name,
          type: mapPgTypeToPropType(c.data_type),
          required: !c.is_nullable,
          enabled: enabledNames ? enabledNames.has(c.column_name) : true,
        }));
        setFormProperties(props);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load dataset columns');
          setFormProperties([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMetadata(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formDatasetId]);

  const openCreate = () => {
    setEditType(null);
    setFormName('');
    setFormDescription('');
    setFormDatasetId('');
    setFormProperties([]);
    setShowForm(true);
  };

  const openEdit = (t: ObjectTypeResponse) => {
    setEditType(t);
    setFormName(t.name);
    setFormDescription(t.description || '');
    const dsId = t.dataset_id || '';
    if (dsId) {
      savedPropNamesRef.current = new Set(
        (t.properties || [])
          .filter((p) => typeof p === 'object' && 'name' in p && (p as { name: string }).name)
          .map((p) => (p as { name: string }).name)
      );
    }
    setFormDatasetId(dsId);
    if (!dsId) {
      setFormProperties(
        (t.properties || []).map((p) => {
          const base =
            typeof p === 'object' && 'name' in p
              ? { name: p.name, type: p.type || 'string', required: !!p.required }
              : { name: '', type: 'string', required: false };
          return { ...base, enabled: true };
        })
      );
    }
    setShowForm(true);
  };

  const addProperty = () => {
    setFormProperties((prev) => [...prev, { name: '', type: 'string', required: false, enabled: true }]);
  };

  const updateProperty = (idx: number, p: FormProperty) => {
    setFormProperties((prev) => {
      const next = [...prev];
      next[idx] = p;
      return next;
    });
  };

  const togglePropertyEnabled = (idx: number, enabled: boolean) => {
    setFormProperties((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], enabled };
      return next;
    });
  };

  const removeProperty = (idx: number) => {
    setFormProperties((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    const props = formProperties
      .filter((p) => p.name.trim() && p.enabled !== false)
      .map(({ enabled: _e, ...rest }) => rest) as PropertyDef[];
    setSubmitting(true);
    try {
      if (editType) {
        await updateObjectType(editType.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          dataset_id: formDatasetId || undefined,
          properties: props,
        });
        toast.success('Object type updated');
      } else {
        await createObjectType({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          dataset_id: formDatasetId || undefined,
          properties: props,
        });
        toast.success('Object type created');
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this object type? All instances will be deleted.')) return;
    try {
      await deleteObjectType(id);
      toast.success('Object type deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Object Types</h1>
          <p className="page-subtitle">
            Define schema for entity types (e.g. Disease, InsuranceProduct). Admin only.
          </p>
        </div>
        <div className="page-header-actions">
          {neo4jDataSources.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              title="Index dataset to knowledge graph"
              onClick={() => {
                setIndexNeo4jId(neo4jDataSources[0]?.id || '');
                setShowIndexDialog(true);
              }}
            >
              <Database size={18} />
              <span>Index Objects</span>
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            <span>New Object Type</span>
          </button>
        </div>
      </div>

      <div className="console-object-types-content">
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
                <th>Name</th>
                <th>Description</th>
                <th>Dataset</th>
                <th>Properties</th>
                <th>Instances</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr>
                  <td colSpan={6} className="console-table-empty">
                    No object types yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                types.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.description || '—'}</td>
                    <td>{t.dataset_name || '—'}</td>
                    <td>{(t.properties || []).length}</td>
                    <td>{t.instance_count}</td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button type="button" title="Edit" onClick={() => openEdit(t)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Delete" onClick={() => handleDelete(t.id)}>
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
              <h2>{editType ? 'Edit Object Type' : 'New Object Type'}</h2>
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
                Name
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Disease"
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                <span>Dataset (optional)</span>
                <select
                  value={formDatasetId}
                  onChange={(e) => setFormDatasetId(e.target.value)}
                >
                  <option value="">None</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name || `${d.schema_name}.${d.table_name}`}
                    </option>
                  ))}
                </select>
                <span className="console-modal-hint" style={{ marginTop: 4, display: 'block' }}>
                  Select a dataset to auto-fill properties from columns. Check/uncheck to include or exclude.
                </span>
              </label>
              <div className="console-modal-section">
                <div className="console-modal-section-header">
                  <span>Properties</span>
                  {!formDatasetId && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addProperty}>
                      <Plus size={14} />
                      Add
                    </button>
                  )}
                </div>
                {loadingMetadata ? (
                  <p className="console-modal-hint">Loading columns…</p>
                ) : formProperties.length === 0 ? (
                  <p className="console-modal-hint">
                    {formDatasetId ? 'No columns in this dataset.' : 'Select a dataset to load columns, or add properties manually.'}
                  </p>
                ) : (
                  <div className="console-obj-properties-list">
                    {formProperties.map((p, i) => (
                      <PropertyRow
                        key={formDatasetId ? p.name : i}
                        prop={p}
                        fromDataset={!!formDatasetId}
                        onChange={(np) => updateProperty(i, np)}
                        onRemove={() => removeProperty(i)}
                        onToggleEnabled={formDatasetId ? (enabled) => togglePropertyEnabled(i, enabled) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
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
                disabled={!formName.trim() || submitting}
              >
                {submitting ? 'Saving…' : editType ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIndexDialog && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !indexing && setShowIndexDialog(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>Index Objects to Knowledge Graph</h2>
              <button
                type="button"
                onClick={() => !indexing && setShowIndexDialog(false)}
                disabled={indexing}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-modal-hint">
                Index all object types with linked datasets to the selected Neo4j database as nodes.
              </p>
              <label>
                <span>Neo4j Data Source</span>
                <select
                  value={indexNeo4jId}
                  onChange={(e) => setIndexNeo4jId(e.target.value)}
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
                onClick={() => !indexing && setShowIndexDialog(false)}
                disabled={indexing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIndexConfirm}
                disabled={!indexNeo4jId || indexing}
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
    </div>
  );
}
