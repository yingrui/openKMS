import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { DatasetErGraph, type ErGraphLink, type ErGraphNode } from './DatasetErGraph';
import { datasetLabel } from './datasetLabel';

/** A column pair: `from` = FK column, `to` = referenced key column. */
type ColumnPair = { from: string; to: string };

export function DatasetRelationshipsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [thisColumns, setThisColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [direction, setDirection] = useState<'from' | 'to'>('from');
  const [required, setRequired] = useState(true);
  const [fromUnique, setFromUnique] = useState(false);
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
  const thisName = datasetLabel(dataset);
  const otherName = otherDatasets.some((d) => d.id === targetId)
    ? datasetLabel(otherDatasets.find((d) => d.id === targetId)!)
    : t('datasets.selectTable');

  const leftName = direction === 'from' ? thisName : otherName;
  const rightName = direction === 'from' ? otherName : thisName;

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

  /* The same diagram as the catalog's ER view: the same boxes, the same crow's foot, the same drag. A dataset's
     relationships are one neighbourhood of that graph, not a different drawing of it. */
  const graphNodes: ErGraphNode[] = useMemo(() => {
    const used = new Map<string, Set<string>>();
    const joinsOf = new Map<string, number>();
    for (const join of joins) {
      for (const [id, own, other] of [
        [join.from_dataset_id, join.from_columns, join.to_columns],
        [join.to_dataset_id, join.to_columns, join.from_columns],
      ] as const) {
        joinsOf.set(id, (joinsOf.get(id) ?? 0) + 1);
        const columns = used.get(id) ?? new Set<string>();
        for (const column of own) columns.add(column);
        for (const column of other) columns.add(column);
        used.set(id, columns);
      }
    }
    const names = new Map<string, string>();
    for (const join of joins) {
      names.set(join.from_dataset_id, join.from_dataset_name ?? join.from_dataset_id);
      names.set(join.to_dataset_id, join.to_dataset_name ?? join.to_dataset_id);
    }
    names.set(datasetId, datasetLabel(dataset));
    return [...names].map(([id, name]) => ({
      id,
      name,
      joins: joinsOf.get(id) ?? 0,
      columns: [...(used.get(id) ?? [])],
    }));
  }, [joins, datasetId, dataset, t]);

  const graphLinks: ErGraphLink[] = useMemo(
    () =>
      joins.map((join) => ({
        source: join.from_dataset_id,
        target: join.to_dataset_id,
        fromColumn: join.from_columns[0],
        toColumn: join.to_columns[0],
        required: join.required,
        fromUnique: join.from_unique,
      })),
    [joins],
  );

  const openEdit = (join: DatasetJoinResponse) => {
    const thisIsFrom = join.from_dataset_id === datasetId;
    setEditing(join);
    setTargetId(thisIsFrom ? join.to_dataset_id : join.from_dataset_id);
    setDirection(thisIsFrom ? 'from' : 'to');
    setRequired(join.required);
    setFromUnique(join.from_unique);
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
    setFromUnique(false);
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
          from_unique: fromUnique,
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
        from_unique: fromUnique,
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

  const openRelated = (id: string) => {
    if (id !== datasetId) navigate(`/datasets/${id}/relationships`);
  };

  return (
    <>
      <EntityViewHeader title={t('datasets.relationships')} subtitle={t('datasets.relationshipsHint')} />
      <EntityViewPanel>
        <DatasetErGraph
          nodes={graphNodes}
          links={graphLinks}
          onOpen={openRelated}
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
                    {j.name || `${j.from_dataset_name ?? j.from_dataset_id} → ${j.to_dataset_name ?? j.to_dataset_id}`}
                  </strong>
                  <p className="dataset-join-row__meta">
                    {t(
                      j.from_unique
                        ? 'datasets.cardOneToOneShort'
                        : j.required
                          ? 'datasets.cardShortNTo1'
                          : 'datasets.cardShortNToZeroOrOne',
                    )} ·{' '}
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
        size="lg"
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
          {editing ? <p className="page-subtitle">{t('datasets.joinEditHint')}</p> : null}
          <FormField label={t('datasets.joinTargetDataset', { name: thisName })}>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={editing !== null}>
              <option value="">{t('datasets.selectTable')}</option>
              {otherDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {datasetLabel(d)}
                </option>
              ))}
            </select>
          </FormField>
          <div className="dataset-joins__summary">
            {targetId ? (
              <>
                <div className="dataset-joins__cardinality">
                  <span className="dataset-joins__cardinality-side" title={leftName}>
                    {leftName}
                  </span>
                  <span className="dataset-joins__cardinality-controls">
                    <select
                      className="ds-control dataset-joins__cardinality-select"
                      value={fromUnique ? '1' : 'N'}
                      onChange={(e) => setFromUnique(e.target.value === '1')}
                      disabled={editing !== null}
                      aria-label={t('datasets.joinCardinalityLeft')}
                    >
                      <option value="N">N</option>
                      <option value="1">1</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm dataset-joins__swap"
                      onClick={() => setDirection((d) => (d === 'from' ? 'to' : 'from'))}
                      disabled={editing !== null}
                      title={t('datasets.joinSwapDirection')}
                      aria-label={t('datasets.joinSwapDirection')}
                    >
                      <ArrowLeftRight size={14} aria-hidden />
                    </button>
                    <select
                      className="ds-control dataset-joins__cardinality-select"
                      value={required ? '1' : '0..1'}
                      onChange={(e) => setRequired(e.target.value === '1')}
                      disabled={editing !== null}
                      aria-label={t('datasets.joinCardinalityRight')}
                    >
                      <option value="1">1</option>
                      <option value="0..1">0..1</option>
                    </select>
                  </span>
                  <span className="dataset-joins__cardinality-side" title={rightName}>
                    {rightName}
                  </span>
                </div>
                <p className="dataset-joins__summary-hint">
                  {t(
                    fromUnique
                      ? required
                        ? 'datasets.cardOneToOneHint'
                        : 'datasets.cardOneToZeroOrOneHint'
                      : required
                        ? 'datasets.cardNTo1Hint'
                        : 'datasets.cardNToZeroOrOneHint',
                    { left: leftName, right: rightName },
                  )}
                </p>
                <p className="dataset-joins__summary-condition">
                  <span className="dataset-joins__summary-label">{t('datasets.joinCondition')}</span>
                  <code>
                    {leftName}.
                    {pairs
                      .filter((p) => p.from && p.to)
                      .map((p) => (direction === 'from' ? p.from : p.to))
                      .join(', ') || '…'}
                    {' = '}
                    {rightName}.
                    {pairs
                      .filter((p) => p.from && p.to)
                      .map((p) => (direction === 'from' ? p.to : p.from))
                      .join(', ') || '…'}
                  </code>
                </p>
              </>
            ) : (
              <p className="dataset-joins__summary-empty">{t('datasets.joinRelationEmpty')}</p>
            )}
          </div>
          <div className="dataset-joins__pairs">
            <span>{t('datasets.joinColumns')}</span>
            {pairs.map((pair, idx) => (
              <div key={idx} className="dataset-joins__pair">
                <span className="dataset-joins__pair-side">{direction === 'from' ? thisName : otherName}</span>
                <select
                  className="ds-control"
                  value={pair.from}
                  onChange={(e) =>
                    setPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, from: e.target.value } : p)))
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
                <span className="dataset-joins__pair-side">{direction === 'from' ? otherName : thisName}</span>
                <select
                  className="ds-control"
                  value={pair.to}
                  onChange={(e) =>
                    setPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, to: e.target.value } : p)))
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
                    <StatusChip
                      tone={check.state === 'unique' ? 'ok' : check.state === 'repeated' ? 'warn' : undefined}
                    >
                      {column}
                    </StatusChip>
                    {check.state === 'unique'
                      ? t('datasets.joinUniqueOk')
                      : check.state === 'repeated'
                        ? t('datasets.joinNotUnique', {
                            rows: check.rows,
                            distinct: check.distinct,
                          })
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
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.aiInstructions')} hint={t('datasets.relationshipAiHint')}>
            <textarea rows={2} value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.aiSynonyms')}>
            <input type="text" value={aiSynonyms} onChange={(e) => setAiSynonyms(e.target.value)} />
          </FormField>
          <FormField label={t('datasets.aiExamples')}>
            <input type="text" value={aiExamples} onChange={(e) => setAiExamples(e.target.value)} />
          </FormField>
        </div>
      </Dialog>
    </>
  );
}
