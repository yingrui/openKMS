import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import {
  fetchDatasetMetadata,
  fetchDatasetProfile,
  type DatasetProfileResponse,
  fetchDatasets,
  type ColumnMetadata,
  type DatasetResponse,
} from '../../data/datasetsApi';
import {
  createDatasetJoin,
  updateDatasetJoin,
  deleteDatasetJoin,
  fetchDatasetJoins,
  type DatasetJoinResponse,
} from '../../data/joinsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, EmptyState, StatusChip, FormField } from '../../styles/design-system/index';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from '../shared/EntityViewShell';
import { DatasetErDiagram, type ErNode } from './DatasetErDiagram';
import { datasetLabel } from './datasetLabel';

/** A column pair: `from` = FK column, `to` = referenced key column. */
type ColumnPair = { from: string; to: string };

export function DatasetRelationshipsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const confirm = useConfirm();

  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [thisColumns, setThisColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [direction, setDirection] = useState<'from' | 'to'>('from');
  const [required, setRequired] = useState(true);
  const [pairs, setPairs] = useState<ColumnPair[]>([{ from: '', to: '' }]);
  const [joinName, setJoinName] = useState('');
  const [description, setDescription] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiSynonyms, setAiSynonyms] = useState('');
  const [aiExamples, setAiExamples] = useState('');
  const [targetColumns, setTargetColumns] = useState<ColumnMetadata[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toProfile, setToProfile] = useState<DatasetProfileResponse | null>(null);
  const [editing, setEditing] = useState<DatasetJoinResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, ds, meta] = await Promise.all([
        fetchDatasetJoins(datasetId),
        fetchDatasets(),
        fetchDatasetMetadata(datasetId),
      ]);
      setJoins(j.items);
      setDatasets(ds.items);
      setThisColumns(meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!targetId) {
      setTargetColumns([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetMetadata(targetId)
      .then((m) => !cancelled && setTargetColumns(m))
      .catch(() => !cancelled && setTargetColumns([]));
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const otherDatasets = useMemo(
    () => datasets.filter((d) => d.id !== datasetId),
    [datasets, datasetId],
  );

  // The `from` side holds the FK. When this dataset holds it, `from` columns come
  // from here; otherwise the selected dataset does.
  /* The `to` side is what a join multiplies by, so its uniqueness is the number that matters while filling the
     form — not an error the reader meets after ten fields. */
  const toDatasetId = direction === 'from' ? targetId : datasetId;

  useEffect(() => {
    if (!toDatasetId) {
      setToProfile(null);
      return;
    }
    let cancelled = false;
    void fetchDatasetProfile(toDatasetId)
      .then((p) => !cancelled && setToProfile(p))
      .catch(() => !cancelled && setToProfile(null));
    return () => {
      cancelled = true;
    };
  }, [toDatasetId]);

  const uniquenessOf = (column: string) => {
    const stat = (toProfile?.column_stats ?? []).find((entry) => entry.column === column);
    if (!toProfile?.computed_at || !stat || stat.distinct_count === null || toProfile.row_count === null) {
      return { state: 'unknown' as const };
    }
    const rows = toProfile.row_count - (stat.null_count ?? 0);
    return {
      state: stat.distinct_count === rows ? ('unique' as const) : ('repeated' as const),
      rows,
      distinct: stat.distinct_count,
    };
  };

  const pairFromCols = direction === 'from' ? thisColumns : targetColumns;
  const pairToCols = direction === 'from' ? targetColumns : thisColumns;

  const erNodes: ErNode[] = useMemo(
    () =>
      joins.map((j) => {
        const other = j.from_dataset_id === datasetId ? j.to_dataset_name : j.from_dataset_name;
        return {
          id: j.id,
          label: other ?? t('datasets.dash'),
          meta: j.required ? t('datasets.requiredLabel') : t('datasets.optionalLabel'),
          columns: `${j.from_columns.join(', ')} → ${j.to_columns.join(', ')}`,
        };
      }),
    [joins, datasetId, t],
  );

  const openEdit = (join: DatasetJoinResponse) => {
    const thisIsFrom = join.from_dataset_id === datasetId;
    setEditing(join);
    setTargetId(thisIsFrom ? join.to_dataset_id : join.from_dataset_id);
    setDirection(thisIsFrom ? 'from' : 'to');
    setRequired(join.required);
    const own = thisIsFrom ? join.from_columns : join.to_columns;
    const other = thisIsFrom ? join.to_columns : join.from_columns;
    setPairs(own.map((column, index) => ({ from: column, to: other[index] ?? '' })));
    setJoinName(join.name ?? '');
    setDescription(join.description ?? '');
    const ai = (join.ai_context ?? {}) as { instructions?: string; synonyms?: string[]; examples?: string[] };
    setAiInstructions(ai.instructions ?? '');
    setAiSynonyms((ai.synonyms ?? []).join(', '));
    setAiExamples((ai.examples ?? []).join(', '));
    setFormError(null);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditing(null);
    setTargetId('');
    setDirection('from');
    setRequired(true);
    setPairs([{ from: '', to: '' }]);
    setJoinName('');
    setDescription('');
    setAiInstructions('');
    setAiSynonyms('');
    setAiExamples('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!targetId) {
      toast.error(t('datasets.joinTargetRequired'));
      return;
    }
    const usable = pairs.filter((p) => p.from && p.to);
    if (usable.length === 0) {
      toast.error(t('datasets.joinColumnsRequired'));
      return;
    }
    if (new Set(usable.map((p) => p.from)).size !== usable.length) {
      setFormError(t('datasets.joinDuplicateColumns'));
      return;
    }
    setSubmitting(true);
    try {
      const synonyms = aiSynonyms.split(',').map((x) => x.trim()).filter(Boolean);
      const examples = aiExamples.split(',').map((x) => x.trim()).filter(Boolean);
      const ai =
        aiInstructions.trim() || synonyms.length || examples.length
          ? { instructions: aiInstructions.trim(), synonyms, examples }
          : null;
      if (editing) {
        await updateDatasetJoin(editing.id, {
          name: joinName.trim() || null,
          from_columns: usable.map((p) => p.from),
          to_columns: usable.map((p) => p.to),
          required,
          description: description.trim() || null,
          ai_context: ai,
        });
        toast.success(t('datasets.joinEdited'));
        setShowForm(false);
        setEditing(null);
        setFormError(null);
        await load();
        return;
      }
      await createDatasetJoin({
        name: joinName.trim() || null,
        from_dataset_id: direction === 'from' ? datasetId : targetId,
        to_dataset_id: direction === 'from' ? targetId : datasetId,
        from_columns: usable.map((p) => p.from),
        to_columns: usable.map((p) => p.to),
        required,
        description: description.trim() || null,
        ai_context: ai,
      });
      toast.success(t('datasets.joinCreated'));
      setShowForm(false);
      setFormError(null);
      await load();
    } catch (e) {
      /* A refused relationship is a statement about the *fields just chosen*, so it stays in the form:
         a toast disappears while the reader is still looking for what to change. */
      setFormError(e instanceof Error ? e.message : t('datasets.joinCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (join: DatasetJoinResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.joinDeleteConfirm', {
          from: join.from_dataset_name ?? join.from_dataset_id,
          to: join.to_dataset_name ?? join.to_dataset_id,
        }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDatasetJoin(join.id);
      toast.success(t('datasets.joinDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.joinDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const centerLabel = datasetLabel(dataset);

  return (
    <>
      <EntityViewHeader title={t('datasets.relationships')} subtitle={t('datasets.relationshipsHint')} />
      <EntityViewPanel>
        <DatasetErDiagram
          centerLabel={centerLabel}
          nodes={erNodes}
          emptyLabel={t('datasets.relationshipsEmpty')}
        />
      </EntityViewPanel>
      <EntityViewPanel>
        <div className="dataset-joins">
          <div className="dataset-joins__toolbar">
            <h3>{t('datasets.relationshipList')}</h3>
            <button type="button" className="btn btn-secondary" onClick={openCreate}>
              <Plus size={16} aria-hidden />
              {t('datasets.addRelationship')}
            </button>
          </div>
          {joins.length === 0 ? (
            <EmptyState title={t('datasets.relationshipsEmpty')} description={t('datasets.relationshipsHint')} />
          ) : (
            joins.map((j) => (
              <div key={j.id} className="dataset-join-row">
                <div className="dataset-join-row__main">
                  <strong>
                    {j.name ||
                      `${j.from_dataset_name ?? j.from_dataset_id} → ${
                        j.to_dataset_name ?? j.to_dataset_id
                      }`}
                  </strong>
                  <p className="dataset-join-row__meta">
                    {j.required ? t('datasets.requiredLabel') : t('datasets.optionalLabel')} ·{' '}
                    {j.from_columns.map((c, i) => `${c} = ${j.to_columns[i] ?? ''}`).join(', ')}
                  </p>
                </div>
                <div className="dataset-join-row__actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openEdit(j)}
                    title={t('datasets.joinEdit')}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleDelete(j)}
                    title={t('shared.delete')}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </EntityViewPanel>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={editing ? t('datasets.joinEditTitle') : t('datasets.addRelationship')}
        closeAriaLabel={t('datasets.closeAria')}
        size="md"
        footer={
          <>
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
            onClick={() => void handleCreate()}
            disabled={submitting || !targetId}
          >
            {submitting ? <Loader2 size={16} className="ds-loading__spinner" /> : t('datasets.joinCreate')}
          </button>
          </>
        }
      >
        <div className="entity-view__form">
          {formError ? (
            <p className="dataset-joins__error" role="alert">
              {formError}
            </p>
          ) : null}
          {editing ? (
            <p className="page-subtitle">{t('datasets.joinEditHint')}</p>
          ) : null}
          <FormField label={t('datasets.joinTargetDataset')}>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={editing !== null}
            >
              <option value="">{t('datasets.selectTable')}</option>
              {otherDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {datasetLabel(d)}
                </option>
              ))}
            </select>
          </FormField>
          <fieldset className="dataset-joins__direction" disabled={editing !== null}>
            <legend>{t('datasets.joinDirection')}</legend>
            {(
              [
                ['from', 'datasets.directionThisFrom'],
                ['to', 'datasets.directionThisTo'],
              ] as const
            ).map(([value, key]) => (
              <label key={value} className="ds-check-row">
                <input
                  type="radio"
                  name="join-direction"
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                />
                <span>{t(key)}</span>
              </label>
            ))}
          </fieldset>
          <label className="ds-check-row">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span>{t('datasets.joinCardinality')}</span>
          </label>
          <p className="page-subtitle">{t('datasets.joinCardinalityHint')}</p>
          <div className="dataset-joins__pairs">
            <span>{t('datasets.joinColumns')}</span>
            {pairs.map((pair, idx) => (
              <div key={idx} className="dataset-joins__pair">
                <select
                  className="ds-control"
                  value={pair.from}
                  onChange={(e) =>
                    setPairs((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, from: e.target.value } : p)),
                    )
                  }
                >
                  <option value="">{t('datasets.joinColumnPlaceholder')}</option>
                  {pairFromCols.map((c) => (
                    <option key={c.column_name} value={c.column_name}>
                      {c.column_name}
                    </option>
                  ))}
                </select>
                <span className="dataset-joins__eq">=</span>
                <select
                  className="ds-control"
                  value={pair.to}
                  onChange={(e) =>
                    setPairs((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, to: e.target.value } : p)),
                    )
                  }
                  disabled={!targetId}
                >
                  <option value="">{t('datasets.joinColumnPlaceholder')}</option>
                  {pairToCols.map((c) => (
                    <option key={c.column_name} value={c.column_name}>
                      {c.column_name}
                    </option>
                  ))}
                </select>
                {pairs.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPairs((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPairs((prev) => [...prev, { from: '', to: '' }])}
            >
              <Plus size={16} aria-hidden />
              {t('datasets.joinAddPair')}
            </button>
          </div>
          {targetId && pairs.some((p) => p.from && p.to) ? (
            <p className="dataset-joins__sentence">
              {t('datasets.joinSentence', {
                from: direction === 'from' ? datasetLabel(dataset) : (otherDatasets.find((d) => d.id === targetId) ? datasetLabel(otherDatasets.find((d) => d.id === targetId)!) : targetId),
                to: direction === 'from' ? (otherDatasets.find((d) => d.id === targetId) ? datasetLabel(otherDatasets.find((d) => d.id === targetId)!) : targetId) : datasetLabel(dataset),
                pairs: pairs
                  .filter((p) => p.from && p.to)
                  .map((p) => (direction === 'from' ? `${p.from} = ${p.to}` : `${p.to} = ${p.from}`))
                  .join('，'),
                existence: required
                  ? t('datasets.joinSentenceRequired')
                  : t('datasets.joinSentenceOptional'),
              })}
            </p>
          ) : null}
          {pairs.filter((p) => p.to).length > 0 ? (
            <div className="dataset-joins__uniqueness">
              <span className="dataset-joins__uniqueness-label">{t('datasets.joinTargetUnique')}</span>
              {[...new Set(pairs.map((p) => p.to).filter(Boolean))].map((column) => {
                const check = uniquenessOf(column);
                return (
                  <span
                    key={column}
                    className={`dataset-joins__uniqueness-item dataset-joins__uniqueness-item--${check.state}`}
                  >
                    <StatusChip tone={check.state === 'unique' ? 'ok' : check.state === 'repeated' ? 'warn' : undefined}>
                      {column}
                    </StatusChip>
                    {check.state === 'unique'
                      ? t('datasets.joinUniqueOk')
                      : check.state === 'repeated'
                        ? t('datasets.joinNotUnique', { rows: check.rows, distinct: check.distinct })
                        : t('datasets.joinUniqueUnknown')}
                  </span>
                );
              })}
            </div>
          ) : null}
          <FormField label={t('datasets.joinName')}>
            <input type="text" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.joinDescription')}>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
          <FormField label={t('datasets.aiInstructions')} hint={t('datasets.relationshipAiHint')}>
            <textarea
              rows={2}
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
            />
          </FormField>
          <FormField label={t('datasets.aiSynonyms')}>
            <input
              type="text"
              value={aiSynonyms}
              onChange={(e) => setAiSynonyms(e.target.value)}
            />
          </FormField>
          <FormField label={t('datasets.aiExamples')}>
            <input
              type="text"
              value={aiExamples}
              onChange={(e) => setAiExamples(e.target.value)}
            />
          </FormField>
        
        </div>
      </Dialog>

    </>
  );
}
