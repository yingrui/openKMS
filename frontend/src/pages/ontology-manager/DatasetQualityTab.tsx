import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './DatasetDetailPage';
import { fetchDatasetMetadata, fetchDatasets, type ColumnMetadata, type DatasetResponse } from '../../data/datasetsApi';
import {
  createQualityRule,
  deleteQualityRule,
  fetchQualityRules,
  runQualityRule,
  type QualityRuleResponse,
} from '../../data/qualityApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

const RULE_TYPES = ['not_null', 'unique', 'range', 'referential', 'freshness'] as const;

export function DatasetQualityTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const confirm = useConfirm();

  const [rules, setRules] = useState<QualityRuleResponse[]>([]);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<string>('not_null');
  const [column, setColumn] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [refDatasetId, setRefDatasetId] = useState('');
  const [refColumn, setRefColumn] = useState('');
  const [maxAge, setMaxAge] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, meta, ds] = await Promise.all([
        fetchQualityRules(datasetId),
        fetchDatasetMetadata(datasetId),
        fetchDatasets(),
      ]);
      setRules(r);
      setColumns(meta);
      setDatasets(ds.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setRuleType('not_null');
    setColumn('');
    setMin('');
    setMax('');
    setRefDatasetId('');
    setRefColumn('');
    setMaxAge('1');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.qualityNameRequired'));
      return;
    }
    const config: Record<string, unknown> = {};
    if (ruleType === 'range') {
      if (min !== '') config.min = Number(min);
      if (max !== '') config.max = Number(max);
    } else if (ruleType === 'referential') {
      config.ref_dataset_id = refDatasetId;
      config.ref_column = refColumn;
    } else if (ruleType === 'freshness') {
      config.max_age_days = Number(maxAge) || 1;
    }
    setSubmitting(true);
    try {
      await createQualityRule(datasetId, {
        name: name.trim(),
        rule_type: ruleType,
        column_name: column || null,
        config,
      });
      toast.success(t('datasets.qualityCreated'));
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRun = async (ruleId: string) => {
    setBusyId(ruleId);
    try {
      const updated = await runQualityRule(datasetId, ruleId);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      toast.success(
        updated.last_status === 'passed'
          ? t('datasets.qualityPassed')
          : t('datasets.qualityFailed'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityRunFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.qualityDeleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteQualityRule(datasetId, ruleId);
      toast.success(t('datasets.qualityDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  return (
    <>
      <EntityViewHeader title={t('datasets.quality')} subtitle={t('datasets.qualityHint')} />
      <EntityViewPanel>
        <div className="dataset-joins__toolbar">
          <h3>{t('datasets.qualityRules')}</h3>
          <button type="button" className="btn btn-secondary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            {t('datasets.addQualityRule')}
          </button>
        </div>
        {rules.length === 0 ? (
          <EmptyState title={t('datasets.qualityEmpty')} description={t('datasets.qualityHint')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colName')}</th>
                  <th>{t('datasets.qualityType')}</th>
                  <th>{t('datasets.colColumn')}</th>
                  <th>{t('datasets.qualityStatus')}</th>
                  <th className="console-table-actions">{t('datasets.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td>{r.rule_type}</td>
                    <td>{r.column_name ?? t('datasets.dash')}</td>
                    <td>
                      {r.last_status ? (
                        <span className={`quality-pill quality-pill--${r.last_status}`}>
                          {r.last_status}
                        </span>
                      ) : (
                        t('datasets.qualityNotRun')
                      )}
                    </td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          title={t('datasets.qualityRun')}
                          onClick={() => void handleRun(r.id)}
                          disabled={busyId === r.id}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('shared.delete')}
                          onClick={() => void handleDelete(r.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('datasets.addQualityRule')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
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
              disabled={!name.trim() || submitting}
            >
              {submitting ? t('shared.saving') : t('joinCreate')}
            </button>
          </>
        }
      >
        <FormField label={t('datasets.colName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('datasets.qualityType')}>
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
            {RULE_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        </FormField>
        {ruleType !== 'freshness' && (
          <FormField label={t('datasets.colColumn')}>
            <select value={column} onChange={(e) => setColumn(e.target.value)}>
              <option value="">{t('datasets.joinColumnPlaceholder')}</option>
              {columns.map((c) => (
                <option key={c.column_name} value={c.column_name}>
                  {c.column_name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {ruleType === 'freshness' && (
          <>
            <FormField label={t('datasets.colColumn')}>
              <select value={column} onChange={(e) => setColumn(e.target.value)}>
                <option value="">{t('datasets.joinColumnPlaceholder')}</option>
                {columns.map((c) => (
                  <option key={c.column_name} value={c.column_name}>
                    {c.column_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('datasets.qualityMaxAgeDays')}>
              <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
            </FormField>
          </>
        )}
        {ruleType === 'range' && (
          <>
            <FormField label={t('datasets.qualityMin')}>
              <input value={min} onChange={(e) => setMin(e.target.value)} />
            </FormField>
            <FormField label={t('datasets.qualityMax')}>
              <input value={max} onChange={(e) => setMax(e.target.value)} />
            </FormField>
          </>
        )}
        {ruleType === 'referential' && (
          <>
            <FormField label={t('datasets.qualityRefDataset')}>
              <select value={refDatasetId} onChange={(e) => setRefDatasetId(e.target.value)}>
                <option value="">{t('datasets.selectTable')}</option>
                {datasets
                  .filter((d) => d.id !== datasetId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name || `${d.schema_name}.${d.table_name}`}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label={t('datasets.qualityRefColumn')}>
              <input value={refColumn} onChange={(e) => setRefColumn(e.target.value)} />
            </FormField>
          </>
        )}
      </Dialog>
    </>
  );
}
