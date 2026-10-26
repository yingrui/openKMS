import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetVersion,
  fetchDatasetVersions,
  fetchVersionDownloadUrl,
  type DatasetVersion,
  type DatasetVersionDetail,
} from '../../data/datasetVersionsApi';
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
  /** The version whose files are open — the list endpoint carries counts, not the files. */
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [detail, setDetail] = useState<DatasetVersionDetail | null>(null);

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

  const toggle = async (version: number) => {
    if (openVersion === version) {
      setOpenVersion(null);
      setDetail(null);
      return;
    }
    setOpenVersion(version);
    setDetail(null);
    try {
      setDetail(await fetchDatasetVersion(datasetId, version));
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
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => void toggle(v.version)}
                        aria-expanded={openVersion === v.version}
                      >
                        {openVersion === v.version ? (
                          <ChevronDown size={14} aria-hidden />
                        ) : (
                          <ChevronRight size={14} aria-hidden />
                        )}
                        v{v.version}
                      </button>
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
                    {openVersion === v.version ? (
                      <tr>
                        <td colSpan={7}>
                          {detail === null ? (
                            <span className="page-subtitle">{t('shared.loading')}</span>
                          ) : detail.files.length === 0 ? (
                            <span className="page-subtitle">{t('datasets.noFiles')}</span>
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
                                  {detail.files.map((file) => (
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
                                          onClick={() => void download(v.version, file.name)}
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
                        </td>
                      </tr>
                    ) : null}
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
