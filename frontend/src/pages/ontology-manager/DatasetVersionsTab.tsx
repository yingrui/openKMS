import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetVersion,
  fetchDatasetVersions,
  fetchVersionDownloadUrl,
  type DatasetVersion,
  type DatasetVersionDetail,
} from '../../data/datasetVersionsApi';
import { EmptyState, StatusChip } from '../../styles/design-system';
import { useDatasetDetail } from './useDatasetDetail';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';

const TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  published: 'ok',
  draft: 'warn',
  deprecated: 'neutral',
};

const bytes = (n: number) =>
  n >= 1 << 30
    ? `${(n / (1 << 30)).toFixed(1)} GB`
    : n >= 1 << 20
      ? `${(n / (1 << 20)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * A file dataset's versions, newest first — **one card per version**, files inside it.
 *
 * The information architecture is the version, not the file: a version is what you name, compare and download, and
 * its files are its parts. So nothing is folded away — each card answers the four questions in order: which version
 * and is it the current one, how big is it, what does it cover, and what is in it (each file downloadable).
 */
export function DatasetVersionsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [details, setDetails] = useState<Record<number, DatasetVersionDetail>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await fetchDatasetVersions(datasetId);
        if (cancelled) return;
        setVersions(all);
        // The files come from each version's detail; a handful of versions is a handful of requests.
        const loaded = await Promise.all(
          all.map(async (v) => [v.version, await fetchDatasetVersion(datasetId, v.version)] as const),
        );
        if (!cancelled) setDetails(Object.fromEntries(loaded));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  const download = async (version: number, name: string) => {
    try {
      window.open(await fetchVersionDownloadUrl(datasetId, version, name), '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  const newestPublished = [...versions].reverse().find((v) => v.status === 'published')?.version ?? null;

  return (
    <>
      <EntityViewHeader title={t('datasets.versions')} subtitle={t('datasets.versionsHint')} />
      {versions.length === 0 ? (
        <EntityViewPanel>
          <EmptyState title={t('datasets.noVersions')} description={t('datasets.versionsHint')} />
        </EntityViewPanel>
      ) : (
        [...versions].reverse().map((version) => {
          const files = details[version.version]?.files ?? [];
          return (
            <EntityViewPanel key={version.version}>
              <div className="dataset-joins__toolbar">
                <h3>
                  v{version.version}
                  {version.version === newestPublished ? (
                    <span className="page-subtitle"> · {t('datasets.versionLatest')}</span>
                  ) : null}
                </h3>
                <StatusChip tone={TONE[version.status] ?? 'neutral'}>{version.status}</StatusChip>
              </div>
              <p className="page-subtitle">
                {t('datasets.versionFacts', {
                  files: version.file_count,
                  rows: version.row_count.toLocaleString(),
                  size: bytes(version.byte_size),
                  columns: version.columns.length,
                })}
                {version.date_from && version.date_to
                  ? ` · ${version.date_from} → ${version.date_to}`
                  : ''}
                {version.published_at
                  ? ` · ${t('datasets.versionPublishedAt', {
                      when: new Date(version.published_at).toLocaleString(),
                      who: version.created_by_name ?? '—',
                    })}`
                  : ''}
              </p>
              {version.notes ? <p className="page-subtitle">{version.notes}</p> : null}

              {files.length === 0 ? (
                <p className="page-subtitle">{t('datasets.noFiles')}</p>
              ) : (
                <div className="ds-table-wrap">
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>{t('datasets.fileName')}</th>
                        <th>{t('datasets.versionRows')}</th>
                        <th>{t('datasets.versionRange')}</th>
                        <th>{t('datasets.versionSize')}</th>
                        <th className="console-table-actions">{t('shared.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.name}>
                          <td>{file.name}</td>
                          <td>{file.rows.toLocaleString()}</td>
                          <td>
                            {file.date_from && file.date_to
                              ? `${file.date_from} → ${file.date_to}`
                              : t('datasets.dash')}
                          </td>
                          <td>{bytes(file.bytes)}</td>
                          <td className="console-table-actions">
                            <button
                              type="button"
                              title={t('datasets.download')}
                              aria-label={t('datasets.download')}
                              onClick={() => void download(version.version, file.name)}
                            >
                              <Download size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </EntityViewPanel>
          );
        })
      )}
    </>
  );
}
