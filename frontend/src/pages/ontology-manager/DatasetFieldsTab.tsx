import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetMetadata,
  fetchDatasetProfile,
  refreshDatasetProfile,
  type ColumnMetadata,
  type DatasetProfileResponse,
} from '../../data/datasetsApi';
import {
  createDatasetField,
  deleteDatasetField,
  fetchDatasetFields,
  fieldExpressionSql,
  syncDatasetFields,
  updateDatasetField,
  type DatasetFieldResponse,
} from '../../data/fieldsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';

type AiContext = { instructions: string; synonyms: string; examples: string };

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

/** Dataset fields (the semantic layer) plus the physical columns + profile below. */
export function DatasetFieldsTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const confirm = useConfirm();

  const [fields, setFields] = useState<DatasetFieldResponse[]>([]);
  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiling, setProfiling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DatasetFieldResponse | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'column' | 'computed'>('column');
  const [columnName, setColumnName] = useState('');
  const [exprSql, setExprSql] = useState('');
  const [datatype, setDatatype] = useState('');
  const [isTime, setIsTime] = useState(false);
  const [ai, setAi] = useState<AiContext>({ instructions: '', synonyms: '', examples: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const [f, cols, prof] = await Promise.all([
        fetchDatasetFields(datasetId),
        fetchDatasetMetadata(datasetId),
        fetchDatasetProfile(datasetId).catch(() => null),
      ]);
      setFields(f.items);
      setMetadata(cols);
      setProfile(prof);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFieldsFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setMode('column');
    setColumnName(metadata[0]?.column_name ?? '');
    setExprSql('');
    setDatatype(metadata[0]?.ontology_type ?? '');
    setIsTime(false);
    setAi({ instructions: '', synonyms: '', examples: '' });
    setShowForm(true);
  };

  const openEdit = (f: DatasetFieldResponse) => {
    setEditing(f);
    setName(f.name);
    setMode(f.column_name ? 'column' : 'computed');
    setColumnName(f.column_name ?? '');
    setExprSql(fieldExpressionSql(f));
    setDatatype(f.datatype ?? '');
    setIsTime(Boolean(f.dimension?.is_time));
    setAi(readAiContext(f.ai_context));
    setShowForm(true);
  };

  const handleSubmit = async () => {
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
          ? { dialects: { ANSI_SQL: exprSql.trim() } }
          : null
        : columnName
          ? { dialects: { ANSI_SQL: `"${columnName}"` } }
          : null;
    const payload = {
      name: name.trim(),
      column_name: mode === 'column' ? columnName : null,
      expression,
      datatype: datatype.trim() || null,
      dimension: isTime ? { is_time: true } : null,
      ai_context: hasAi ? { instructions: ai.instructions.trim(), synonyms, examples } : null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateDatasetField(datasetId, editing.id, payload);
        toast.success(t('datasets.fieldSaved'));
      } else {
        await createDatasetField(datasetId, payload);
        toast.success(t('datasets.fieldCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (f: DatasetFieldResponse) => {
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
      await deleteDatasetField(datasetId, f.id);
      toast.success(t('datasets.fieldDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldDeleteFailed'));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { added } = await syncDatasetFields(datasetId);
      toast.success(t('datasets.fieldsSynced', { n: added }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.fieldsSyncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const refreshProfile = async () => {
    if (!datasetId) return;
    setProfiling(true);
    try {
      setProfile(await refreshDatasetProfile(datasetId));
      toast.success(t('datasets.profileRefreshed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.profileFailed'));
    } finally {
      setProfiling(false);
    }
  };

  const statsByColumn = useMemo(
    () => new Map((profile?.column_stats ?? []).map((s) => [s.column, s])),
    [profile],
  );
  const fmt = (v: unknown) => (v === null || v === undefined ? t('datasets.dash') : String(v));

  return (
    <>
      <EntityViewHeader title={t('datasets.fields')} subtitle={t('datasets.fieldsHint')} />
      <EntityViewPanel>
        <div className="dataset-columns__toolbar">
          <h3>{t('datasets.fieldList')}</h3>
          <div className="dataset-columns__actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 size={14} className="console-loading-spinner" aria-hidden />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
              {t('datasets.syncFields')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={14} aria-hidden />
              {t('datasets.addField')}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.fieldName')}</th>
                  <th>{t('datasets.fieldSource')}</th>
                  <th>{t('datasets.colDataType')}</th>
                  <th>{t('datasets.fieldRole')}</th>
                  <th>{t('datasets.fieldAiContext')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="console-table-empty">
                      {t('datasets.emptyFields')}
                    </td>
                  </tr>
                ) : (
                  fields.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.name}</strong>
                      </td>
                      <td>
                        {f.column_name ? (
                          f.column_name
                        ) : (
                          <code>{fieldExpressionSql(f)}</code>
                        )}
                      </td>
                      <td>{f.datatype ?? t('datasets.dash')}</td>
                      <td>{f.dimension?.is_time ? t('datasets.fieldIsTime') : t('datasets.dash')}</td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="dataset-columns__toolbar">
          <h3>{t('datasets.physicalColumns')}</h3>
          <div className="dataset-columns__actions">
            <span>
              {profile?.computed_at
                ? t('datasets.profileComputedAt', { time: profile.computed_at })
                : t('datasets.profileEmpty')}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void refreshProfile()}
              disabled={profiling}
            >
              {profiling ? (
                <Loader2 size={14} className="console-loading-spinner" aria-hidden />
              ) : null}
              {t('datasets.refreshProfile')}
            </button>
          </div>
        </div>
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.colColumn')}</th>
                <th>{t('datasets.colDataType')}</th>
                <th>{t('datasets.colNullable')}</th>
                <th>{t('datasets.colPosition')}</th>
                <th>{t('datasets.colNulls')}</th>
                <th>{t('datasets.colDistinct')}</th>
                <th>{t('datasets.colMin')}</th>
                <th>{t('datasets.colMax')}</th>
              </tr>
            </thead>
            <tbody>
              {metadata.length === 0 ? (
                <tr>
                  <td colSpan={8} className="console-table-empty">
                    {t('datasets.emptyColumns')}
                  </td>
                </tr>
              ) : (
                metadata.map((col) => {
                  const s = statsByColumn.get(col.column_name);
                  return (
                    <tr key={col.column_name}>
                      <td>
                        <strong>{col.column_name}</strong>
                      </td>
                      <td>{col.data_type}</td>
                      <td>{col.is_nullable ? t('datasets.yes') : t('datasets.no')}</td>
                      <td>{col.ordinal_position}</td>
                      <td>{s ? fmt(s.null_count) : t('datasets.dash')}</td>
                      <td>{s ? fmt(s.distinct_count) : t('datasets.dash')}</td>
                      <td>{s ? fmt(s.min) : t('datasets.dash')}</td>
                      <td>{s ? fmt(s.max) : t('datasets.dash')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </EntityViewPanel>

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
              <FormField label={t('datasets.fieldName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label={t('datasets.fieldSource')}>
                <select
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value as 'column' | 'computed';
                    setMode(next);
                    if (next === 'column' && !columnName && metadata[0]) {
                      setColumnName(metadata[0].column_name);
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
                    {metadata.map((c) => (
                      <option key={c.column_name} value={c.column_name}>
                        {c.column_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <FormField label={t('datasets.fieldExpression')} hint={t('datasets.fieldExpressionHint')}>
                  <textarea rows={2} value={exprSql} onChange={(e) => setExprSql(e.target.value)} />
                </FormField>
              )}
              <FormField label={t('datasets.colDataType')}>
                <input
                  type="text"
                  value={datatype}
                  onChange={(e) => setDatatype(e.target.value)}
                  placeholder="string / number / datetime / boolean"
                />
              </FormField>
              <label className="ds-check-row">
                <input type="checkbox" checked={isTime} onChange={(e) => setIsTime(e.target.checked)} />
                <span>{t('datasets.fieldIsTime')}</span>
              </label>
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
    </>
  );
}
