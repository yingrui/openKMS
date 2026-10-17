import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasetMetadata, fetchDatasets, type ColumnMetadata, type DatasetResponse } from '../../data/datasetsApi';
import {
  createQualityRule,
  deleteQualityRule,
  fetchQualityRule,
  fetchQualityRuns,
  runQualityRule,
  updateQualityRule,
  validateQualityRule,
  type QualityRuleResponse,
  type QualityRunResponse,
} from '../../data/qualityApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { FormField, QueryFailureNotice, StatusChip } from '../../styles/design-system';
import { SqlEditor } from '../../components/quality/SqlEditor';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';
import { readRun, type RunReading } from './qualityRunResult';
import { isRuleDraftDirty } from './ruleDraft';

const RULE_TYPES = ['not_null', 'unique', 'range', 'referential', 'freshness', 'sql'] as const;

const num = (value: number) => value.toLocaleString();

/** What a run measured, said in words — a number without a subject is not a result. */
function ReadingText({ reading }: { reading: RunReading }) {
  const { t } = useTranslation('ontology');
  if (reading.kind === 'error') return <>{t('datasets.qualityResultError')}</>;
  if (reading.kind === 'freshness') {
    if (!reading.latest) return <>{t('datasets.qualityResultFreshnessNoData')}</>;
    if (reading.maxAgeDays == null) {
      // A run recorded while the threshold was not stored still knows the date it saw.
      return <>{t('datasets.qualityResultFreshnessLatest', { latest: reading.latest })}</>;
    }
    return (
      <>{t('datasets.qualityResultFreshness', { latest: reading.latest, maxAge: reading.maxAgeDays })}</>
    );
  }
  if (reading.kind === 'sql') {
    if (reading.expect === 'nonzero') {
      // A count of coverage, not of violations: "found 0" is the sentence that matters.
      return reading.passed ? (
        <>{t('datasets.qualityResultCoverage', { count: num(reading.found) })}</>
      ) : (
        <>{t('datasets.qualityResultNothingFound')}</>
      );
    }
    return reading.found ? (
      <>{t('datasets.qualitySqlResult', { count: num(reading.found) })}</>
    ) : (
      <>{t('datasets.qualitySqlPassed')}</>
    );
  }
  if (reading.failed === 0) {
    return <>{t('datasets.qualityResultChecked', { checked: num(reading.checked ?? 0) })}</>;
  }
  return reading.checked != null ? (
    <>{t('datasets.qualityResultCounts', { checked: num(reading.checked), failed: num(reading.failed) })}</>
  ) : (
    <>{t('datasets.qualityResultFailedOnly', { failed: num(reading.failed) })}</>
  );
}

/**
 * The business constraints people keep asking for, as starting points. They are SQL, not templates in
 * the i18n sense — the labels are translated, the query is not.
 */
const SQL_TEMPLATES = [
  { key: 'enumerated', sql: "SELECT count(*) FROM {{table}} WHERE {{column}} NOT IN ('a', 'b')" },
  { key: 'twoColumns', sql: 'SELECT count(*) FROM {{table}} WHERE high < low' },
  { key: 'duplicates', sql: 'SELECT count(*) FROM (SELECT {{column}}, count(*) FROM {{table}} GROUP BY 1 HAVING count(*) > 1) d' },
  { key: 'nullShare', sql: 'SELECT CASE WHEN 100.0 * count(*) FILTER (WHERE {{column}} IS NULL) / count(*) > 30 THEN 1 ELSE 0 END FROM {{table}}' },
  { key: 'futureDates', sql: 'SELECT count(*) FROM {{table}} WHERE {{column}} > CURRENT_DATE' },
  // A coverage check: the number counts rows that *should* be there, so finding none is the failure.
  { key: 'coverage', sql: 'SELECT count(*) FROM {{table}} WHERE {{column}} = CURRENT_DATE', expect: 'nonzero' as const },
] as const;

/**
 * One rule, as its own page — the detail half of the list.
 *
 * A rule is a query to iterate on (write, try, read the failure, fix it), so it gets the page instead
 * of a dialog: the fields, the query at full width, and the run history below. `/quality/new` and
 * `/quality/:ruleId` are the same component — the rule's absence is "create".
 */
export function QualityRuleEditorPage() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '', ruleId } = useParams();
  const isNew = ruleId === undefined;
  const base = `/datasets/${datasetId}`;
  const navigate = useNavigate();

  const confirm = useConfirm();
  const [rule, setRule] = useState<QualityRuleResponse | null>(null);
  const [runs, setRuns] = useState<QualityRunResponse[]>([]);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<string>('not_null');
  const [column, setColumn] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [refDatasetId, setRefDatasetId] = useState('');
  const [refColumn, setRefColumn] = useState('');
  const [maxAge, setMaxAge] = useState('1');
  const [sql, setSql] = useState('');
  /** What the query's number means: rows that break the rule, or rows that must exist. */
  const [expect, setExpect] = useState<'zero' | 'nonzero'>('zero');
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [trying, setTrying] = useState(false);
  const [sqlResult, setSqlResult] = useState<{
    ok: boolean;
    failed_count: number | null;
    value: number | null;
    expect: 'zero' | 'nonzero' | null;
    error: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [cols, ds] = await Promise.all([
        fetchDatasetMetadata(datasetId),
        fetchDatasets(),
      ]);
      setColumns(cols);
      setDatasets(ds.items);
      if (!isNew && ruleId) {
        const [loaded, history] = await Promise.all([
          fetchQualityRule(datasetId, ruleId),
          fetchQualityRuns(datasetId, ruleId),
        ]);
        setRule(loaded);
        setRuns(history);
        const config = (loaded.config ?? {}) as Record<string, unknown>;
        setName(loaded.name);
        setRuleType(loaded.rule_type);
        setColumn(loaded.column_name ?? '');
        setMin(config.min != null ? String(config.min) : '');
        setMax(config.max != null ? String(config.max) : '');
        setRefDatasetId(typeof config.ref_dataset_id === 'string' ? config.ref_dataset_id : '');
        setRefColumn(typeof config.ref_column === 'string' ? config.ref_column : '');
        setMaxAge(config.max_age_days != null ? String(config.max_age_days) : '1');
        setSql(typeof config.sql === 'string' ? config.sql : '');
        setExpect(config.expect === 'nonzero' ? 'nonzero' : 'zero');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, isNew, ruleId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const config = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (ruleType === 'range') {
      if (min !== '') out.min = Number(min);
      if (max !== '') out.max = Number(max);
    } else if (ruleType === 'referential') {
      out.ref_dataset_id = refDatasetId;
      out.ref_column = refColumn;
    } else if (ruleType === 'freshness') {
      out.max_age_days = Number(maxAge) || 1;
    } else if (ruleType === 'sql') {
      out.sql = sql;
      // `zero` is the default, so it is only stored when it differs.
      if (expect !== 'zero') out.expect = expect;
    }
    return out;
  }, [ruleType, min, max, refDatasetId, refColumn, maxAge, sql, expect]);

  /**
   * Run executes the **saved** rule, so a draft that differs would quietly run something else. The
   * button says so by being disabled instead of running the old definition.
   */
  // By value, not by JSON text: the stored config comes back with JSONB's key order, not the form's.
  const isDirty =
    !isNew && rule !== null && isRuleDraftDirty(rule, { name, column: column || null, config });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.qualityNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      if (isNew) {
        const created = await createQualityRule(datasetId, {
          name: name.trim(),
          rule_type: ruleType,
          column_name: column || null,
          config,
        });
        toast.success(t('datasets.qualityCreated'));
        // Land on the rule itself: its query can be tried and run from here.
        navigate(`${base}/quality/${created.id}`, { replace: true });
      } else {
        const updated = await updateQualityRule(datasetId, ruleId, {
          name: name.trim(),
          column_name: column || null,
          config,
        });
        setRule(updated);
        toast.success(t('datasets.qualityUpdated'));
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : isNew
            ? t('datasets.qualityCreateFailed')
            : t('datasets.qualityUpdateFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrySql = async () => {
    setTrying(true);
    setSqlResult(null);
    try {
      setSqlResult(
        await validateQualityRule(datasetId, { sql, column_name: column || null, expect }),
      );
    } catch (e) {
      setSqlResult({
        ok: false,
        failed_count: null,
        value: null,
        expect: null,
        error: e instanceof Error ? e.message : t('datasets.qualityRunFailed'),
      });
    } finally {
      setTrying(false);
    }
  };

  const handleRun = async () => {
    if (!ruleId) return;
    setRunning(true);
    try {
      const updated = await runQualityRule(datasetId, ruleId);
      setRule(updated);
      setRuns(await fetchQualityRuns(datasetId, ruleId));
      toast.success(
        updated.last_status === 'passed' ? t('datasets.qualityPassed') : t('datasets.qualityFailed'),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!ruleId) return;
    const confirmed = await confirm({
      title: t('shared.delete'),
      message: t('datasets.qualityDeleteConfirm'),
      confirmLabel: t('shared.delete'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteQualityRule(datasetId, ruleId);
      toast.success(t('datasets.qualityDeleted'));
      navigate(`${base}/quality`, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.qualityDeleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const title = isNew ? t('datasets.addQualityRule') : (rule?.name ?? t('datasets.editQualityRule'));

  return (
    <>
      <EntityViewHeader
        title={title}
        subtitle={
          <>
            <Link to={`${base}/quality`} className="page-subtitle">
              <ArrowLeft size={14} aria-hidden /> {t('datasets.qualityRules')}
            </Link>
            {!isNew && (
              <span className="openkms-flex-row-gap">
                <span className="page-subtitle">
                  {t(`datasets.qualityType_${ruleType}`, { defaultValue: ruleType })}
                  {column ? ` · ${column}` : ''}
                </span>
                {rule?.last_status ? (
                  <StatusChip tone={rule.last_status === 'passed' ? 'ok' : 'warn'}>
                    {rule.last_status}
                  </StatusChip>
                ) : (
                  <span className="page-subtitle">{t('datasets.qualityNotRun')}</span>
                )}
              </span>
            )}
          </>
        }
        actions={
          !isNew ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRun()}
              disabled={running || isDirty}
              title={isDirty ? t('datasets.qualityRunNeedsSave') : undefined}
            >
              <Play size={16} aria-hidden />
              {running ? t('datasets.qualityRunning') : t('datasets.qualityRun')}
            </button>
          ) : undefined
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <FormField label={t('datasets.colName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField
            label={t('datasets.qualityType')}
            hint={!isNew ? t('datasets.qualityTypeFixed') : undefined}
          >
            {/* Fixed after creation: a new type would make the existing config meaningless. */}
            <select
              value={ruleType}
              disabled={!isNew}
              onChange={(e) => setRuleType(e.target.value)}
            >
              {RULE_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {t(`datasets.qualityType_${rt}`)}
                </option>
              ))}
            </select>
          </FormField>
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
          {ruleType === 'freshness' && (
            <FormField label={t('datasets.qualityMaxAgeDays')}>
              <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
            </FormField>
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
              <SqlEditor
                value={sql}
                ariaLabel={t('datasets.qualitySql')}
                onChange={(next) => {
                  setSql(next);
                  setSqlResult(null);
                }}
              />
            </FormField>
            <FormField label={t('datasets.qualityExpect')} hint={t('datasets.qualityExpectHint')}>
              <select
                value={expect}
                onChange={(e) => {
                  setExpect(e.target.value as 'zero' | 'nonzero');
                  setSqlResult(null);
                }}
              >
                <option value="zero">{t('datasets.qualityExpectZero')}</option>
                <option value="nonzero">{t('datasets.qualityExpectNonzero')}</option>
              </select>
            </FormField>
            <div className="openkms-flex-row-gap">
              {SQL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSql(tpl.sql);
                    // A template may switch the direction too — a coverage query reads backwards.
                    setExpect('expect' in tpl ? tpl.expect : 'zero');
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
                    {sqlResult.expect === 'nonzero' ? (
                      t('datasets.qualityResultCoverage', { count: num(sqlResult.value ?? 0) })
                    ) : sqlResult.value ? (
                      t('datasets.qualitySqlResult', { count: num(sqlResult.value) })
                    ) : (
                      t('datasets.qualitySqlPassed')
                    )}
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

        {/* The draft's commit pair, together and on the right — one job per row. */}
        <div className="entity-view__panel-footer">
          <div className="quality-rule-savebar">
            <Link to={`${base}/quality`} className="btn btn-secondary">
              {t('shared.cancel')}
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={!name.trim() || submitting || (!isNew && !isDirty)}
            >
              {submitting ? t('shared.saving') : t('shared.save')}
            </button>
          </div>
        </div>
        {!isNew && isDirty && (
          <p className="page-subtitle">{t('datasets.qualityRunNeedsSave')}</p>
        )}
      </EntityViewPanel>

      {!isNew && (
        <EntityViewPanel>
          <div className="dataset-joins__toolbar">
            <h3>{t('datasets.qualityResultTitle')}</h3>
            {runs[0] && (
              <span className="page-subtitle" title={runs[0].created_at}>
                {new Date(runs[0].created_at).toLocaleString()}
              </span>
            )}
          </div>
          {runs.length === 0 ? (
            <p className="page-subtitle">{t('datasets.qualityNoHistory')}</p>
          ) : (
            <>
              {/* The latest run, said in words: "51,425 of 725,192 rows break it" is a result;
                  "failed 51,425" is a number without a subject. */}
              <p className="quality-rule-reading">
                <StatusChip tone={runs[0].status === 'passed' ? 'ok' : 'warn'}>
                  {runs[0].status}
                </StatusChip>
                <ReadingText reading={readRun(runs[0], ruleType)} />
              </p>
              {runs[0].status === 'error' && runs[0].error_message && (
                <QueryFailureNotice
                  title={t('datasets.qualityResultError')}
                  message={runs[0].error_message}
                  detailsLabel={t('datasets.qualitySql')}
                />
              )}
              {typeof (runs[0].detail as { sql?: unknown } | null)?.sql === 'string' && (
                <details className="quality-rule-sql-ran">
                  <summary>{t('datasets.qualitySqlRan')}</summary>
                  <pre>{(runs[0].detail as { sql: string }).sql}</pre>
                </details>
              )}
              {runs.length > 1 && (
                <div className="ds-table-wrap">
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>{t('datasets.qualityWhen')}</th>
                        <th>{t('datasets.qualityStatus')}</th>
                        <th>{t('datasets.qualityResult')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.slice(1).map((r) => (
                        <tr key={r.id}>
                          <td title={r.created_at}>{new Date(r.created_at).toLocaleString()}</td>
                          <td>
                            <StatusChip tone={r.status === 'passed' ? 'ok' : 'warn'}>
                              {r.status}
                            </StatusChip>
                          </td>
                          <td>
                            <ReadingText reading={readRun(r, ruleType)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </EntityViewPanel>
      )}
      {!isNew && (
        /* Its own zone, not a button in a toolbar: the app deletes datasets the same way. */
        <div className="ontology-danger-zone">
          <h2>{t('datasets.dangerZone')}</h2>
          <p className="page-subtitle">{t('datasets.qualityDeleteHint')}</p>
          <button type="button" className="btn btn-danger" onClick={() => void handleDelete()}>
            <Trash2 size={16} aria-hidden />
            {t('shared.delete')}
          </button>
        </div>
      )}
    </>
  );
}
