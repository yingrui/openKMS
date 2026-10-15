import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import {
  fetchDatasetMetadata,
  fetchDatasets,
  type ColumnMetadata,
  type DatasetResponse,
} from '../../data/datasetsApi';
import {
  createDatasetJoin,
  deleteDatasetJoin,
  fetchDatasetJoins,
  type DatasetJoinResponse,
} from '../../data/joinsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';
import { DatasetErDiagram, type ErNode } from './DatasetErDiagram';

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
  const [required, setRequired] = useState(false);
  const [pairs, setPairs] = useState<ColumnPair[]>([{ from: '', to: '' }]);
  const [joinName, setJoinName] = useState('');
  const [description, setDescription] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiSynonyms, setAiSynonyms] = useState('');
  const [aiExamples, setAiExamples] = useState('');
  const [targetColumns, setTargetColumns] = useState<ColumnMetadata[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  const openCreate = () => {
    setTargetId('');
    setDirection('from');
    setRequired(false);
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
    setSubmitting(true);
    try {
      const synonyms = aiSynonyms.split(',').map((x) => x.trim()).filter(Boolean);
      const examples = aiExamples.split(',').map((x) => x.trim()).filter(Boolean);
      await createDatasetJoin({
        name: joinName.trim() || null,
        from_dataset_id: direction === 'from' ? datasetId : targetId,
        to_dataset_id: direction === 'from' ? targetId : datasetId,
        from_columns: usable.map((p) => p.from),
        to_columns: usable.map((p) => p.to),
        required,
        description: description.trim() || null,
        ai_context:
          aiInstructions.trim() || synonyms.length || examples.length
            ? { instructions: aiInstructions.trim(), synonyms, examples }
            : null,
      });
      toast.success(t('datasets.joinCreated'));
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.joinCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.joinDeleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDatasetJoin(id);
      toast.success(t('datasets.joinDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.joinDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const centerLabel = dataset.display_name?.trim() || `${dataset.schema_name}.${dataset.table_name}`;

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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void handleDelete(j.id)}
                  title={t('shared.delete')}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))
          )}
        </div>
      </EntityViewPanel>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('datasets.addRelationship')}
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
            {submitting ? <Loader2 size={16} className="console-loading-spinner" /> : t('datasets.joinCreate')}
          </button>
          </>
        }
      >
        <div className="entity-view__form">
          <FormField label={t('datasets.joinTargetDataset')}>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">{t('datasets.selectTable')}</option>
              {otherDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name || `${d.schema_name}.${d.table_name}`}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('datasets.joinDirection')}>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'from' | 'to')}
            >
              <option value="from">{t('datasets.directionThisFrom')}</option>
              <option value="to">{t('datasets.directionThisTo')}</option>
            </select>
          </FormField>
          <label className="ds-check-row">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span>{t('datasets.joinRequired')}</span>
          </label>
          <p className="page-subtitle">{t('datasets.joinRequiredHint')}</p>
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
