import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Database, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectTypes,
  createLinkType,
  updateLinkType,
  deleteLinkType,
  indexLinkTypesToNeo4j,
  indexLinkTypeToNeo4j,
  CARDINALITY_OPTIONS,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import { fetchDatasets, fetchDatasetMetadata, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import './ontology-admin.scss';

/** True when indexing reads from a junction or source-side dataset (not only saved links). */
function linkTypeUsesDatasetIndexing(t: LinkTypeResponse, objectTypes: ObjectTypeResponse[]): boolean {
  if (
    t.cardinality === 'many-to-many' &&
    t.dataset_id &&
    t.source_dataset_column &&
    t.target_dataset_column
  ) {
    return true;
  }
  if (
    (t.cardinality === 'many-to-one' || t.cardinality === 'one-to-many') &&
    t.source_key_property
  ) {
    const src = objectTypes.find((o) => o.id === t.source_object_type_id);
    return Boolean(src?.dataset_id);
  }
  return false;
}

export function LinkTypesPage() {
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
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [showIndexDialog, setShowIndexDialog] = useState(false);
  const [showIndexOneDialog, setShowIndexOneDialog] = useState(false);
  const [indexOneLink, setIndexOneLink] = useState<LinkTypeResponse | null>(null);
  const [indexNeo4jId, setIndexNeo4jId] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexingLinkId, setIndexingLinkId] = useState<string | null>(null);

  const neo4jDataSources = dataSources.filter((ds) => ds.kind === 'neo4j');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, objsRes, dsRes, dsSourcesRes] = await Promise.all([
        fetchLinkTypes(),
        fetchObjectTypes(),
        fetchDatasets(),
        fetchDataSources(),
      ]);
      setLinkTypes(linksRes.items);
      setObjectTypes(objsRes.items);
      setDatasets(dsRes.items);
      setDataSources(dsSourcesRes.items);
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

  const handleIndexConfirm = async () => {
    if (!indexNeo4jId) return;
    setIndexing(true);
    try {
      const res = await indexLinkTypesToNeo4j(indexNeo4jId);
      toast.success(`Indexed ${res.link_types_indexed} link types, ${res.relationships_created} relationships created`);
      setShowIndexDialog(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Index failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleIndexOneConfirm = async () => {
    if (!indexNeo4jId || !indexOneLink) return;
    setIndexingLinkId(indexOneLink.id);
    try {
      const res = await indexLinkTypeToNeo4j(indexOneLink.id, indexNeo4jId);
      toast.success(`Indexed ${res.link_types_indexed} link type, ${res.relationships_created} relationships created`);
      setShowIndexOneDialog(false);
      setIndexOneLink(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Index failed');
    } finally {
      setIndexingLinkId(null);
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
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>Link Types</h1>
          <p className="page-subtitle">
            Define relationships between object types (e.g. Disease → InsuranceProduct). Admin only.
          </p>
        </div>
        <div className="page-header-actions">
          {neo4jDataSources.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              title="Index links to knowledge graph"
              disabled={indexing || indexingLinkId !== null || showIndexOneDialog || showIndexDialog}
              onClick={() => {
                setIndexNeo4jId(neo4jDataSources[0]?.id || '');
                setShowIndexDialog(true);
              }}
            >
              <Database size={18} />
              <span>Index Links</span>
            </button>
          )}
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
      </div>

      <div className="ontology-admin-content">
        <div className="ontology-admin-table-wrap">
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
                        {(linkTypeUsesDatasetIndexing(t, objectTypes) || t.link_count > 0) &&
                        neo4jDataSources.length > 0 ? (
                          <button
                            type="button"
                            title="Index links to knowledge graph"
                            disabled={
                              indexing || indexingLinkId !== null || showIndexOneDialog || showIndexDialog
                            }
                            onClick={() => {
                              setIndexOneLink(t);
                              setIndexNeo4jId(neo4jDataSources[0]?.id || '');
                              setShowIndexOneDialog(true);
                            }}
                          >
                            {indexingLinkId === t.id ? (
                              <Loader2 size={16} className="console-loading-spinner" />
                            ) : (
                              <Database size={16} />
                            )}
                          </button>
                        ) : null}
                        <Link
                          to={`/ontology/link-types/${t.id}/settings?tab=sharing`}
                          title="Sharing"
                          className="console-table-icon-link"
                        >
                          <Users size={16} />
                        </Link>
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
                <span className="console-modal-hint console-modal-hint--block">
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
                <span className="console-modal-hint console-modal-hint--block">
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

      {showIndexDialog && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !indexing && !indexingLinkId && setShowIndexDialog(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>Index Links to Knowledge Graph</h2>
              <button
                type="button"
                onClick={() => !indexing && !indexingLinkId && setShowIndexDialog(false)}
                disabled={indexing || indexingLinkId !== null}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-modal-hint">
                Index every link type that has a junction or source-side dataset, or saved links, to the selected Neo4j
                database as relationships.
              </p>
              <label>
                <span>Neo4j Data Source</span>
                <select
                  value={indexNeo4jId}
                  onChange={(e) => setIndexNeo4jId(e.target.value)}
                  disabled={indexing || indexingLinkId !== null}
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
                onClick={() => !indexing && !indexingLinkId && setShowIndexDialog(false)}
                disabled={indexing || indexingLinkId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIndexConfirm}
                disabled={!indexNeo4jId || indexing || indexingLinkId !== null}
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

      {showIndexOneDialog && indexOneLink && (
        <div
          className="console-modal-overlay"
          onClick={(e) => {
            if (e.target !== e.currentTarget || indexingLinkId) return;
            setShowIndexOneDialog(false);
            setIndexOneLink(null);
          }}
        >
          <div
            className={`console-modal${
              linkTypeUsesDatasetIndexing(indexOneLink, objectTypes)
                ? ' console-modal--index-one-dataset'
                : ' console-modal--index-one-instances'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="console-modal-header">
              <h2>
                {linkTypeUsesDatasetIndexing(indexOneLink, objectTypes)
                  ? 'Index from linked data'
                  : 'Index from saved links'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (indexingLinkId) return;
                  setShowIndexOneDialog(false);
                  setIndexOneLink(null);
                }}
                disabled={!!indexingLinkId}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              {linkTypeUsesDatasetIndexing(indexOneLink, objectTypes) ? (
                <>
                  <p className="console-modal-index-lead">
                    <strong>{indexOneLink.name}</strong> is configured to read from database tables (junction or
                    source-side foreign key). Choose where to write relationships, then confirm.
                  </p>
                  <div className="console-modal-index-callout console-modal-index-callout--dataset" role="note">
                    {indexOneLink.cardinality === 'many-to-many'
                      ? 'Rows come from the junction table you linked. Each row creates one relationship between the two object types.'
                      : 'Rows come from the source object type’s linked table. The foreign-key column points at the target object id on each relationship.'}
                  </div>
                </>
              ) : (
                <>
                  <p className="console-modal-index-lead">
                    <strong>{indexOneLink.name}</strong> is not driven by a linked table for indexing. This run uses{' '}
                    <strong>{indexOneLink.link_count}</strong>{' '}
                    {indexOneLink.link_count === 1 ? 'saved link' : 'saved links'} you created in the app.
                  </p>
                  <div className="console-modal-index-callout console-modal-index-callout--instances" role="note">
                    Each saved link connects two object instances. Endpoints are matched to graph nodes using the same
                    keys as object indexing (primary key or key property on each side).
                  </div>
                </>
              )}
              <label>
                <span>Neo4j Data Source</span>
                <select
                  value={indexNeo4jId}
                  onChange={(e) => setIndexNeo4jId(e.target.value)}
                  disabled={!!indexingLinkId}
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
                  if (indexingLinkId) return;
                  setShowIndexOneDialog(false);
                  setIndexOneLink(null);
                }}
                disabled={!!indexingLinkId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIndexOneConfirm}
                disabled={!indexNeo4jId || !!indexingLinkId}
              >
                {indexingLinkId ? (
                  <>
                    <Loader2 size={18} className="console-loading-spinner" />
                    <span>Indexing…</span>
                  </>
                ) : linkTypeUsesDatasetIndexing(indexOneLink, objectTypes) ? (
                  'Index from dataset'
                ) : (
                  'Index saved links'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
