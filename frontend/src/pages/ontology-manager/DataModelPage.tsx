import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import { fetchQualityRules, type QualityRuleResponse } from '../../data/qualityApi';
import { EmptyState } from '../../styles/design-system';
import { DatasetAppTabs } from './DatasetAppTabs';
import '../ontology/ontology-admin.scss';

function datasetLabel(d: DatasetResponse): string {
  return d.display_name || `${d.schema_name}.${d.table_name}`;
}

export function DataModelPage() {
  const { t } = useTranslation('ontology');
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

  const alerts = rules.filter((r) => r.last_status === 'failed' || r.last_status === 'error');
  const datasetOfRule = new Map(rules.map((r) => [r.id, r.dataset_id]));

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
                        <Link to={`/datasets/${datasetOfRule.get(r.id)}`}>{nameOf(datasetOfRule.get(r.id) ?? '')}</Link>
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
          <h2>{t('dataModel.datasets')}</h2>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colName')}</th>
                  <th>{t('datasets.dataSource')}</th>
                  <th>{t('datasets.relationships')}</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/datasets/${d.id}`}>{datasetLabel(d)}</Link>
                    </td>
                    <td>{d.data_source_name ?? t('datasets.dash')}</td>
                    <td>
                      {
                        joins.filter(
                          (j) => j.source_dataset_id === d.id || j.target_dataset_id === d.id,
                        ).length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>{t('dataModel.joins')}</h2>
          {joins.length === 0 ? (
            <EmptyState title={t('datasets.relationshipsEmpty')} description={t('datasets.relationshipsHint')} />
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
