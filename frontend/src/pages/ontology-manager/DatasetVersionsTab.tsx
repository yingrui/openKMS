import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetVersion,
  fetchDatasetVersions,
  fetchVersionDownloadUrl,
  fetchVersionManifest,
  type DatasetVersion,
  type DatasetVersionDetail,
} from '../../data/datasetVersionsApi';
import { EmptyState, Pagination, StatusChip } from '../../styles/design-system';
import { useDatasetDetail } from './useDatasetDetail';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from './EntityViewShell';

const TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  published: 'ok',
  draft: 'warn',
  deprecated: 'neutral',
};

const PAGE = 10;

const bytes = (n: number) =>
  n >= 1 << 30
    ? `${(n / (1 << 30)).toFixed(1)} GB`
    : n >= 1 << 20
      ? `${(n / (1 << 20)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * A file dataset's versions: **one row per version**, and the files of the one you pick.
 *
 * Versions are a list, not a stack of cards — a dataset with fifty of them should be fifty rows, and the files are a
 * detail of a version, not of the page. The newest published version is selected on load, because that is the one
 * almost every visit wants; anything older is one click away and its files load then.
 */
export function DatasetVersionsTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const datasetId = dataset.id;
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<DatasetVersionDetail | null>(null);
  /** Loaded on demand and kept with its version: the manifest is the audit trail, not a page fixture. */
  const [manifest, setManifest] = useState<{ version: number; data: Record<string, unknown> } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    void fetchDatasetVersions(datasetId)
      .then((all) => {
        if (cancelled) return;
        // Newest first: the list is read from the top, and the current version is what a reader wants.
        const newestFirst = [...all].reverse();
        setVersions(newestFirst);
        const current = newestFirst.find((v) => v.status === 'published') ?? newestFirst[0] ?? null;
        setSelected(current ? current.version : null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  useEffect(() => {
    // Nothing selected means the panel is not rendered at all; no state to clear.
    if (selected === null) return;
    let cancelled = false;
    void fetchDatasetVersion(datasetId, selected)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [datasetId, selected, t]);

  const current = manifest && manifest.version === selected ? manifest.data : null;

  const showManifest = async (version: number) => {
    if (current) {
      setManifest(null);
      return;
    }
    try {
      setManifest({ version, data: await fetchVersionManifest(datasetId, version) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    }
  };

  const download = async (version: number, name: string) => {
    try {
      window.open(await fetchVersionDownloadUrl(datasetId, version, name), '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;

  if (versions.length === 0) {
    return (
      <>
        <EntityViewHeader title={t('datasets.versions')} subtitle={t('datasets.versionsHint')} />
        <EntityViewPanel>
          <EmptyState title={t('datasets.noVersions')} description={t('datasets.versionsHint')} />
        </EntityViewPanel>
      </>
    );
  }

  const newestPublished = versions.find((v) => v.status === 'published')?.version ?? null;
  const visible = versions.slice(page * pageSize, (page + 1) * pageSize);
  const selectedVersion = versions.find((v) => v.version === selected) ?? null;

  return (
    <>
      <EntityViewHeader title={t('datasets.versions')} subtitle={t('datasets.versionsHint')} />
      <EntityViewPanel>
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.version')}</th>
                <th>{t('datasets.versionStatus')}</th>
                <th>{t('datasets.versionFiles')}</th>
                <th>{t('datasets.versionRows')}</th>
                <th>{t('datasets.versionSize')}</th>
                <th>{t('datasets.versionWhen')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((version) => (
                <tr key={version.version}>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setSelected(version.version)}
                      aria-current={selected === version.version ? 'true' : undefined}
                    >
                      v{version.version}
                    </button>
                    {version.version === newestPublished ? (
                      <span className="page-subtitle"> · {t('datasets.versionLatest')}</span>
                    ) : null}
                    {version.notes ? (
                      <span className="page-subtitle"> · {version.notes}</span>
                    ) : null}
                  </td>
                  <td>
                    <StatusChip tone={TONE[version.status] ?? 'neutral'}>{version.status}</StatusChip>
                  </td>
                  <td>{version.file_count}</td>
                  <td>{version.row_count.toLocaleString()}</td>
                  <td>{bytes(version.byte_size)}</td>
                  <td title={version.published_at ?? version.created_at}>
                    {new Date(version.published_at ?? version.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            total={versions.length}
            page={page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </div>
      </EntityViewPanel>

      {selectedVersion ? (
        <EntityViewPanel>
          <div className="dataset-joins__toolbar">
            <h3>
              {t('datasets.versionFilesOf', { version: selectedVersion.version })}
            </h3>
            <StatusChip tone={TONE[selectedVersion.status] ?? 'neutral'}>
              {selectedVersion.status}
            </StatusChip>
          </div>
          {detail === null || detail.version !== selected ? (
            <p className="page-subtitle">{t('shared.loading')}</p>
          ) : detail.files.length === 0 ? (
            <p className="page-subtitle">{t('datasets.noFiles')}</p>
          ) : (
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{t('datasets.fileName')}</th>
                    <th>{t('datasets.fileDescription')}</th>
                    <th>{t('datasets.versionRows')}</th>
                    <th>{t('datasets.versionSize')}</th>
                    <th className="console-table-actions">{t('shared.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.files.map((file) => (
                    <tr key={file.name}>
                      <td>{file.name}</td>
                      <td>
                        {file.description ?? <span className="page-subtitle">{t('datasets.dash')}</span>}
                      </td>
                      <td>{file.rows.toLocaleString()}</td>
                      <td>{bytes(file.bytes)}</td>
                      <td className="console-table-actions">
                        <button
                          type="button"
                          title={t('datasets.download')}
                          aria-label={t('datasets.download')}
                          onClick={() => void download(selectedVersion.version, file.name)}
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
      ) : null}

      {selectedVersion ? (
        <EntityViewPanel>
          <div className="dataset-joins__toolbar">
            <h3>
              {t('datasets.manifest')}
              <span className="page-subtitle">
                {' '}
                · {t('datasets.manifestOf', { version: selectedVersion.version })}
              </span>
            </h3>
          </div>
          <details className="dataset-manifest">
            <summary onClick={() => void showManifest(selectedVersion.version)}>
              {t('datasets.manifestShow')}
            </summary>
            {current ? (
              <pre>{JSON.stringify(current, null, 2)}</pre>
            ) : (
              <p className="page-subtitle">{t('datasets.manifestHint')}</p>
            )}
          </details>
        </EntityViewPanel>
      ) : null}
    </>
  );
}
