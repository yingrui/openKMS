import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import { fetchQualityRules, type QualityRuleResponse } from '../../data/qualityApi';
import { EmptyState } from '../../styles/design-system';
import { EntityViewPanel, EntityViewStat, EntityViewStats } from './EntityViewShell';
import { DatasetAppTabs } from './DatasetAppTabs';
import { DatasetErGraph, type ErGraphLink, type ErGraphNode } from './DatasetErGraph';
import '../ontology/ontology-admin.scss';

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

/** Model view: the ER picture (datasets + joins) and model health. */
export function DataModelPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [rules, setRules] = useState<QualityRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ds, j] = await Promise.all([fetchDatasets(), fetchDatasetJoins()]);
      setDatasets(ds.items);
      setJoins(j.items);
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

  const nameOf = (id: string) => {
    const d = datasets.find((x) => x.id === id);
    return d ? datasetLabel(d) : id;
  };
  const datasetOfRule = useMemo(() => new Map(rules.map((r) => [r.id, r.dataset_id])), [rules]);
  const alerts = rules.filter((r) => r.last_status === 'failed' || r.last_status === 'error');

  const graphNodes: ErGraphNode[] = datasets.map((d) => ({
    id: d.id,
    name: datasetLabel(d),
    joins: joins.filter((j) => j.source_dataset_id === d.id || j.target_dataset_id === d.id).length,
  }));
  const graphLinks: ErGraphLink[] = joins.map((j) => ({
    source: j.source_dataset_id,
    target: j.target_dataset_id,
    label: `${j.cardinality} · ${j.join_columns.map((c) => `${c.source} = ${c.target}`).join(', ')}`,
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
      <div className="page-header">
        <div>
          <h1>{t('dataModel.title')}</h1>
          <p className="page-subtitle">{t('dataModel.subtitle')}</p>
        </div>
      </div>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        <EntityViewStats>
          <EntityViewStat label={t('dataModel.datasets')} value={datasets.length} />
          <EntityViewStat label={t('dataModel.joins')} value={joins.length} />
          <EntityViewStat label={t('dataModel.rules')} value={rules.length} />
          <EntityViewStat label={t('dataModel.failingRules')} value={alerts.length} />
        </EntityViewStats>

        <section>
          <h2>{t('dataModel.erDiagram')}</h2>
          <EntityViewPanel>
            <DatasetErGraph
              nodes={graphNodes}
              links={graphLinks}
              onOpen={(id) => navigate(`/datasets/${id}`)}
              emptyLabel={t('dataModel.emptyGraph')}
            />
          </EntityViewPanel>
        </section>

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

        <section>
          <h2>{t('dataModel.joins')}</h2>
          {joins.length === 0 ? (
            <EmptyState
              title={t('datasets.relationshipsEmpty')}
              description={t('datasets.relationshipsHint')}
            />
          ) : (
            <div className="ds-table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{t('dataModel.colSource')}</th>
                    <th>{t('dataModel.colTarget')}</th>
                    <th>{t('datasets.joinCardinality')}</th>
                    <th>{t('datasets.joinColumns')}</th>
                  </tr>
                </thead>
                <tbody>
                  {joins.map((j) => (
                    <tr key={j.id}>
                      <td>{j.source_dataset_name ?? j.source_dataset_id}</td>
                      <td>{j.target_dataset_name ?? j.target_dataset_id}</td>
                      <td>{j.cardinality}</td>
                      <td>{j.join_columns.map((c) => `${c.source} = ${c.target}`).join(', ')}</td>
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
