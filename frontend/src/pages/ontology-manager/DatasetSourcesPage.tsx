import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Database, ExternalLink, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDataset,
  fetchDatasets,
  fetchTablesFromSource,
  type DatasetResponse,
  type TableInfo,
} from '../../data/datasetsApi';
import { fetchAllDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EmptyState } from '../../styles/design-system';
import { DatasetAppTabs } from '../../components/ontology/DatasetAppTabs';
import '../ontology/ontology-admin.scss';

const tableKey = (source: string, table: TableInfo) => `${source}/${table.schema_name}.${table.table_name}`;

/**
 * Register datasets **in bulk, from the source they live in**.
 *
 * Registering one table at a time through the upload wizard is right for the first dataset and tedious
 * for the twentieth: a source with forty tables is one decision ("these, not those"), not forty. So
 * this page shows a source's tables with what is already registered, and adds the rest in one go.
 *
 * It reads with `data:read` (the same grant that lists datasets) and writes with `data:write` — the
 * checkboxes are simply disabled without it.
 */
export function DatasetSourcesPage() {
  const { t } = useTranslation('ontology');
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const canWrite = hasPermission('data:write');

  const [sources, setSources] = useState<DataSourceResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchAllDataSources(), fetchDatasets({ limit: 500 })])
      .then(([allSources, datasetPage]) => {
        if (cancelled) return;
        // Only a source this layer can register from: everything else is not an error to show, it is
        // simply not a place datasets come from (a graph store, say).
        const sourceList = allSources.filter((s) => s.kind === 'postgresql');
        setSources(sourceList);
        setDatasets(datasetPage.items);
        if (sourceList.length > 0) setSourceId(sourceList[0].id);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  /** Which tables are already datasets — a table is one when its source + schema.name match. */
  const registered = useMemo(() => {
    const map = new Map<string, string>();
    for (const dataset of datasets) {
      map.set(`${dataset.data_source_id}/${dataset.schema_name}.${dataset.table_name}`, dataset.id);
    }
    return map;
  }, [datasets]);

  useEffect(() => {
    if (!sourceId) {
      setTables(null);
      return;
    }
    let cancelled = false;
    setTables(null);
    setSelected(new Set());
    void fetchTablesFromSource(sourceId)
      .then((rows) => {
        if (!cancelled) setTables(rows);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t('datasets.loadTablesFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, t]);

  const pending = (tables ?? []).filter((table) => !registered.has(tableKey(sourceId, table)));
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const current = sources.find((s) => s.id === sourceId) ?? null;

  const addSelected = async () => {
    if (!sourceId || selected.size === 0) return;
    // A source can have a hundred tables, and some of them are nobody's dataset (`alembic_version`,
    // a jobs queue). The count and the source name are what a person needs to see before one click.
    if (
      !(await confirm({
        title: t('dataSources.addSelected', { count: selected.size }),
        message: t('dataSources.addConfirm', {
          count: selected.size,
          source: current?.name ?? '',
        }),
        confirmLabel: t('shared.create'),
      }))
    ) {
      return;
    }
    setBusy(true);
    let added = 0;
    const failures: string[] = [];
    try {
      for (const table of tables ?? []) {
        const key = tableKey(sourceId, table);
        if (!selected.has(key)) continue;
        try {
          await createDataset({
            data_source_id: sourceId,
            schema_name: table.schema_name,
            table_name: table.table_name,
          });
          added += 1;
        } catch (e) {
          failures.push(`${table.schema_name}.${table.table_name}: ${e instanceof Error ? e.message : ''}`);
        }
      }
      if (added > 0) {
        toast.success(t('dataSources.added', { count: added }));
        setDatasets((await fetchDatasets({ limit: 500 })).items);
        setSelected(new Set());
      }
      if (failures.length > 0) toast.error(failures[0], { description: t('dataSources.failed', { count: failures.length }) });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('dataSources.title')}</h1>
          <p className="page-subtitle">{t('dataSources.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <Link to="/console/data-sources" className="btn btn-secondary">
            <ExternalLink size={16} aria-hidden />
            {t('dataSources.manage')}
          </Link>
        </div>
      </header>
      <DatasetAppTabs />
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            icon={<Database size={48} strokeWidth={1} />}
            title={t('dataSources.empty')}
            description={t('dataSources.emptyHint')}
          />
        ) : (
          <>
            <div className="console-datasets-toolbar">
              <label className="console-datasets-filter">
                {t('dataSources.pick')}
                {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} · {source.kind}
                      {source.database ? ` · ${source.database}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="openkms-flex-row-gap">
                <span className="page-subtitle">
                  {t('dataSources.tableCount', {
                    total: (tables ?? []).length,
                    pending: pending.length,
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelected(new Set(pending.map((table) => tableKey(sourceId, table))))}
                  disabled={!canWrite || busy || pending.length === 0}
                >
                  {t('dataSources.selectAll')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void addSelected()}
                  disabled={!canWrite || busy || selected.size === 0}
                  title={canWrite ? undefined : t('dataSources.needWrite')}
                >
                  {busy ? (
                    <Loader2 size={14} className="spin" aria-hidden />
                  ) : (
                    <Plus size={14} aria-hidden />
                  )}
                  {t('dataSources.addSelected', { count: selected.size })}
                </button>
              </div>
            </div>

            {tables === null ? (
              <div className="console-loading">
                <Loader2 size={28} className="console-loading-spinner" aria-hidden />
              </div>
            ) : tables.length === 0 ? (
              <EmptyState title={t('dataSources.noTables')} description={t('dataSources.noTablesHint')} />
            ) : (
              <div className="ds-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>{t('dataSources.register')}</th>
                      <th>{t('datasets.filterColumn')}</th>
                      <th>{t('dataSources.dataset')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((table) => {
                      const key = tableKey(sourceId, table);
                      const datasetId = registered.get(key);
                      return (
                        <tr key={key}>
                          <td>
                            <input
                              type="checkbox"
                              className="ds-checkbox"
                              checked={selected.has(key)}
                              disabled={!canWrite || Boolean(datasetId)}
                              aria-label={t('dataSources.registerTable', {
                                table: `${table.schema_name}.${table.table_name}`,
                              })}
                              onChange={() => toggle(key)}
                            />
                          </td>
                          <td>
                            {table.schema_name}.{table.table_name}
                          </td>
                          <td>
                            {datasetId ? (
                              <Link to={`/datasets/${datasetId}`} className="console-table-link">
                                {t('dataSources.alreadyRegistered')}
                              </Link>
                            ) : (
                              <span className="page-subtitle">{t('dataSources.notRegistered')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {current?.database ? (
              <p className="page-subtitle">{`${current.host}${current.port ? `:${current.port}` : ''} · ${current.database}`}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
