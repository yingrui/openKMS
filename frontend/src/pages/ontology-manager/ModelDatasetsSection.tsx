import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasetMetadata, type ColumnMetadata } from '../../data/datasetsApi';
import {
  createModelField,
  deleteModelField,
  fetchModelFields,
  fieldExpressionSql,
  isTemporalDatatype,
  OSSIE_DATATYPES,
  updateModelField,
  type SemanticModelFieldResponse,
} from '../../data/semanticModelFieldsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, FormField, Pagination } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { fieldCoverage } from './fieldCoverage';
import { useSemanticModelDetail } from './useSemanticModelDetail';
import type { DatasetResponse } from '../../data/datasetsApi';

const PAGE_SIZE = 25;

type AiContext = { instructions: string; synonyms: string; examples: string };

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

/**
 * Model → Datasets: the datasets in the model's scope, each showing its **fields** (which the
 * spec nests under a dataset) plus the catalog facts the model merely references.
 */
export function ModelDatasetsSection() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const { model, allDatasets } = useSemanticModelDetail();
  const modelId = model.id;

  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<Record<string, number>>({});
  /** The table's own columns per dataset: what a field may point at, and what a refresh re-reads. */
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnMetadata[]>>({});
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const [formDatasetId, setFormDatasetId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SemanticModelFieldResponse | null>(null);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'column' | 'computed'>('column');
  const [columnName, setColumnName] = useState('');
  const [exprSql, setExprSql] = useState('');
  const [datatype, setDatatype] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [dimensionMode, setDimensionMode] = useState<'auto' | 'time' | 'regular'>('auto');
  const [ai, setAi] = useState<AiContext>({ instructions: '', synonyms: '', examples: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields((await fetchModelFields(modelId)).items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFieldsFailed'));
    } finally {
      setLoading(false);
    }
  }, [modelId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formDatasetId) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetMetadata(formDatasetId)
      .then((m) => !cancelled && setColumns(m))
      .catch(() => !cancelled && setColumns([]));
    return () => {
      cancelled = true;
    };
  }, [formDatasetId]);

  const byDataset = useMemo(() => {
    const map: Record<string, SemanticModelFieldResponse[]> = {};
    for (const f of fields) (map[f.dataset_id] ??= []).push(f);
    return map;
  }, [fields]);

  const query = search.trim().toLowerCase();
  const matches = useCallback(
    (f: SemanticModelFieldResponse) =>
      !query ||
      [f.name, f.label ?? '', f.column_name ?? '', f.datatype ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    [query],
  );

  const scope = model.datasets;
  const visible = scope.filter(
    (d) => !query || d.name.toLowerCase().includes(query) || (byDataset[d.id] ?? []).some(matches),
  );

  /* A dataset's columns live in the source, so they are read per dataset (usually one or two). */
  const visibleIds = visible.map((ref) => ref.id).join(',');
  useEffect(() => {
    if (!visibleIds) return;
    let cancelled = false;
    void Promise.all(
      visibleIds.split(',').map(async (id) => [id, await fetchDatasetMetadata(id)] as const),
    )
      .then((entries) => {
        if (!cancelled) setTableColumns(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visibleIds]);

  /**
   * Re-read the table's columns: it gains them without telling us, and a field can end up pointing at
   * one that was dropped — the two things this tab is in a position to notice.
   *
   * Columns only, deliberately: the profile (row counts, per-column statistics and the schema-history
   * snapshot) is a heavier thing with its own home in the Catalog's Columns tab. Reading this table's
   * 19 columns takes a moment; profiling its million rows took seven seconds.
   */
  const refreshColumns = async (datasetId: string) => {
    setRefreshing(datasetId);
    try {
      const before = (tableColumns[datasetId] ?? []).map((c) => c.column_name);
      const after = await fetchDatasetMetadata(datasetId);
      setTableColumns((prev) => ({ ...prev, [datasetId]: after }));
      const added = after.map((c) => c.column_name).filter((c) => !before.includes(c));
      const removed = before.filter((c) => !after.map((x) => x.column_name).includes(c));
      if (added.length === 0 && removed.length === 0) toast.success(t('dataModel.columnsUnchanged'));
      else toast.success(t('dataModel.columnsRefreshed', { added: added.length, removed: removed.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadColumnsFailed'));
    } finally {
      setRefreshing(null);
    }
  };

  /** Add the columns nobody has a field for, using the column's own type and time role. */
  const addMissingFields = async (datasetId: string, missing: string[], all: ColumnMetadata[]) => {
    setRefreshing(datasetId);
    try {
      for (const column of missing) {
        const meta = all.find((c) => c.column_name === column);
        const isTime = meta?.ontology_type === 'date' || meta?.ontology_type === 'datetime';
        await createModelField(modelId, {
          dataset_id: datasetId,
          name: column,
          column_name: column,
          expression: { dialects: [{ dialect: 'ANSI_SQL', expression: `"${column}"` }] },
          datatype: meta?.ontology_type ?? null,
          label: null,
          description: null,
          dimension: isTime ? { is_time: true } : null,
          ai_context: null,
        });
      }
      toast.success(t('dataModel.fieldsAdded', { count: missing.length }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldSaveFailed'));
    } finally {
      setRefreshing(null);
    }
  };

  /** Only the *time* role is modelled by the spec (`dimension.is_time`). */
  const dimensionLabel = (f: SemanticModelFieldResponse) => {
    if (f.dimension?.is_time === true) return t('dataModel.dimensionYes');
    if (f.dimension?.is_time === false) return t('datasets.dash');
    return isTemporalDatatype(f.datatype) ? t('dataModel.dimensionTimeByType') : t('datasets.dash');
  };

  const openCreate = (datasetId: string) => {
    setEditing(null);
    setFormDatasetId(datasetId);
    setName('');
    setMode('column');
    setColumnName('');
    setExprSql('');
    setDatatype('');
    setLabel('');
    setDescription('');
    setDimensionMode('auto');
    setAi({ instructions: '', synonyms: '', examples: '' });
  };

  const openEdit = (f: SemanticModelFieldResponse) => {
    setEditing(f);
    setFormDatasetId(f.dataset_id);
    setName(f.name);
    setMode(f.column_name ? 'column' : 'computed');
    setColumnName(f.column_name ?? '');
    setExprSql(fieldExpressionSql(f));
    setDatatype(f.datatype ?? '');
    setLabel(f.label ?? '');
    setDescription(f.description ?? '');
    setDimensionMode(
      typeof f.dimension?.is_time === 'boolean'
        ? f.dimension.is_time
          ? 'time'
          : 'regular'
        : 'auto',
    );
    setAi({
      instructions: String((f.ai_context?.instructions as string) ?? ''),
      synonyms: ((f.ai_context?.synonyms as string[]) ?? []).join(', '),
      examples: ((f.ai_context?.examples as string[]) ?? []).join(', '),
    });
  };

  const closeForm = () => {
    if (submitting) return;
    setFormDatasetId(null);
    setEditing(null);
  };

  const handleSubmit = async () => {
    if (!formDatasetId) return;
    if (!name.trim()) {
      toast.error(t('datasets.fieldNameRequired'));
      return;
    }
    const synonyms = splitList(ai.synonyms);
    const examples = splitList(ai.examples);
    const hasAi = ai.instructions.trim() || synonyms.length || examples.length;
    const expression =
      mode === 'computed'
        ? exprSql.trim()
          ? { dialects: [{ dialect: 'ANSI_SQL', expression: exprSql.trim() }] }
          : null
        : columnName
          ? { dialects: [{ dialect: 'ANSI_SQL', expression: `"${columnName}"` }] }
          : null;
    const payload = {
      dataset_id: formDatasetId,
      name: name.trim(),
      column_name: mode === 'column' ? columnName : null,
      expression,
      datatype: datatype || null,
      label: label.trim() || null,
      description: description.trim() || null,
      dimension: dimensionMode === 'auto' ? null : { is_time: dimensionMode === 'time' },
      ai_context: hasAi ? { instructions: ai.instructions.trim(), synonyms, examples } : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateModelField(modelId, editing.id, payload);
        toast.success(t('datasets.fieldSaved'));
      } else {
        await createModelField(modelId, payload);
        toast.success(t('datasets.fieldCreated'));
      }
      closeForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: SemanticModelFieldResponse) => {
    const ok = await confirm({
      title: t('shared.delete'),
      message: t('datasets.fieldDeleteConfirm', { name: f.name }),
      confirmLabel: t('shared.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteModelField(modelId, f.id);
      toast.success(t('datasets.fieldDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldDeleteFailed'));
    }
  };

  const formDataset = allDatasets.find((d) => d.id === formDatasetId);

  return (
    <>
      <EntityViewHeader
        title={t('datasets.title')}
        subtitle={t('dataModel.datasetCount', { count: scope.length })}
        actions={
          <input
            type="search"
            className="ds-control entity-view__search"
            aria-label={t('datasets.searchAria')}
            placeholder={t('dataModel.datasetFieldSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />

      {loading ? (
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        </EntityViewPanel>
      ) : scope.length === 0 ? (
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('dataModel.noDatasetsSelected')}</p>
        </EntityViewPanel>
      ) : visible.length === 0 ? (
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('dataModel.noSearchMatch')}</p>
        </EntityViewPanel>
      ) : (
        visible.map((ref) => {
          const catalog = allDatasets.find((d) => d.id === ref.id);
          const own = byDataset[ref.id] ?? [];
          const shown = own.filter(matches);
          const page = pages[ref.id] ?? 0;
          const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages - 1);
          const paged = shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
          const p = (catalog?.ai_context ?? {}) as { instructions?: string };

          return (
            <EntityViewPanel key={ref.id} title={ref.name}>
              <dl className="entity-view__dl model-dataset__facts">
                <dt>{t('datasets.dataSource')}</dt>
                <dd>
                  {catalog ? `${catalog.schema_name}.${catalog.table_name}` : t('datasets.dash')}
                  {catalog?.data_source_name ? ` · ${catalog.data_source_name}` : ''}
                </dd>
                <dt>{t('datasets.descriptionLabel')}</dt>
                <dd>{catalog?.description || t('datasets.dash')}</dd>
                <dt>{t('datasets.keysSection')}</dt>
                <dd>
                  {(catalog?.primary_key_columns ?? []).join(', ') || t('datasets.dash')}
                  {(catalog?.unique_keys ?? []).length > 0
                    ? ` · ${(catalog?.unique_keys ?? []).map((k) => k.join('+')).join(', ')}`
                    : ''}
                </dd>
                <dt>{t('datasets.aiContext')}</dt>
                <dd>{p.instructions || t('datasets.dash')}</dd>
              </dl>

              {/* What the table and the model disagree about — the reason to be in this tab. */}
              {(() => {
                const coverage = fieldCoverage(
                  (tableColumns[ref.id] ?? []).map((c) => c.column_name),
                  own,
                );
                if (
                  coverage.columnsWithoutFields.length === 0 &&
                  coverage.fieldsWithoutColumn.length === 0
                ) {
                  return null;
                }
                return (
                  <div className="model-dataset__coverage">
                    {coverage.columnsWithoutFields.length > 0 && (
                      <p className="model-dataset__coverage-line">
                        <span>
                          {t('dataModel.columnsWithoutFields', {
                            count: coverage.columnsWithoutFields.length,
                          })}
                          {': '}
                          <span className="model-dataset__coverage-names">
                            {coverage.columnsWithoutFields.join(', ')}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            void addMissingFields(
                              ref.id,
                              coverage.columnsWithoutFields,
                              tableColumns[ref.id] ?? [],
                            )
                          }
                          disabled={refreshing === ref.id}
                        >
                          <Plus size={14} aria-hidden />
                          {t('dataModel.addMissingFields')}
                        </button>
                      </p>
                    )}
                    {coverage.fieldsWithoutColumn.length > 0 && (
                      <p className="model-dataset__coverage-line page-subtitle--error">
                        {t('dataModel.fieldsWithoutColumn', {
                          count: coverage.fieldsWithoutColumn.length,
                        })}
                        {': '}
                        {coverage.fieldsWithoutColumn
                          .map((f) => `${f.name} → ${f.column_name}`)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="model-dataset__head">
                <span className="page-subtitle">
                  {t('dataModel.fieldCount', { count: own.length })}
                </span>
                <div className="model-dataset__head-actions">
                  <Link to={`/datasets/${ref.id}`} className="btn btn-secondary btn-sm">
                    <ExternalLink size={14} aria-hidden />
                    {t('dataModel.openInCatalog')}
                  </Link>
                  {/* The source table changes on its own — re-read it and see what moved. */}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void refreshColumns(ref.id)}
                    disabled={refreshing === ref.id}
                  >
                    {refreshing === ref.id ? (
                      <Loader2 size={14} className="spin" aria-hidden />
                    ) : (
                      <RefreshCw size={14} aria-hidden />
                    )}
                    {t('dataModel.refreshColumns')}
                  </button>
                  {/* …and this is where a field is authored: the model has no Fields tab of its own —
                      a field belongs to a dataset, so it is created (and edited) in that context. */}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openCreate(ref.id)}
                  >
                    <Plus size={14} aria-hidden />
                    {t('datasets.addField')}
                  </button>
                </div>
              </div>

              {own.length === 0 ? (
                <p className="entity-view__readonly">{t('dataModel.fieldsEmptyHint')}</p>
              ) : shown.length === 0 ? (
                <p className="entity-view__readonly">{t('dataModel.noSearchMatch')}</p>
              ) : (
                <>
                  <div className="ds-table-wrap ds-table-wrap--flush">
                    <table className="console-table">
                      <thead>
                        <tr>
                          <th>{t('datasets.fieldName')}</th>
                          <th>{t('datasets.fieldSource')}</th>
                          <th>{t('datasets.colDataType')}</th>
                          <th>{t('dataModel.fieldDimension')}</th>
                          <th>{t('dataModel.fieldLabel')}</th>
                          <th>{t('datasets.fieldAiContext')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <strong>{f.name}</strong>
                            </td>
                            <td>
                              {f.column_name ? f.column_name : <code>{fieldExpressionSql(f)}</code>}
                            </td>
                            <td>{f.datatype ?? t('datasets.dash')}</td>
                            <td>{dimensionLabel(f)}</td>
                            <td>{f.label ?? t('datasets.dash')}</td>
                            <td>
                              {typeof f.ai_context?.instructions === 'string' &&
                              f.ai_context.instructions
                                ? String(f.ai_context.instructions)
                                : t('datasets.dash')}
                            </td>
                            <td className="dataset-field-row__actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEdit(f)}
                                title={t('datasets.editField')}
                              >
                                {t('shared.edit')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => void handleDelete(f)}
                                title={t('shared.delete')}
                              >
                                <Trash2 size={14} aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    total={shown.length}
                    page={safePage}
                    pageSize={PAGE_SIZE}
                    pageSizeOptions={[PAGE_SIZE]}
                    onPageChange={(next) => setPages((prev) => ({ ...prev, [ref.id]: next }))}
                    onPageSizeChange={() => undefined}
                  />
                </>
              )}
            </EntityViewPanel>
          );
        })
      )}

      <Dialog
        open={Boolean(formDatasetId)}
        onClose={closeForm}
        closeDisabled={submitting}
        title={
          <>
            {editing ? t('datasets.editField') : t('datasets.addField')}
            {formDataset ? ` · ${datasetLabel(formDataset)}` : ''}
          </>
        }
        closeAriaLabel={t('datasets.closeAria')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeForm}
              disabled={submitting}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
      >
        <div className="entity-view__form">
          <FormField label={t('datasets.fieldName')}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t('dataModel.fieldLabel')}>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.fieldSource')}>
            <select
              value={mode}
              onChange={(e) => {
                const next = e.target.value as 'column' | 'computed';
                setMode(next);
                if (next === 'column' && !columnName && columns[0]) {
                  setColumnName(columns[0].column_name);
                }
              }}
            >
              <option value="column">{t('datasets.fieldSourceColumn')}</option>
              <option value="computed">{t('datasets.fieldSourceComputed')}</option>
            </select>
          </FormField>
          {mode === 'column' ? (
            <FormField label={t('datasets.colColumn')}>
              <select value={columnName} onChange={(e) => setColumnName(e.target.value)}>
                <option value="">{t('datasets.selectColumn')}</option>
                {columns.map((c) => (
                  <option key={c.column_name} value={c.column_name}>
                    {c.column_name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <FormField
              label={t('datasets.fieldExpression')}
              hint={t('datasets.fieldExpressionHint')}
            >
              <textarea rows={2} value={exprSql} onChange={(e) => setExprSql(e.target.value)} />
            </FormField>
          )}
          <FormField label={t('datasets.colDataType')} hint={t('dataModel.fieldDatatypeHint')}>
            <select value={datatype} onChange={(e) => setDatatype(e.target.value)}>
              <option value="">{t('datasets.dash')}</option>
              {OSSIE_DATATYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('dataModel.fieldDescription')}>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField
            label={t('dataModel.fieldDimension')}
            hint={t('dataModel.fieldDimensionHint')}
          >
            <select
              value={dimensionMode}
              onChange={(e) =>
                setDimensionMode(e.target.value as 'auto' | 'time' | 'regular')
              }
            >
              <option value="auto">{t('dataModel.dimensionAuto')}</option>
              <option value="time">{t('dataModel.dimensionYes')}</option>
              <option value="regular">{t('dataModel.dimensionNo')}</option>
            </select>
          </FormField>
          <FormField label={t('datasets.aiInstructions')}>
            <textarea
              rows={2}
              value={ai.instructions}
              onChange={(e) => setAi((prev) => ({ ...prev, instructions: e.target.value }))}
            />
          </FormField>
          <FormField label={t('datasets.aiSynonyms')}>
            <input
              type="text"
              value={ai.synonyms}
              onChange={(e) => setAi((prev) => ({ ...prev, synonyms: e.target.value }))}
            />
          </FormField>
          <FormField label={t('datasets.aiExamples')}>
            <input
              type="text"
              value={ai.examples}
              onChange={(e) => setAi((prev) => ({ ...prev, examples: e.target.value }))}
            />
          </FormField>
        </div>
      </Dialog>

    </>
  );
}
