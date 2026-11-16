/**
 * Creating a rule: the same four steps as the edit page, saved in one go.
 *
 * There is nothing to update section by section yet, so this page keeps a single 创建 action; once the rule
 * exists, the four tabs take over and each saves itself.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RuleBasicsForm } from './RuleBasicsForm';
import { RuleCheckEditor } from './RuleCheckEditor';
import { RuleScopeForm } from './RuleScopeForm';
import { RuleAlertForm } from './RuleAlertForm';
import { conditionFromRows, newRow, type ConditionRow } from './conditionRowsModel';
import { buildRulePayload, EMPTY_FORM, type FormState } from './ruleForm';
import { createRule } from '../../../data/rulesApi';
import { fetchDatasets, type DatasetResponse } from '../../../data/datasetsApi';
import { datasetLabel } from '../datasetLabel';
import { fetchMetrics, type MetricResponse } from '../../../data/metricsApi';
import { fetchModelFields, type SemanticModelFieldResponse } from '../../../data/semanticModelFieldsApi';
import { DatasetAppTabs } from '../../../components/ontology/DatasetAppTabs';
import { EntityViewPanel } from '../../shared/EntityViewShell';
import '../../../styles/settings-page.scss';
import '../../ontology/ontology-admin.scss';
import '../../../styles/rules.scss';

export function RuleNewPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, mode: 'relation' });
  const [rows, setRows] = useState<ConditionRow[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [paramCandidates, setParamCandidates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);
  const datasetName = useMemo(() => {
    const byId = new Map(datasets.map((dataset) => [dataset.id, datasetLabel(dataset)]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [datasets]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [metricPage, datasetPage] = await Promise.all([
        fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
        fetchDatasets({ limit: 200 }).catch(() => ({ items: [] as DatasetResponse[], total: 0 })),
      ]);
      if (cancelled) return;
      setMetrics(metricPage.items);
      setDatasets(datasetPage.items);
      const first = metricPage.items[0];
      if (first) {
        setForm((prev) => ({ ...prev, metricId: first.id, datasetId: datasetPage.items[0]?.id ?? '' }));
        setRows([newRow({ metricId: first.id, datasetId: datasetPage.items[0]?.id ?? '' })]);
        const fields = await fetchModelFields(first.semantic_model_id).catch(() => ({ items: [] }));
        if (!cancelled) {
          setParamCandidates((fields.items as SemanticModelFieldResponse[]).map((field) => field.name));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    if (!form.name.trim()) return;
    const condition = conditionFromRows(rows);
    if (form.mode === 'condition' && !condition) {
      setError(t('rules.conditionIncomplete'));
      return;
    }
    setSaving(true);
    try {
      const created = await createRule(buildRulePayload(form, condition));
      toast.success(t('rules.toastCreated'));
      navigate(`/data-rules/${created.id}`, { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ds-page">
      <header className="page-header">
        <div>
          <h1>{t('rules.dialogCreate')}</h1>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/data-rules')}>
            {t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void create()}
            disabled={saving || !form.name.trim()}
          >
            {saving ? t('rules.saving') : t('shared.create')}
          </button>
        </div>
      </header>
      <DatasetAppTabs />
      <div className="account-stack">
        <EntityViewPanel title={t('rules.navOverview')}>
          <RuleBasicsForm
            value={{
              name: form.name,
              description: form.description,
              ruleId: form.ruleId,
              severity: form.severity,
              status: form.status,
            }}
            onChange={(next) => setForm({ ...form, ...next })}
          />
        </EntityViewPanel>
        <EntityViewPanel title={t('rules.navCheck')}>
          <RuleCheckEditor
            value={{ mode: form.mode, relations: form.relations, groupField: form.groupField }}
            onChange={(next) => setForm({ ...form, ...next })}
            metrics={metrics}
            datasets={datasets}
            metricName={metricName}
            lookups={{ metricName, datasetName }}
            rows={rows}
            onRowsChange={setRows}
            unrepresentable={false}
            error={error}
            onErrorClear={() => setError(null)}
          />
        </EntityViewPanel>
        <EntityViewPanel title={t('rules.navRunParams')}>
          <RuleScopeForm
            value={{ groupField: form.groupField, runArgs: form.runArgs }}
            onChange={(next) => setForm({ ...form, ...next })}
            fields={paramCandidates}
            periodSpec={null}
          />
        </EntityViewPanel>
        <EntityViewPanel title={t('rules.navAlertCopy')}>
          <RuleAlertForm
            value={{ conclusion: form.conclusion, suggestion: form.suggestion }}
            onChange={(next) => setForm({ ...form, ...next })}
          />
        </EntityViewPanel>
      </div>
    </div>
  );
}
