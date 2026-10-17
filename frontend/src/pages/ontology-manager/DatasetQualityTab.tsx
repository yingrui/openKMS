import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import { fetchDatasetMetadata, fetchDatasets, type ColumnMetadata, type DatasetResponse } from '../../data/datasetsApi';
import {
  createQualityRule,
  deleteQualityRule,
  fetchQualityRules,
  runQualityRule,
  updateQualityRule,
  validateQualityRule,
  type QualityRuleResponse,
} from '../../data/qualityApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EmptyState, FormField, QueryFailureNotice, StatusChip } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

const RULE_TYPES = ['not_null', 'unique', 'range', 'referential', 'freshness', 'sql'] as const;

/**
 * The business constraints people keep asking for, as starting points. They are SQL, not templates in
 * the i18n sense — the labels are translated, the query is not.
 */
const SQL_TEMPLATES = [
  { key: 'enumerated', sql: 'SELECT count(*) FROM {{table}} WHERE {{column}} NOT IN (\'a\', \'b\')' },
  { key: 'twoColumns', sql: 'SELECT count(*) FROM {{table}} WHERE high < low' },
  { key: 'duplicates', sql: 'SELECT count(*) FROM (SELECT {{column}}, count(*) FROM {{table}} GROUP BY 1 HAVING count(*) > 1) d' },
  { key: 'nullShare', sql: 'SELECT CASE WHEN 100.0 * count(*) FILTER (WHERE {{column}} IS NULL) / count(*) > 30 THEN 1 ELSE 0 END FROM {{table}}' },
  { key: 'futureDates', sql: 'SELECT count(*) FROM {{table}} WHERE {{column}} > CURRENT_DATE' },
] as const;

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
  /** Non-null = the dialog is editing that rule instead of creating one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<string>('not_null');
  const [column, setColumn] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [refDatasetId, setRefDatasetId] = useState('');
  const [refColumn, setRefColumn] = useState('');
  const [maxAge, setMaxAge] = useState('1');
  const [sql, setSql] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [trying, setTrying] = useState(false);
  const [sqlResult, setSqlResult] = useState<{ ok: boolean; failed_count: number | null; error: string | null } | null>(null);
  /** The draft as it was when the editor opened; a different value means there is something to lose. */
  const [savedKey, setSavedKey] = useState('');
  // The editor opens above the table, so a pencil clicked twenty rows down would otherwise seem to do
  // nothing at all.
  useEffect(() => {
    if (showForm) {
      document.getElementById('quality-rule-editor')?.scrollIntoView({ block: 'nearest' });
    }
  }, [showForm]);

  const draftKey = JSON.stringify([
    name, ruleType, column, min, max, refDatasetId, refColumn, maxAge, sql,
  ]);

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

  /** Opening another rule (or "add") discards the draft, so ask when there is one. */
  const guardDraft = async () => {
    if (!showForm || draftKey === savedKey) return true;
    return confirm({
      title: t('datasets.discardDraft'),
      message: t('datasets.discardDraftHint'),
      confirmLabel: t('shared.discard'),
      danger: true,
    });
  };

  const closeEditor = async () => {
    if (!(await guardDraft())) return;
    setShowForm(false);
    setEditingId(null);
  };

  const openCreate = async () => {
    if (!(await guardDraft())) return;
    setEditingId(null);
    setName('');
    setRuleType('not_null');
    setColumn('');
    setMin('');
    setMax('');
    setRefDatasetId('');
    setRefColumn('');
    setMaxAge('1');
    setSql('');
    setSqlResult(null);
    setSavedKey(
      JSON.stringify(['', 'not_null', '', '', '', '', '', '1', '']),
    );
    setShowForm(true);
  };

  /** Load a rule into the dialog. Its type is fixed — changing it would orphan the config. */
  const openEdit = async (rule: QualityRuleResponse) => {
    if (!(await guardDraft())) return;
    const config = (rule.config ?? {}) as Record<string, unknown>;
    setEditingId(rule.id);
    setName(rule.name);
    setRuleType(rule.rule_type);
    setColumn(rule.column_name ?? '');
    setMin(config.min != null ? String(config.min) : '');
    setMax(config.max != null ? String(config.max) : '');
    setRefDatasetId(typeof config.ref_dataset_id === 'string' ? config.ref_dataset_id : '');
    setRefColumn(typeof config.ref_column === 'string' ? config.ref_column : '');
    setMaxAge(config.max_age_days != null ? String(config.max_age_days) : '1');
    setSql(typeof config.sql === 'string' ? config.sql : '');
    setSqlResult(null);
    setSavedKey(
      JSON.stringify([
        rule.name,
        rule.rule_type,
        rule.column_name ?? '',
        config.min != null ? String(config.min) : '',
        config.max != null ? String(config.max) : '',
        typeof config.ref_dataset_id === 'string' ? config.ref_dataset_id : '',
        typeof config.ref_column === 'string' ? config.ref_column : '',
        config.max_age_days != null ? String(config.max_age_days) : '1',
        typeof config.sql === 'string' ? config.sql : '',
      ]),
    );
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
    } else if (ruleType === 'sql') {
      config.sql = sql;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateQualityRule(datasetId, editingId, {
          name: name.trim(),
          column_name: column || null,
          config,
        });
        toast.success(t('datasets.qualityUpdated'));
      } else {
        await createQualityRule(datasetId, {
          name: name.trim(),
          rule_type: ruleType,
          column_name: column || null,
          config,
        });
        toast.success(t('datasets.qualityCreated'));
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Try the rule before saving it: the same endpoint path the run uses, nothing stored. */
  const handleTrySql = async () => {
    setTrying(true);
    setSqlResult(null);
    try {
      setSqlResult(await validateQualityRule(datasetId, { sql, column_name: column || null }));
    } catch (e) {
      setSqlResult({
        ok: false,
        failed_count: null,
        error: e instanceof Error ? e.message : t('datasets.qualityRunFailed'),
      });
    } finally {
      setTrying(false);
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
      {showForm && (
        <EntityViewPanel id="quality-rule-editor">
          <div className="dataset-joins__toolbar">
            <h3>
              {editingId
                ? t('datasets.editQualityRuleNamed', { name })
                : t('datasets.addQualityRule')}
            </h3>
          </div>
          {/* Editing is a page, not a dialog: a rule — especially a SQL one — is written, tried, fixed
              and tried again while the rules and the columns stay in sight. */}
          <div className="entity-view__form">
            <FormField label={t('datasets.colName')}>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField
              label={t('datasets.qualityType')}
              hint={editingId ? t('datasets.qualityTypeFixed') : undefined}
            >
              {/* Fixed while editing: a new type would make the existing config meaningless. */}
              <select
                value={ruleType}
                disabled={editingId !== null}
                onChange={(e) => setRuleType(e.target.value)}
              >
                {RULE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {t(`datasets.qualityType_${rt}`)}
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
          </div>
          {ruleType === 'sql' && (
            /* Outside `.entity-view__form` on purpose: a query wants the width. */
            <div className="quality-rule-sql">
              <FormField label={t('datasets.qualitySql')} hint={t('datasets.qualitySqlHint')}>
                <textarea
                  className="ds-control ds-control--mono"
                  rows={9}
                  spellCheck={false}
                  value={sql}
                  onChange={(e) => {
                    setSql(e.target.value);
                    setSqlResult(null);
                  }}
                />
              </FormField>
              <div className="openkms-flex-row-gap">
                {SQL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSql(tpl.sql);
                      setSqlResult(null);
                    }}
                  >
                    {t(`datasets.qualityTemplate_${tpl.key}`)}
                  </button>
                ))}
              </div>
              <div className="openkms-flex-row-gap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleTrySql()}
                  disabled={!sql.trim() || trying}
                >
                  {trying ? t('datasets.qualitySqlTrying') : t('datasets.qualitySqlTry')}
                </button>
                {sqlResult?.ok && (
                  <>
                    <StatusChip tone={sqlResult.failed_count ? 'warn' : 'ok'}>
                      {sqlResult.failed_count
                        ? t('datasets.qualitySqlResult', { count: sqlResult.failed_count })
                        : t('datasets.qualitySqlPassed')}
                    </StatusChip>
                    <span className="page-subtitle">{t('datasets.qualitySqlNotSaved')}</span>
                  </>
                )}
              </div>
              {sqlResult && !sqlResult.ok && (
                <QueryFailureNotice
                  title={t('datasets.qualitySqlError')}
                  message={sqlResult.error}
                  detailsLabel={t('datasets.qualitySql')}
                />
              )}
            </div>
          )}
          <div className="entity-view__panel-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void closeEditor()}
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
              {submitting ? t('shared.saving') : editingId ? t('shared.save') : t('datasets.joinCreate')}
            </button>
          </div>
        </EntityViewPanel>
      )}
      <EntityViewPanel>
        <div className="dataset-joins__toolbar">
          <h3>{t('datasets.qualityRules')}</h3>
          <button type="button" className="btn btn-secondary" onClick={() => void openCreate()}>
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
                    <td>{t(`datasets.qualityType_${r.rule_type}`, { defaultValue: r.rule_type })}</td>
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
                          title={t('datasets.editQualityRule')}
                          aria-label={t('datasets.editQualityRule')}
                          onClick={() => void openEdit(r)}
                        >
                          <Pencil size={16} />
                        </button>
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

    </>
  );
}
