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
import {
  createExploration,
  fetchExploration,
  filterTexts,
  patchExploration,
  type ExplorationResponse,
} from '../../data/explorationsApi';
import { Dialog, FormField } from '../../styles/design-system';
import { ExplorerMenu } from '../../components/ontology/ExplorerMenu';
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
  /* A saved exploration is this same page with its conditions restored: `?saved=<id>` names the row, and the
     row is re-evaluated on open (it stores conditions, never results). */
  const savedId = searchParams.get('saved');
  const [saved, setSaved] = useState<ExplorationResponse | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!savedId) {
      setSaved(null);
      return;
    }
    let cancelled = false;
    void fetchExploration(savedId)
      .then((row) => {
        if (cancelled) return;
        setSaved(row);
        setSaveName(row.name);
        setSaveShared(row.visibility === 'shared');
        // The updater form keeps the current params without making this effect depend on them.
        setSearchParams(
          (previous) => {
            const params = new URLSearchParams(previous);
            params.delete('f');
            for (const text of filterTexts(row.filters)) params.append('f', text);
            const layoutSort = (row.layout?.sorts as
              | { prop: string; desc?: boolean }[]
              | undefined)?.[0];
            if (layoutSort) params.set('sort', `${layoutSort.desc ? '-' : ''}${layoutSort.prop}`);
            return params;
          },
          { replace: true }
        );
      })
      .catch(() => toast.error(t('objectSet.savedLoadFailed')));
    return () => {
      cancelled = true;
    };
  }, [savedId, setSearchParams, t]);

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

  const save = async () => {
    if (!typeId || !saveName.trim()) return;
    setSaving(true);
    try {
      const layout = {
        charts: chartProperties.map((prop) => ({ prop })),
        sorts: sort ? [{ prop: sort.replace(/^-/, ''), desc: sort.startsWith('-') }] : [],
        perspective,
      };
      if (saved) {
        const row = await patchExploration(saved.id, {
          name: saveName.trim(),
          visibility: saveShared ? 'shared' : 'private',
          filters,
          layout,
        });
        setSaved(row);
        toast.success(t('objectSet.savedUpdated'));
      } else {
        const row = await createExploration({
          name: saveName.trim(),
          object_type_id: typeId,
          filters,
          layout,
          visibility: saveShared ? 'shared' : 'private',
        });
        setSaved(row);
        updateParams((params) => params.set('saved', row.id));
        toast.success(t('objectSet.savedCreated'));
      }
      setSaveOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectSet.savedFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label={t('objectSet.typeLoading')} />;
  if (!objectType) return <EmptyState title={t('objectSet.typeMissing')} />;

  return (
    <ListPage
      className="object-exploration"
      title={saved ? saved.name : objectType.name}
      subtitle={
        total === null
          ? objectType.description ?? undefined
          : [objectType.description, t('objectSet.objectCount', { count: total })]
              .filter(Boolean)
              .join(' · ')
      }
      actions={
        <>
          <ExplorerMenu />
          <button
            type="button"
            className="btn btn-primary"
          onClick={() => {
            setSaveName(saved?.name ?? objectType.name);
            setSaveOpen(true);
          }}
        >
            {saved ? t('objectSet.saveUpdate') : t('objectSet.saveCreate')}
          </button>
        </>
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

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={saved ? t('objectSet.saveUpdate') : t('objectSet.saveCreate')}
        closeAriaLabel={t('shared.close')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setSaveOpen(false)}>
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving || !saveName.trim()}
            >
              {t('shared.save')}
            </button>
          </>
        }
      >
        <FormField label={t('objectSet.saveName')}>
          <input
            className="ds-control"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('objectSet.saveNamePlaceholder')}
          />
        </FormField>
        <FormField label={t('objectSet.saveVisibility')} hint={t('objectSet.saveVisibilityHint')}>
          <select
            className="ds-control"
            value={saveShared ? 'shared' : 'private'}
            onChange={(e) => setSaveShared(e.target.value === 'shared')}
          >
            <option value="private">{t('objectSet.visibilityPrivate')}</option>
            <option value="shared">{t('objectSet.visibilityShared')}</option>
          </select>
        </FormField>
      </Dialog>
    </ListPage>
  );
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
