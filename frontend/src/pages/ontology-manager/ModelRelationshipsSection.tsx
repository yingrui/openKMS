import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
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
  updateDatasetJoin,
  type DatasetJoinResponse,
} from '../../data/joinsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField } from '../../styles/design-system';

type ColumnPair = { from: string; to: string };

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

/** Model → Semantic model: author dataset→dataset FK relationships (global editor). */
export function ModelRelationshipsSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();

  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DatasetJoinResponse | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [fromColumns, setFromColumns] = useState<ColumnMetadata[]>([]);
  const [toColumns, setToColumns] = useState<ColumnMetadata[]>([]);
  const [pairs, setPairs] = useState<ColumnPair[]>([{ from: '', to: '' }]);
  const [required, setRequired] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ds, j] = await Promise.all([fetchDatasets(), fetchDatasetJoins()]);
      setDatasets(ds.items);
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!fromId) {
      setFromColumns([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetMetadata(fromId)
      .then((m) => !cancelled && setFromColumns(m))
      .catch(() => !cancelled && setFromColumns([]));
    return () => {
      cancelled = true;
    };
  }, [fromId]);

  useEffect(() => {
    if (!toId) {
      setToColumns([]);
      return;
    }
    let cancelled = false;
    void fetchDatasetMetadata(toId)
      .then((m) => !cancelled && setToColumns(m))
      .catch(() => !cancelled && setToColumns([]));
    return () => {
      cancelled = true;
    };
  }, [toId]);

  const label = useMemo(
    () => new Map(datasets.map((d) => [d.id, datasetLabel(d)])),
    [datasets],
  );

  const openCreate = () => {
    setEditing(null);
    setFromId(datasets[0]?.id ?? '');
    setToId('');
    setPairs([{ from: '', to: '' }]);
    setRequired(false);
    setName('');
    setDescription('');
    setShowForm(true);
  };

  const openEdit = (j: DatasetJoinResponse) => {
    setEditing(j);
    setFromId(j.from_dataset_id);
    setToId(j.to_dataset_id);
    setRequired(j.required);
    setPairs(
      j.from_columns.length
        ? j.from_columns.map((c, i) => ({ from: c, to: j.to_columns[i] ?? '' }))
        : [{ from: '', to: '' }],
    );
    setName(j.name ?? '');
    setDescription(j.description ?? '');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!fromId || !toId) {
      toast.error(t('dataModel.pickDatasets'));
      return;
    }
    const usable = pairs.filter((p) => p.from && p.to);
    if (usable.length === 0) {
      toast.error(t('datasets.joinColumnsRequired'));
      return;
    }
    const payload = {
      from_columns: usable.map((p) => p.from),
      to_columns: usable.map((p) => p.to),
      required,
      name: name.trim() || null,
      description: description.trim() || null,
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateDatasetJoin(editing.id, payload);
      } else {
        await createDatasetJoin({
          ...payload,
          from_dataset_id: fromId,
          to_dataset_id: toId,
        });
      }
      toast.success(editing ? t('datasets.joinSaved') : t('datasets.joinCreated'));
      setShowForm(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.joinCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (j: DatasetJoinResponse) => {
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
      await deleteDatasetJoin(j.id);
      toast.success(t('datasets.joinDeleted'));
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.joinDeleteFailed'));
    }
  };

  return (
    <>
      <div className="dataset-columns__toolbar">
        <h3>{t('dataModel.relationships')}</h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={14} aria-hidden />
          {t('datasets.addRelationship')}
        </button>
      </div>

      {loading ? (
        <div className="console-loading">
          <Loader2 size={28} className="console-loading-spinner" aria-hidden />
          <p>{t('shared.loading')}</p>
        </div>
      ) : joins.length === 0 ? (
        <p className="entity-view__readonly">{t('datasets.relationshipsEmpty')}</p>
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('dataModel.colFrom')}</th>
                <th>{t('dataModel.colTo')}</th>
                <th>{t('datasets.joinColumns')}</th>
                <th>{t('dataModel.required')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {joins.map((j) => (
                <tr key={j.id}>
                  <td>{j.from_dataset_name ?? label.get(j.from_dataset_id) ?? j.from_dataset_id}</td>
                  <td>{j.to_dataset_name ?? label.get(j.to_dataset_id) ?? j.to_dataset_id}</td>
                  <td>
                    <code>
                      {j.from_columns
                        .map((c, i) => `${c} = ${j.to_columns[i] ?? ''}`)
                        .join(', ')}
                    </code>
                  </td>
                  <td>{j.required ? t('datasets.requiredLabel') : t('datasets.optionalLabel')}</td>
                  <td className="dataset-field-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(j)}
                      title={t('dataModel.editRelationship')}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleDelete(j)}
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
      )}

      {showForm && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !submitting && setShowForm(false)}
        >
          <div className="console-modal" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{editing ? t('dataModel.editRelationship') : t('datasets.addRelationship')}</h2>
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
              <FormField label={t('dataModel.fromDataset')}>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  disabled={Boolean(editing)}
                >
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id === toId}>
                      {datasetLabel(d)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('dataModel.toDataset')}>
                <select value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id === fromId}>
                      {datasetLabel(d)}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="dataset-joins__pairs">
                <span>{t('datasets.joinColumns')}</span>
                {pairs.map((pair, idx) => (
                  <div key={idx} className="dataset-joins__pair">
                    <select
                      value={pair.from}
                      onChange={(e) =>
                        setPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, from: e.target.value } : p)),
                        )
                      }
                    >
                      <option value="">{t('datasets.joinColumnPlaceholder')}</option>
                      {fromColumns.map((c) => (
                        <option key={c.column_name} value={c.column_name}>
                          {c.column_name}
                        </option>
                      ))}
                    </select>
                    <span className="dataset-joins__eq">=</span>
                    <select
                      value={pair.to}
                      onChange={(e) =>
                        setPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, to: e.target.value } : p)),
                        )
                      }
                    >
                      <option value="">{t('datasets.joinColumnPlaceholder')}</option>
                      {toColumns.map((c) => (
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
              <label className="ds-check-row">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                <span>{t('datasets.joinRequired')}</span>
              </label>
              <p className="page-subtitle">{t('datasets.joinRequiredHint')}</p>
              <FormField label={t('datasets.joinName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label={t('datasets.joinDescription')}>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
                disabled={submitting || !fromId || !toId}
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
