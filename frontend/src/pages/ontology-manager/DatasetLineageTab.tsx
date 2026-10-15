import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDatasetDetail } from './useDatasetDetail';
import { fetchDatasetLineage, type DatasetLineageResponse } from '../../data/datasetsApi';
import { EntityViewHeader, EntityViewPanel, EntityViewLoading } from './EntityViewShell';

export function DatasetLineageTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const [lineage, setLineage] = useState<DatasetLineageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLineage(await fetchDatasetLineage(dataset.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [dataset.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const renderNodes = (nodes: { type: string; id: string; label: string | null }[]) =>
    nodes.length === 0 ? (
      <p className="entity-view__readonly">{t('datasets.lineageNone')}</p>
    ) : (
      <ul className="dataset-lineage__list">
        {nodes.map((n) => (
          <li key={`${n.type}-${n.id}`}>
            <span className="dataset-lineage__badge">{n.type}</span>
            {n.label ?? n.id}
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <EntityViewHeader title={t('datasets.lineage')} subtitle={t('datasets.lineageHint')} />
      <EntityViewPanel>
        <div className="dataset-lineage">
          <section>
            <h3>{t('datasets.lineageUpstream')}</h3>
            {renderNodes(lineage?.upstream ?? [])}
          </section>
          <section>
            <h3>{t('datasets.lineageDownstream')}</h3>
            {renderNodes(lineage?.downstream ?? [])}
          </section>
          <section>
            <h3>{t('datasets.lineageJoined')}</h3>
            {(lineage?.joined_datasets.length ?? 0) === 0 ? (
              <p className="entity-view__readonly">{t('datasets.lineageNone')}</p>
            ) : (
              <ul className="dataset-lineage__list">
                {(lineage?.joined_datasets ?? []).map((j) => (
                  <li key={j.join_id}>
                    <span className="dataset-lineage__badge">
                      {j.required ? t('datasets.requiredLabel') : t('datasets.optionalLabel')}
                    </span>
                    {j.dataset_name ?? j.dataset_id}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </EntityViewPanel>
    </>
  );
}
