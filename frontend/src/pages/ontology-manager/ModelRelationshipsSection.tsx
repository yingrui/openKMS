import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { useSemanticModelDetail } from './SemanticModelDetailPage';

/**
 * Model → Relationships: the FK edges **among the datasets in scope**. Relationships are
 * catalog-owned and shared by every model, so this view is read-only — it shows what the
 * model's joins rely on and links to the one place they are edited.
 */
export function ModelRelationshipsSection() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const { model } = useSemanticModelDetail();
  const memberIds = useMemo(() => new Set(model.dataset_ids), [model.dataset_ids]);

  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDatasetJoins()
      .then((page) => {
        if (cancelled) return;
        setJoins(
          page.items.filter(
            (j) => memberIds.has(j.from_dataset_id) && memberIds.has(j.to_dataset_id),
          ),
        );
      })
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [memberIds, t]);

  const nameOf = (j: DatasetJoinResponse) =>
    j.from_dataset_name ?? model.datasets.find((d) => d.id === j.from_dataset_id)?.name ?? '';

  const aiText = (ai: Record<string, unknown> | null) =>
    typeof ai?.instructions === 'string' && ai.instructions ? ai.instructions : t('datasets.dash');

  return (
    <>
      <EntityViewHeader
        title={t('datasets.relationships')}
        subtitle={t('dataModel.relationshipCount', { count: joins.length })}
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              navigate(
                joins.length > 0
                  ? `/datasets/${joins[0].from_dataset_id}/relationships`
                  : '/datasets',
              )
            }
          >
            <ExternalLink size={16} aria-hidden />
            {t('dataModel.manageInCatalog')}
          </button>
        }
      />

      <EntityViewPanel>
        {loading ? (
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        ) : joins.length === 0 ? (
          <p className="entity-view__readonly">{t('dataModel.noRelationships')}</p>
        ) : (
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.fieldName')}</th>
                  <th>{t('dataModel.relationshipEnds')}</th>
                  <th>{t('datasets.joinColumns')}</th>
                  <th>{t('dataModel.relationshipKind')}</th>
                  <th>{t('datasets.aiContext')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {joins.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong>{j.name ?? `${nameOf(j)} → ${j.to_dataset_name}`}</strong>
                    </td>
                    <td>
                      <code>
                        {j.from_dataset_name} → {j.to_dataset_name}
                      </code>
                    </td>
                    <td>
                      <code>
                        {j.from_columns.join(', ')} = {j.to_columns.join(', ')}
                      </code>
                    </td>
                    <td>
                      {j.required ? t('datasets.joinRequired') : t('dataModel.joinOptional')}
                    </td>
                    <td>{aiText(j.ai_context)}</td>
                    <td className="dataset-field-row__actions">
                      <Link
                        to={`/datasets/${j.from_dataset_id}/relationships`}
                        className="btn btn-secondary btn-sm"
                        title={t('dataModel.manageInCatalog')}
                      >
                        {t('dataModel.openInCatalog')}
                      </Link>
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
