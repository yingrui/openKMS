import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchObjectType,
  fetchObjectInstances,
  type ObjectInstanceResponse,
  type ObjectTypeResponse,
  type PropertyDef,
} from '../../data/ontologyApi';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { ListPage } from '../../styles/design-system/ListPage';
import { Loading } from '../../styles/design-system/Loading';
import { ObjectSetCharts } from './ObjectSetCharts';
import { ObjectSetFilters } from './ObjectSetFilters';
import { formatFilter } from './objectSetCondition';
import './ObjectSet.scss';

/**
 * One exploration session: a type, its conditions, and two renderings of the same object set.
 *
 * The charts are the primary surface — clicking a value narrows the set and every chart re-aggregates — while
 * results is the same set as rows. Nothing here writes: object rows are edited in the manager, not while
 * analysing them.
 */
export function ObjectExplorationPage() {
  const { t } = useTranslation('explore');
  const { typeId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => searchParams.getAll('f'), [searchParams]);
  const sort = searchParams.get('sort') ?? '';
  /* An exploration opens on the charts: that is what entering one means. The list is a perspective of the same
     set, not the landing state. */
  const perspective = searchParams.get('view') === 'results' ? 'results' : 'explore';

  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [instances, setInstances] = useState<ObjectInstanceResponse[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams);
    mutate(params);
    setSearchParams(params, { replace: true });
  };

  const setFilters = (next: string[]) =>
    updateParams((params) => {
      params.delete('f');
      for (const filter of next) params.append('f', filter);
    });

  const setPerspective = (next: 'explore' | 'results') =>
    updateParams((params) => {
      if (next === 'results') params.set('view', 'results');
      else params.delete('view');
    });

  const toggleSort = (prop: string) => {
    const term = sort
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.replace(/^-/, '') === prop);
    const next = !term ? prop : term.startsWith('-') ? '' : `-${prop}`;
    updateParams((params) => {
      if (next) params.set('sort', next);
      else params.delete('sort');
    });
  };

  const sortState = (prop: string): 'ascending' | 'descending' | 'none' => {
    const term = sort
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.replace(/^-/, '') === prop);
    if (!term) return 'none';
    return term.startsWith('-') ? 'descending' : 'ascending';
  };

  useEffect(() => {
    let cancelled = false;
    if (!typeId) return;
    setLoading(true);
    void fetchObjectType(typeId)
      .then((row) => {
        if (!cancelled) setObjectType(row);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('objectSet.typeLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeId, t]);

  const loadRows = useCallback(async () => {
    if (!typeId) return;
    setRowsLoading(true);
    try {
      const res = await fetchObjectInstances(typeId, {
        search: search.trim() || undefined,
        filters,
        sort: sort || undefined,
        limit: 200,
      });
      setInstances(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      setInstances([]);
      setTotal(null);
      toast.error(e instanceof Error ? e.message : t('objectSet.rowsFailed'));
    } finally {
      setRowsLoading(false);
    }
  }, [typeId, search, filters, sort, t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const properties: PropertyDef[] = useMemo(
    () => (objectType?.properties ?? []),
    [objectType]
  );

  const chartProperties = useMemo(
    () =>
      [
        ...(objectType?.display_property ? [objectType.display_property] : []),
        ...properties.map((p) => p.name),
      ]
        .filter((name, index, all) => all.indexOf(name) === index)
        .slice(0, 6),
    [objectType, properties]
  );

  if (loading) return <Loading label={t('objectSet.typeLoading')} />;
  if (!objectType) return <EmptyState title={t('objectSet.typeMissing')} />;

  return (
    <ListPage
      className="object-exploration"
      title={objectType.name}
      subtitle={
        total === null
          ? objectType.description ?? undefined
          : [objectType.description, t('objectSet.objectCount', { count: total })]
              .filter(Boolean)
              .join(' · ')
      }
    >
      <div className="object-set-toolbar">
        <input
          className="ds-control object-set-toolbar__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('objectSet.searchPlaceholder')}
          aria-label={t('objectSet.searchPlaceholder')}
        />
        {(['explore', 'results'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className="btn btn-secondary btn-sm object-set-viewbar__button"
            aria-pressed={perspective === mode}
            onClick={() => setPerspective(mode)}
          >
            {mode === 'explore' ? t('objectSet.viewExplore') : t('objectSet.viewResults')}
          </button>
        ))}
      </div>

      <ObjectSetFilters filters={filters} properties={properties} onChange={setFilters} />

      {perspective === 'explore' ? (
        <ObjectSetCharts
          typeId={typeId}
          search={search}
          filters={filters}
          properties={chartProperties}
          onPick={(prop, value) => setFilters([...filters, formatFilter(prop, 'eq', value)])}
        />
      ) : rowsLoading ? (
        <Loading label={t('objectSet.rowsLoading')} />
      ) : instances.length === 0 ? (
        <EmptyState title={t('objectSet.rowsEmpty')} />
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                {properties.map((p) => {
                  const state = sortState(p.name);
                  return (
                    <th key={p.name} aria-sort={state}>
                      <button
                        type="button"
                        className="object-set-sort"
                        onClick={() => toggleSort(p.name)}
                        title={t('objectSet.sortBy', { name: p.name })}
                      >
                        {p.name}
                        {state === 'ascending' ? ' ↑' : state === 'descending' ? ' ↓' : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {instances.map((row) => (
                <tr key={row.id}>
                  {properties.map((p) => (
                    <td key={p.name}>{cellText(row.data?.[p.name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ListPage>
  );
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
