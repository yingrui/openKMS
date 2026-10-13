import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetMetadata,
  fetchDatasetProfile,
  refreshDatasetProfile,
  updateColumnDescription,
  type ColumnMetadata,
  type DatasetProfileResponse,
} from '../../data/datasetsApi';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';

/** Dataset columns (physical) — with a maintained description and profile stats. */
export function DatasetColumnsTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();

  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiling, setProfiling] = useState(false);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [savingCol, setSavingCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const [cols, prof] = await Promise.all([
        fetchDatasetMetadata(datasetId),
        fetchDatasetProfile(datasetId).catch(() => null),
      ]);
      setMetadata(cols);
      setProfile(prof);
      setDescriptions(
        Object.fromEntries(cols.map((c) => [c.column_name, c.description ?? ''])),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadColumnsFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDescription = async (col: ColumnMetadata) => {
    const next = (descriptions[col.column_name] ?? '').trim();
    if (next === (col.description ?? '')) return;
    setSavingCol(col.column_name);
    try {
      await updateColumnDescription(datasetId, col.column_name, next || null);
      setMetadata((prev) =>
        prev.map((c) => (c.column_name === col.column_name ? { ...c, description: next || null } : c)),
      );
      toast.success(t('datasets.columnSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.columnSaveFailed'));
    } finally {
      setSavingCol(null);
    }
  };

  const refreshProfile = async () => {
    if (!datasetId) return;
    setProfiling(true);
    try {
      setProfile(await refreshDatasetProfile(datasetId));
      toast.success(t('datasets.profileRefreshed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.profileFailed'));
    } finally {
      setProfiling(false);
    }
  };

  const statsByColumn = useMemo(
    () => new Map((profile?.column_stats ?? []).map((s) => [s.column, s])),
    [profile],
  );
  const fmt = (v: unknown) => (v === null || v === undefined ? t('datasets.dash') : String(v));

  return (
    <>
      <EntityViewHeader title={t('datasets.columns')} subtitle={t('datasets.columnsHint')} />
      <EntityViewPanel>
        <div className="dataset-columns__toolbar">
          <span>
            {profile?.computed_at
              ? t('datasets.profileComputedAt', { time: profile.computed_at })
              : t('datasets.profileEmpty')}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void refreshProfile()}
            disabled={profiling}
          >
            {profiling ? <Loader2 size={14} className="console-loading-spinner" aria-hidden /> : null}
            {t('datasets.refreshProfile')}
          </button>
        </div>
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colColumn')}</th>
                  <th>{t('datasets.colDataType')}</th>
                  <th>{t('datasets.colNullable')}</th>
                  <th>{t('datasets.colPosition')}</th>
                  <th>{t('datasets.colDescription')}</th>
                  <th>{t('datasets.colNulls')}</th>
                  <th>{t('datasets.colDistinct')}</th>
                  <th>{t('datasets.colMin')}</th>
                  <th>{t('datasets.colMax')}</th>
                </tr>
              </thead>
              <tbody>
                {metadata.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="console-table-empty">
                      {t('datasets.emptyColumns')}
                    </td>
                  </tr>
                ) : (
                  metadata.map((col) => {
                    const s = statsByColumn.get(col.column_name);
                    return (
                      <tr key={col.column_name}>
                        <td>
                          <strong>{col.column_name}</strong>
                        </td>
                        <td>{col.data_type}</td>
                        <td>{col.is_nullable ? t('datasets.yes') : t('datasets.no')}</td>
                        <td>{col.ordinal_position}</td>
                        <td>
                          <input
                            type="text"
                            className="dataset-column-desc"
                            placeholder={t('datasets.colDescriptionPlaceholder')}
                            value={descriptions[col.column_name] ?? ''}
                            disabled={savingCol === col.column_name}
                            onChange={(e) =>
                              setDescriptions((prev) => ({
                                ...prev,
                                [col.column_name]: e.target.value,
                              }))
                            }
                            onBlur={() => void saveDescription(col)}
                          />
                        </td>
                        <td>{s ? fmt(s.null_count) : t('datasets.dash')}</td>
                        <td>{s ? fmt(s.distinct_count) : t('datasets.dash')}</td>
                        <td>{s ? fmt(s.min) : t('datasets.dash')}</td>
                        <td>{s ? fmt(s.max) : t('datasets.dash')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}
