import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasetMetadata, type ColumnMetadata } from '../../data/datasetsApi';
import {
  OSSIE_DATATYPES,
  createModelField,
  deleteModelField,
  fetchModelFields,
  fieldExpressionSql,
  isTemporalDatatype,
  updateModelField,
  type SemanticModelFieldResponse,
} from '../../data/semanticModelFieldsApi';
import type { SemanticModelDatasetRef } from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField, Pagination, PanelToolbar } from '../../styles/design-system';

type AiContext = { instructions: string; synonyms: string; examples: string };
/** The spec's three dimension states: `is_time` omitted / true / false. */
type DimensionMode = 'auto' | 'time' | 'regular';

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function readAiContext(raw: unknown): AiContext {
  const o = (raw ?? {}) as { instructions?: string; synonyms?: string[]; examples?: string[] };
  return {
    instructions: o.instructions ?? '',
    synonyms: (o.synonyms ?? []).join(', '),
    examples: (o.examples ?? []).join(', '),
  };
}

/** Model → Fields: the model's fields (column ref / expression + Ossie `is_time` dimension). */
export function ModelFieldsSection({
  semanticModelId,
  datasets,
  openCreateSignal = 0,
  onChanged,
}: {
  semanticModelId: string;
  datasets: SemanticModelDatasetRef[];
  openCreateSignal?: number;
  onChanged?: () => void;
}) {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();

  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SemanticModelFieldResponse | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'column' | 'computed'>('column');
  const [columnName, setColumnName] = useState('');
  const [exprSql, setExprSql] = useState('');
  const [datatype, setDatatype] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [dimensionMode, setDimensionMode] = useState<DimensionMode>('auto');
  const [ai, setAi] = useState<AiContext>({ instructions: '', synonyms: '', examples: '' });
  const [submitting, setSubmitting] = useState(false);

  const datasetLabel = (id: string) =>
    datasets.find((d) => d.id === id)?.name ?? t('dataModel.outOfScope');

  const filtered = fields.filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [f.name, f.label ?? '', f.column_name ?? '', datasetLabel(f.dataset_id)]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const resetPaging = () => setPage(0);

  /**
   * Only the *time* role is modelled by the spec (`dimension.is_time`). A field that is not
   * a time dimension is simply a field — it is not labelled a "dimension".
   */
  const dimensionLabel = (f: SemanticModelFieldResponse) => {
    if (f.dimension?.is_time === true) return t('dataModel.dimensionYes');
    if (f.dimension?.is_time === false) return t('datasets.dash');
    return isTemporalDatatype(f.datatype) ? t('dataModel.dimensionTimeByType') : t('datasets.dash');
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields((await fetchModelFields(semanticModelId)).items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFieldsFailed'));
    } finally {
      setLoading(false);
    }
  }, [semanticModelId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!datasetId) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetMetadata(datasetId)
      .then((m) => !cancelled && setColumns(m))
      .catch(() => !cancelled && setColumns([]));
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const resetForm = useCallback(() => {
    setDatasetId(datasets[0]?.id ?? '');
    setName('');
    setMode('column');
    setColumnName('');
    setExprSql('');
    setDatatype('');
    setLabel('');
    setDescription('');
    setDimensionMode('auto');
    setAi({ instructions: '', synonyms: '', examples: '' });
  }, [datasets]);

  const openCreate = useCallback(() => {
    setEditing(null);
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  useEffect(() => {
    if (openCreateSignal > 0) openCreate();
  }, [openCreateSignal, openCreate]);

  const openEdit = (f: SemanticModelFieldResponse) => {
    setEditing(f);
    setDatasetId(f.dataset_id);
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
    setAi(readAiContext(f.ai_context));
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.fieldNameRequired'));
      return;
    }
    if (!datasetId) {
      toast.error(t('datasets.pickDataset'));
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
      dataset_id: datasetId,
      name: name.trim(),
      column_name: mode === 'column' ? columnName : null,
      expression,
      datatype: datatype || null,
      label: label.trim() || null,
      description: description.trim() || null,
      // The spec's tri-state: omitted follows `datatype`; explicit true/false wins.
      dimension: dimensionMode === 'auto' ? null : { is_time: dimensionMode === 'time' },
      ai_context: hasAi ? { instructions: ai.instructions.trim(), synonyms, examples } : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateModelField(semanticModelId, editing.id, payload);
        toast.success(t('datasets.fieldSaved'));
      } else {
        await createModelField(semanticModelId, payload);
        toast.success(t('datasets.fieldCreated'));
      }
      setShowForm(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: SemanticModelFieldResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.fieldDeleteConfirm', { name: f.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteModelField(semanticModelId, f.id);
      toast.success(t('datasets.fieldDeleted'));
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldDeleteFailed'));
    }
  };

  return (
    <section>
      <PanelToolbar
        leading={<span>{t('dataModel.fields')}</span>}
        actions={
          <>
            <div className="console-datasets-search">
              <Search size={18} aria-hidden />
              <input
                type="search"
                aria-label={t('datasets.searchAria')}
                placeholder={t('datasets.fieldSearchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPaging();
                }}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={18} aria-hidden />
              <span>{t('datasets.addField')}</span>
            </button>
          </>
        }
      />

      {loading ? (
        <div className="console-loading">
          <Loader2 size={28} className="console-loading-spinner" aria-hidden />
          <p>{t('shared.loading')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="entity-view__readonly">{t('dataModel.fieldsEmptyHint')}</p>
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.fieldName')}</th>
                <th>{t('datasets.modelDatasets')}</th>
                <th>{t('datasets.fieldSource')}</th>
                <th>{t('datasets.colDataType')}</th>
                <th>{t('dataModel.fieldDimension')}</th>
                <th>{t('datasets.fieldAiContext')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.name}</strong>
                    {f.label ? <span className="model-field__label">{f.label}</span> : null}
                  </td>
                  <td>{datasetLabel(f.dataset_id)}</td>
                  <td>{f.column_name ? f.column_name : <code>{fieldExpressionSql(f)}</code>}</td>
                  <td>{f.datatype ?? t('datasets.dash')}</td>
                  <td>{dimensionLabel(f)}</td>
                  <td>
                    {typeof f.ai_context?.instructions === 'string' && f.ai_context.instructions
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
                      <Pencil size={14} aria-hidden />
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
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              resetPaging();
            }}
          />
        </div>
      )}

      {showForm && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editing ? t('datasets.editField') : t('datasets.addField')}</h2>
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
                aria-label={t('datasets.closeAria')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="console-modal-body">
              <FormField label={t('datasets.modelDatasets')}>
                <select
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  disabled={Boolean(editing)}
                >
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('datasets.fieldName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
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
              <FormField label={t('dataModel.fieldLabel')}>
                <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
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
                  onChange={(e) => setDimensionMode(e.target.value as DimensionMode)}
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
            <div className="console-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowForm(false)}
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
                {submitting ? (
                  <Loader2 size={16} className="console-loading-spinner" />
                ) : (
                  t('shared.save')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
