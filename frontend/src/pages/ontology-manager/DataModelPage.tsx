import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import { fetchMetrics } from '../../data/metricsApi';
import { fetchSavedQueries } from '../../data/queriesApi';
import {
  exportSemanticModel,
  exportSemanticModelYaml,
  importSemanticModel,
} from '../../data/semanticModelApi';
import { fetchQualityRules, type QualityRuleResponse } from '../../data/qualityApi';
import { EmptyState } from '../../styles/design-system';
import { EntityViewPanel, EntityViewStat, EntityViewStats } from './EntityViewShell';
import { DatasetAppTabs } from './DatasetAppTabs';
import { DatasetErGraph, type ErGraphLink, type ErGraphNode } from './DatasetErGraph';
import { ModelRelationshipsSection } from './ModelRelationshipsSection';
import { ModelMetricsSection } from './ModelMetricsSection';
import { ModelQueriesSection } from './ModelQueriesSection';
import '../ontology/ontology-admin.scss';

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Model view: the configurable **semantic model** (datasets + fields + relationships)
 * and the model-level **metrics** / **queries**. The ER picture is secondary (hidden
 * by default); Export/Import live in the header overflow menu.
 */
export function DataModelPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showEr, setShowEr] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [rules, setRules] = useState<QualityRuleResponse[]>([]);
  const [metricCount, setMetricCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ds, j, m, q] = await Promise.all([
        fetchDatasets(),
        fetchDatasetJoins(),
        fetchMetrics(),
        fetchSavedQueries(),
      ]);
      setDatasets(ds.items);
      setJoins(j.items);
      setMetricCount(m.total);
      setQueryCount(q.total);
      const lists: QualityRuleResponse[][] = [];
      for (const d of ds.items) {
        lists.push(await fetchQualityRules(d.id).catch(() => []));
      }
      setRules(lists.flat());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async (format: 'json' | 'yaml') => {
    try {
      if (format === 'yaml') {
        download('semantic-model.yaml', await exportSemanticModelYaml(), 'application/yaml');
      } else {
        const doc = await exportSemanticModel();
        download('semantic-model.json', JSON.stringify(doc, null, 2), 'application/json');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.exportFailed'));
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const doc = JSON.parse(await file.text()) as unknown;
      const summary = await importSemanticModel(doc);
      toast.success(
        t('dataModel.importDone', {
          r: summary.relationships,
          m: summary.metrics,
          q: summary.queries,
        }),
      );
      if (summary.warnings.length) {
        toast.message(t('dataModel.importWarnings', { n: summary.warnings.length }));
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.importFailed'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const datasetOfRule = useMemo(() => new Map(rules.map((r) => [r.id, r.dataset_id])), [rules]);
  const alerts = rules.filter((r) => r.last_status === 'failed' || r.last_status === 'error');
  const nameOf = (id: string) => {
    const d = datasets.find((x) => x.id === id);
    return d ? datasetLabel(d) : id;
  };

  const graphNodes: ErGraphNode[] = datasets.map((d) => ({
    id: d.id,
    name: datasetLabel(d),
    joins: joins.filter((j) => j.from_dataset_id === d.id || j.to_dataset_id === d.id).length,
  }));
  const graphLinks: ErGraphLink[] = joins.map((j) => ({
    source: j.from_dataset_id,
    target: j.to_dataset_id,
    label: `${j.required ? t('datasets.requiredLabel') : t('datasets.optionalLabel')} · ${j.from_columns
      .map((c, i) => `${c} = ${j.to_columns[i] ?? ''}`)
      .join(', ')}`,
  }));

  if (loading) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <div className="page-header model-page-header">
        <div>
          <h1>{t('dataModel.title')}</h1>
          <p className="page-subtitle">{t('dataModel.subtitle')}</p>
        </div>
        <details className="model-menu">
          <summary className="btn btn-secondary btn-sm" aria-label={t('dataModel.more')}>
            <MoreHorizontal size={16} aria-hidden />
          </summary>
          <div className="model-menu__panel">
            <button type="button" onClick={() => void handleExport('json')}>
              {t('dataModel.exportJson')}
            </button>
            <button type="button" onClick={() => void handleExport('yaml')}>
              {t('dataModel.exportYaml')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {t('dataModel.import')}
            </button>
          </div>
        </details>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        <EntityViewStats>
          <EntityViewStat label={t('dataModel.datasets')} value={datasets.length} />
          <EntityViewStat label={t('dataModel.joins')} value={joins.length} />
          <EntityViewStat label={t('dataModel.metrics')} value={metricCount} />
          <EntityViewStat label={t('dataModel.queries')} value={queryCount} />
          <EntityViewStat label={t('dataModel.failingRules')} value={alerts.length} />
        </EntityViewStats>

        <section>
          <h2>{t('dataModel.semanticModel')}</h2>
          <p className="page-subtitle">
            {t('dataModel.semanticModelHint')}{' '}
            <Link to="/datasets">{t('dataModel.manageFields')}</Link>
          </p>
          <EntityViewPanel>
            <ModelRelationshipsSection onChanged={() => void load()} />
          </EntityViewPanel>
          <div className="model-er-toggle">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowEr((v) => !v)}
            >
              {showEr ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              {t('dataModel.erDiagram')}
            </button>
          </div>
          {showEr && (
            <EntityViewPanel>
              <DatasetErGraph
                nodes={graphNodes}
                links={graphLinks}
                onOpen={(id) => navigate(`/datasets/${id}`)}
                emptyLabel={t('dataModel.emptyGraph')}
              />
            </EntityViewPanel>
          )}
        </section>

        <ModelMetricsSection />

        <ModelQueriesSection />

        <section>
          <h2>{t('dataModel.qualityAlerts')}</h2>
          {alerts.length === 0 ? (
            <EmptyState title={t('dataModel.noAlerts')} description={t('dataModel.subtitle')} />
          ) : (
            <div className="ds-table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{t('datasets.colName')}</th>
                    <th>{t('datasets.qualityType')}</th>
                    <th>{t('datasets.colColumn')}</th>
                    <th>{t('datasets.qualityStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/datasets/${datasetOfRule.get(r.id)}`}>
                          {nameOf(datasetOfRule.get(r.id) ?? '')}
                        </Link>
                      </td>
                      <td>{r.rule_type}</td>
                      <td>{r.column_name ?? t('datasets.dash')}</td>
                      <td>
                        <span className={`quality-pill quality-pill--${r.last_status}`}>
                          {r.last_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
