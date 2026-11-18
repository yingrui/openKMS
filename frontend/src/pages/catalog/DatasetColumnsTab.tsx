import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetMetadata,
  fetchDatasetModelFields,
  updateColumnAnnotation,
  fetchDatasetProfile,
  refreshDatasetProfile,
  updateColumnDescription,
  type ColumnMetadata,
  type DatasetModelFieldResponse,
  type DatasetProfileResponse,
} from '../../data/datasetsApi';
import { EntityViewHeader, EntityViewPanel } from '../shared/EntityViewShell';
import { useDatasetDetail } from './useDatasetDetail';

/** Dataset columns (physical) — with a maintained description and profile stats. */
export function DatasetColumnsTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  /* Statistics are a scan of a live table. A file dataset's columns come from the version it stored, so there
     is nothing to scan and no reason to offer a button that can only fail. */
  const canProfile = useDatasetDetail().dataset.kind === 'table';

  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [profile, setProfile] = useState<DatasetProfileResponse | null>(null);
  /* The time role is the column's own fact; a model's field only ever opts out, so it is read separately. */
  const [modelFields, setModelFields] = useState<DatasetModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiling, setProfiling] = useState(false);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [savingCol, setSavingCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const [cols, prof, fields] = await Promise.all([
        fetchDatasetMetadata(datasetId),
        canProfile ? fetchDatasetProfile(datasetId).catch(() => null) : Promise.resolve(null),
        fetchDatasetModelFields(datasetId).catch(() => []),
      ]);
      setMetadata(cols);
      setProfile(prof);
      setModelFields(fields);
      setDescriptions(
        Object.fromEntries(cols.map((c) => [c.column_name, c.description ?? ''])),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadColumnsFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t, canProfile]);

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
  const timeRoleByColumn = useMemo(() => {
    const map = new Map<string, { isTime: boolean; periodKind: string | null }>();
    for (const col of metadata) {
      map.set(col.column_name, { isTime: col.is_time, periodKind: col.period_kind });
    }
    return map;
  }, [metadata]);

  const TIME_PRESETS: { value: string; labelKey: string }[] = [
    { value: '', labelKey: 'datasets.timeRoleNone' },
    { value: '%Y-%m-%d', labelKey: 'datasets.timeRoleDay' },
    { value: '%G-W%V', labelKey: 'datasets.timeRoleWeek' },
    { value: '%Y-%m', labelKey: 'datasets.timeRoleMonth' },
    { value: '%Y-Q%n', labelKey: 'datasets.timeRoleQuarter' },
    { value: '%Y', labelKey: 'datasets.timeRoleYear' },
  ];

  /* The time role is the column's own fact (`time_format`): set it here, once, for every model that reads it. */
  const saveTimeFormat = async (column: string, timeFormat: string | null) => {
    setSavingCol(column);
    try {
      await updateColumnAnnotation(datasetId, column, { time_format: timeFormat });
      setMetadata(await fetchDatasetMetadata(datasetId));
      toast.success(t('datasets.columnSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.columnSaveFailed'));
    } finally {
      setSavingCol(null);
    }
  };

  const timeFormatOf = (column: string) =>
    metadata.find((c) => c.column_name === column)?.time_format ?? null;

  /* A model may keep a temporal column out of its time axis; that is a statement about the model, so it is
     shown next to the column's own role rather than hidden. */
  const overriddenIn = (column: string) =>
    modelFields
      .filter((f) => f.column_name === column && f.overridden)
      .map((f) => f.model_name);

  const fmt = (v: unknown) => (v === null || v === undefined ? t('datasets.dash') : String(v));

  return (
    <>
      <EntityViewHeader title={t('datasets.columns')} subtitle={t('datasets.columnsHint')} />
      <EntityViewPanel>
        <div className="dataset-detail-data">
          <div className="dataset-columns__toolbar">
            <span>
              {!canProfile
                ? null
                : profile?.computed_at
                  ? [
                      t('datasets.profileRows', { count: profile.row_count ?? 0 }),
                      t('datasets.profileComputedAt', { time: profile.computed_at }),
                    ].join(' · ')
                  : t('datasets.profileEmpty')}
            </span>
            {canProfile ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void refreshProfile()}
                disabled={profiling}
              >
                {profiling ? <Loader2 size={14} className="ds-loading__spinner" aria-hidden /> : null}
                {t('datasets.refreshProfile')}
              </button>
            ) : null}
          </div>
          {loading ? (
            <div className="ds-loading">
              <Loader2 size={32} className="ds-loading__spinner" aria-hidden />
              <p>{t('shared.loading')}</p>
            </div>
          ) : (
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>{t('datasets.colColumn')}</th>
                    <th>{t('datasets.colDataType')}</th>
                    <th>{t('datasets.colNullable')}</th>
                    <th>{t('datasets.colPosition')}</th>
                    <th>{t('datasets.colDescription')}</th>
                    <th>{t('datasets.colTimeRole')}</th>
                    <th>{t('datasets.colNulls')}</th>
                    <th>{t('datasets.colDistinct')}</th>
                    <th>{t('datasets.colMin')}</th>
                    <th>{t('datasets.colMax')}</th>
                  </tr>
                </thead>
                <tbody>
                  {metadata.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="ds-table-empty">
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
                              className="ds-control ds-control--compact dataset-column-desc"
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
                          <td>
                            <div className="dataset-columns__time-role">
                              <select
                                className="ds-control"
                                value={timeFormatOf(col.column_name) ?? ''}
                                onChange={(e) =>
                                  void saveTimeFormat(col.column_name, e.target.value || null)
                                }
                                disabled={savingCol === col.column_name}
                              >
                                {TIME_PRESETS.map((preset) =>
                                  preset.value ? (
                                    <option key={preset.value} value={preset.value}>
                                      {t(preset.labelKey)}
                                    </option>
                                  ) : (
                                    /* An empty format means two different things: a temporal column is a time
                                       dimension by type, and every other column simply is not one. */
                                    <option key={preset.value} value={preset.value}>
                                      {timeRoleByColumn.get(col.column_name)?.isTime
                                        ? t('datasets.timeRoleByType', {
                                            kind: timeRoleByColumn.get(col.column_name)?.periodKind ?? '',
                                          })
                                        : t('datasets.timeRoleNone')}
                                    </option>
                                  ),
                                )}
                                {timeFormatOf(col.column_name) &&
                                !TIME_PRESETS.some(
                                  (p) => p.value === timeFormatOf(col.column_name),
                                ) ? (
                                  <option value={timeFormatOf(col.column_name) ?? ''}>
                                    {timeFormatOf(col.column_name)}
                                  </option>
                                ) : null}
                              </select>
                              {overriddenIn(col.column_name).length > 0 ? (
                                <span className="dataset-columns__time-role-note">
                                  {t('datasets.timeRoleOverriddenIn', {
                                    models: overriddenIn(col.column_name).join(' · '),
                                  })}
                                </span>
                              ) : null}
                            </div>
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
        </div>
      </EntityViewPanel>
    </>
  );
}
