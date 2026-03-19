import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectTypes,
  createLinkType,
  updateLinkType,
  deleteLinkType,
  CARDINALITY_OPTIONS,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import { fetchDatasets, fetchDatasetMetadata, type DatasetResponse } from '../../data/datasetsApi';
import './ConsoleObjectTypes.css';

export function ConsoleLinkTypes() {
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editType, setEditType] = useState<LinkTypeResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSourceId, setFormSourceId] = useState('');
  const [formTargetId, setFormTargetId] = useState('');
  const [formCardinality, setFormCardinality] = useState<string>('one-to-many');
  const [formDatasetId, setFormDatasetId] = useState('');
  const [formSourceKeyProperty, setFormSourceKeyProperty] = useState('');
  const [formTargetKeyProperty, setFormTargetKeyProperty] = useState('');
  const [formSourceDatasetColumn, setFormSourceDatasetColumn] = useState('');
  const [formTargetDatasetColumn, setFormTargetDatasetColumn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [datasetColumns, setDatasetColumns] = useState<{ column_name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, objsRes, dsRes] = await Promise.all([
        fetchLinkTypes(),
        fetchObjectTypes(),
        fetchDatasets(),
      ]);
      setLinkTypes(linksRes.items);
      setObjectTypes(objsRes.items);
      setDatasets(dsRes.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load link types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditType(null);
    setFormName('');
    setFormDescription('');
    setFormSourceId(objectTypes[0]?.id || '');
    setFormTargetId(objectTypes[0]?.id || '');
    setFormCardinality('one-to-many');
    setFormDatasetId('');
    setFormSourceKeyProperty('');
    setFormTargetKeyProperty('');
    setFormSourceDatasetColumn('');
    setFormTargetDatasetColumn('');
    setShowForm(true);
  };

  const openEdit = (t: LinkTypeResponse) => {
    setEditType(t);
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormSourceId(t.source_object_type_id);
    setFormTargetId(t.target_object_type_id);
    setFormCardinality(t.cardinality || 'one-to-many');
    setFormDatasetId(t.dataset_id || '');
    setFormSourceKeyProperty(t.source_key_property || '');
    setFormTargetKeyProperty(t.target_key_property || '');
    setFormSourceDatasetColumn(t.source_dataset_column || '');
    setFormTargetDatasetColumn(t.target_dataset_column || '');
    setShowForm(true);
  };

  useEffect(() => {
    if (formCardinality === 'many-to-many' && formDatasetId) {
      fetchDatasetMetadata(formDatasetId)
        .then((cols) => setDatasetColumns(cols))
        .catch(() => setDatasetColumns([]));
    } else {
      setDatasetColumns([]);
    }
  }, [formCardinality, formDatasetId]);

  const sourceObjectType = objectTypes.find((o) => o.id === formSourceId);
  const targetObjectType = objectTypes.find((o) => o.id === formTargetId);
  const sourceProperties = sourceObjectType?.properties ?? [];
  const targetProperties = targetObjectType?.properties ?? [];

  const handleSubmit = async () => {
    if (!formName.trim() || !formSourceId || !formTargetId) return;
    setSubmitting(true);
    try {
      if (editType) {
        await updateLinkType(editType.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          source_object_type_id: formSourceId,
          target_object_type_id: formTargetId,
          cardinality: formCardinality,
          dataset_id: formCardinality === 'many-to-many' ? formDatasetId || undefined : undefined,
          source_key_property: formSourceKeyProperty || undefined,
          target_key_property: formTargetKeyProperty || undefined,
          source_dataset_column: formSourceDatasetColumn || undefined,
          target_dataset_column: formTargetDatasetColumn || undefined,
        });
        toast.success('Link type updated');
      } else {
        await createLinkType({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          source_object_type_id: formSourceId,
          target_object_type_id: formTargetId,
          cardinality: formCardinality,
          dataset_id: formCardinality === 'many-to-many' ? formDatasetId || undefined : undefined,
          source_key_property: formSourceKeyProperty || undefined,
          target_key_property: formTargetKeyProperty || undefined,
          source_dataset_column: formSourceDatasetColumn || undefined,
          target_dataset_column: formTargetDatasetColumn || undefined,
        });
        toast.success('Link type created');
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
    if (!window.confirm('Delete this link type? All link instances will be deleted.')) return;
    try {
      await deleteLinkType(id);
      toast.success('Link type deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="console-object-types">
      <div className="page-header">
        <div>
          <h1>Link Types</h1>
          <p className="page-subtitle">
            Define relationships between object types (e.g. Disease → InsuranceProduct). Admin only.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={objectTypes.length < 2}
          title={objectTypes.length < 2 ? 'Create at least 2 object types first' : ''}
        >
          <Plus size={18} />
          <span>New Link Type</span>
        </button>
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
                <th>Source → Target</th>
                <th>FK</th>
                <th>Cardinality</th>
                <th>Dataset (M:M)</th>
                <th>Links</th>
                <th className="console-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {linkTypes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="console-table-empty">
                    No link types yet. Create at least 2 object types, then create a link type.
                  </td>
                </tr>
              ) : (
                linkTypes.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.description || '—'}</td>
                    <td>
                      {t.source_object_type_name || t.source_object_type_id} →{' '}
                      {t.target_object_type_name || t.target_object_type_id}
                    </td>
                    <td>
                      {[t.source_key_property, t.source_dataset_column, t.target_dataset_column, t.target_key_property]
                        .filter(Boolean)
                        .length > 0
                        ? [t.source_key_property, t.source_dataset_column, t.target_dataset_column, t.target_key_property]
                            .filter(Boolean)
                            .join(' — ')
                        : '—'}
                    </td>
                    <td>{t.cardinality || 'one-to-many'}</td>
                    <td>{t.cardinality === 'many-to-many' ? (t.dataset_name || '—') : '—'}</td>
                    <td>{t.link_count}</td>
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
          <div className="console-modal console-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editType ? 'Edit Link Type' : 'New Link Type'}</h2>
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
                  placeholder="e.g. covers"
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
                Source object type
                <select
                  value={formSourceId}
                  onChange={(e) => setFormSourceId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {objectTypes.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Target object type
                <select
                  value={formTargetId}
                  onChange={(e) => setFormTargetId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {objectTypes.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cardinality</span>
                <select
                  value={formCardinality}
                  onChange={(e) => setFormCardinality(e.target.value)}
                >
                  {CARDINALITY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="console-modal-hint" style={{ marginTop: 4, display: 'block' }}>
                  One-to-one: indicator only (not enforced). Many-to-many: link to junction table dataset.
                </span>
              </label>
              {formCardinality === 'many-to-many' && (
                <label>
                  <span>Dataset (junction table)</span>
                  <select
                    value={formDatasetId}
                    onChange={(e) => {
                      setFormDatasetId(e.target.value);
                      setFormSourceDatasetColumn('');
                      setFormTargetDatasetColumn('');
                    }}
                  >
                    <option value="">Select dataset…</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.display_name || `${d.schema_name}.${d.table_name}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="console-modal-fk-section">
                <span className="console-modal-fk-label">
                  {formCardinality === 'many-to-many' && formDatasetId
                    ? 'Source Key Property — Link Dataset Source Key Property — Link Dataset Target Key Property — Target Key Property'
                    : 'Foreign key (connect properties)'}
                </span>
                <div className="console-modal-fk-chain">
                  <label>
                    <span>Source Key Property</span>
                    <select
                      value={formSourceKeyProperty}
                      onChange={(e) => setFormSourceKeyProperty(e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {sourceProperties.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  {formCardinality === 'many-to-many' && formDatasetId && datasetColumns.length > 0 && (
                    <>
                      <span className="console-modal-fk-arrow">—</span>
                      <label>
                        <span>Link Dataset Source Key Property</span>
                        <select
                          value={formSourceDatasetColumn}
                          onChange={(e) => setFormSourceDatasetColumn(e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {datasetColumns.map((c) => (
                            <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                          ))}
                        </select>
                      </label>
                      <span className="console-modal-fk-arrow">—</span>
                      <label>
                        <span>Link Dataset Target Key Property</span>
                        <select
                          value={formTargetDatasetColumn}
                          onChange={(e) => setFormTargetDatasetColumn(e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {datasetColumns.map((c) => (
                            <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <span className="console-modal-fk-arrow">—</span>
                  <label>
                    <span>Target Key Property</span>
                    <select
                      value={formTargetKeyProperty}
                      onChange={(e) => setFormTargetKeyProperty(e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {targetProperties.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <span className="console-modal-hint" style={{ marginTop: 4, display: 'block' }}>
                  {formCardinality === 'many-to-many' && formDatasetId
                    ? 'Which property/column maps source → target through the junction table.'
                    : 'Which property in source/target object types forms the link (e.g. id, icd_code).'}
                </span>
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
                disabled={
                  !formName.trim() ||
                  !formSourceId ||
                  !formTargetId ||
                  (formCardinality === 'many-to-many' && (!formDatasetId || !formSourceDatasetColumn || !formTargetDatasetColumn)) ||
                  submitting
                }
              >
                {submitting ? 'Saving…' : editType ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
