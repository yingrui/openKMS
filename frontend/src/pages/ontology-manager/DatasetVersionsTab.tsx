import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fetchDatasetVersions, type DatasetVersion } from '../../data/datasetVersionsApi';
import { StatusChip } from '../../styles/design-system';
import { useDatasetDetail } from './useDatasetDetail';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';

const TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  published: 'ok',
  draft: 'warn',
  deprecated: 'neutral',
};

/**
 * The versions of a **file** dataset — the lifecycle this kind has and a table does not.
 *
 * A version is frozen when published: its files, its row count and its schema stop moving, which is the whole
 * reason a training set can be named by version. Nothing here writes: opening a version and uploading files are
 * the skill's job today.
 */
export function DatasetVersionsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await fetchDatasetVersions(datasetId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const bytes = (n: number) =>
    n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  return (
    <>
      <EntityViewHeader title={t('datasets.versions')} subtitle={t('datasets.versionsHint')} />
      <EntityViewPanel>
        {versions.length === 0 ? (
          <p className="page-subtitle">{t('datasets.noVersions')}</p>
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.version')}</th>
                  <th>{t('datasets.versionStatus')}</th>
                  <th>{t('datasets.versionFiles')}</th>
                  <th>{t('datasets.versionRows')}</th>
                  <th>{t('datasets.versionRange')}</th>
                  <th>{t('datasets.versionSize')}</th>
                  <th>{t('datasets.versionWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {[...versions].reverse().map((v) => (
                  <tr key={v.version}>
                    <td>
                      <strong>v{v.version}</strong>
                      {v.notes ? <span className="page-subtitle"> · {v.notes}</span> : null}
                    </td>
                    <td>
                      <StatusChip tone={TONE[v.status] ?? 'neutral'}>{v.status}</StatusChip>
                    </td>
                    <td>{v.file_count.toLocaleString()}</td>
                    <td>{v.row_count.toLocaleString()}</td>
                    <td>
                      {v.date_from && v.date_to ? `${v.date_from} → ${v.date_to}` : t('datasets.dash')}
                    </td>
                    <td>{bytes(v.byte_size)}</td>
                    <td title={v.published_at ?? v.created_at}>
                      {new Date(v.published_at ?? v.created_at).toLocaleString()}
                      {v.created_by_name ? (
                        <span className="page-subtitle"> · {v.created_by_name}</span>
                      ) : null}
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
