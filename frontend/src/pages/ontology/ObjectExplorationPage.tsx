import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectType,
  fetchObjectInstances,
  fetchObjectTypes,
  type ObjectInstanceResponse,
  type ObjectTypeResponse,
  type LinkTypeResponse,
} from '../../data/ontologyApi';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { ListPage } from '../../styles/design-system/ListPage';
import { Loading } from '../../styles/design-system/Loading';
import {
  createExploration,
  fetchExploration,
  fetchExplorationLayout,
  fetchExplorations,
  filterTexts,
  type ExplorationLayoutChoice,
  patchExploration,
  saveExplorationLayout,
  type ExplorationResponse,
} from '../../data/explorationsApi';

import { useAuth } from '../../contexts/AuthContext';
import { ExplorerMenu } from '../../components/ontology/ExplorerMenu';
import { fetchOntologyActionTypes, type OntologyActionTypeResponse } from '../../data/ontologyActionsApi';
import { ObjectSetActionDialog } from './ObjectSetActionDialog';
import { ObjectSetChartBoard } from './ObjectSetChartBoard';
import { ObjectSetResults } from './ObjectSetResults';
import { useObjectSetCompare } from './useObjectSetCompare';
import { ObjectSetActionMenu } from './ObjectSetActionMenu';

import { useObjectSetAction } from './useObjectSetAction';
import { useObjectSetOutcome } from './useObjectSetOutcome';
import { ExplorationLayoutMenu } from './ExplorationLayoutMenu';
import { ObjectExplorationSaveDialog } from './ObjectExplorationSaveDialog';
import { ObjectSetFilters } from './ObjectSetFilters';
import { formatFilter } from './objectSetCondition';
import { addSpec, chartKey, type ChartSpec } from './objectSetChartsModel';
import { parseSortList, toggleSortTerm } from './objectSetSort';
import { useChartCatalog } from './useChartCatalog';
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
  const navigate = useNavigate();
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
  /* A refusal is not an empty set: a restricted model says why, and that reason has to stay on the page rather
     than fade out as a toast. */
  const [rowsError, setRowsError] = useState<string | null>(null);
  /* The object search lives in the URL (`?q=`), so "find objects of this type matching X" is a linkable address —
     that is what the home page hands over when a query names an object rather than a type. */
  const search = searchParams.get('q') ?? '';
  const setSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('q', value);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };
  /* A saved exploration is this same page with its conditions restored: `?saved=<id>` names the row, and the
     row is re-evaluated on open (it stores conditions, never results). */
  const savedId = searchParams.get('saved');
  const [saved, setSaved] = useState<ExplorationResponse | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const [saving, setSaving] = useState(false);
  /* The layout this type opens with: personal, then global, then the built-in one (prominent props). */
  /* The charts on screen, in order. A chart is its property plus what it measures and splits by — two charts may
     read one property with different measures. */
  const [chartSpecs, setChartSpecs] = useState<ChartSpec[] | null>(null);
  /* Which properties the results table shows, in order — part of the layout, so it is saved with the exploration. */
  const [layoutColumns, setLayoutColumns] = useState<string[]>([]);
  const [links, setLinks] = useState<LinkTypeResponse[]>([]);
  /* Actions are the one write an exploration offers: they run on the rows the caller ticked, never on the whole set. */
  const [actions, setActions] = useState<OntologyActionTypeResponse[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const outcome = useObjectSetOutcome();
  /* The types on the other side of those links: a chart may read a neighbour's property, and the option list has to
     know what that neighbour declares. */
  const [typeById, setTypeById] = useState<Record<string, ObjectTypeResponse>>({});
  const [pivotOpen, setPivotOpen] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutChoices, setLayoutChoices] = useState<ExplorationLayoutChoice[]>([]);
  const [allSaved, setAllSaved] = useState<ExplorationResponse[]>([]);
  const { set: compareSet } = useObjectSetCompare();
  const { isAdmin } = useAuth();

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

  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllRows = () =>
    setSelected((current) => {
      /* "Select all" means this page: the table shows one page, and ticking it twice clears it. */
      const all = instances.every((row) => current.has(row.id));
      const next = new Set(current);
      for (const row of instances) {
        if (all) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });

  const toggleSort = (prop: string) => {
    const next = toggleSortTerm(sort, prop);
    updateParams((params) => {
      if (next) params.set('sort', next);
      else params.delete('sort');
    });
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

  useEffect(() => {
    let cancelled = false;
    void fetchObjectTypes()
      .then((res) => {
        if (!cancelled) {
          setTypeById(Object.fromEntries(res.items.map((type) => [type.id, type])));
        }
      })
      .catch(() => {
        if (!cancelled) setTypeById({});
      });
    void fetchExplorations()
      .then((rows) => {
        if (!cancelled) setAllSaved(rows);
      })
      .catch(() => {
        if (!cancelled) setAllSaved([]);
      });
    void fetchOntologyActionTypes({ object_type_id: typeId })
      .then((rows) => {
        if (!cancelled) setActions(rows.filter((row) => row.status === 'active'));
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      });
    void fetchLinkTypes()
      .then((res) => {
        if (!cancelled) setLinks(res.items);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  /* A selection is a claim about specific objects: when the set changes it no longer means anything. */
  useEffect(() => {
    setSelected(new Set());
  }, [filters, search]);

  /* A chart list belongs to one type: clear it on a type change, before either layout request answers. */
  const loadedType = useRef<string | null>(null);
  const dismissOutcome = useRef(outcome.dismiss);
  dismissOutcome.current = outcome.dismiss;
  useEffect(() => {
    if (loadedType.current === typeId) return;
    loadedType.current = typeId;
    setChartSpecs(null);
    setLayoutColumns([]);
    setSelected(new Set());
    dismissOutcome.current();
  }, [typeId]);

  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    // Clear first: a chart list belongs to one type. Carrying the previous type's props into the next exploration
    // leaves the grid empty, because every name it kept is unknown to the type being opened.
    //
    // A saved exploration already names its charts, and the two requests race — so this one yields when the URL
    // carries `?saved=`.
    if (!savedId) setChartSpecs(null);
    void fetchExplorationLayout(typeId)
      .then((res) => {
        if (cancelled) return;
        const charts = (res.layout?.charts as ChartSpec[] | undefined) ?? [];
        const props = charts.map((chart) => chart.prop).filter(Boolean);
        if (!savedId) {
          setChartSpecs(props.length > 0 ? charts : null);
          setLayoutColumns((res.layout?.columns as string[] | undefined) ?? []);
        }
        setLayoutChoices(res.available ?? []);
      })
      .catch(() => {
        if (!cancelled && !savedId) setChartSpecs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [savedId, typeId]);

  const loadRows = useCallback(async () => {
    if (!typeId) return;
    setRowsLoading(true);
    setRowsError(null);
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
      const message = e instanceof Error ? e.message : t('objectSet.rowsFailed');
      setInstances([]);
      setTotal(null);
      setRowsError(message);
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
        // A saved exploration is a **view**, not just a filter: its charts, their order and the first perspective it
        // opened with are part of what was saved. Conditions alone reopened as whatever the type defaults to.
        const charts = (row.layout?.charts as ChartSpec[] | undefined) ?? [];
        if (charts.length > 0) setChartSpecs(charts);
        setLayoutColumns((row.layout?.columns as string[] | undefined) ?? []);
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
            if (row.layout?.perspective === 'results') params.set('view', 'results');
            else params.delete('view');
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

  const { properties, options: chartOptions, chartProperties, addable } = useChartCatalog({
    typeId,
    objectType,
    links,
    typeById,
    chartProps: chartSpecs ? chartSpecs.map((spec) => spec.prop) : null,
  });

  /* The specs on screen, seeded by the layout and edited by the caller. */
  const specs: ChartSpec[] = useMemo(
    () => chartSpecs ?? chartProperties.map((prop) => ({ prop })),
    [chartProperties, chartSpecs]
  );

  const visibleColumns = useMemo(() => {
    const known = new Set(properties.map((property) => property.name));
    const chosen = layoutColumns.filter((name) => known.has(name));
    return chosen.length > 0 ? chosen : properties.map((property) => property.name);
  }, [layoutColumns, properties]);

  const removeChart = (key: string) =>
    setChartSpecs(specs.filter((spec) => chartKey(spec) !== key));
  const moveChart = (prop: string, direction: -1 | 1) => {
    const index = specs.findIndex((spec) => chartKey(spec) === prop);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= specs.length) return;
    const next = [...specs];
    [next[index], next[target]] = [next[target], next[index]];
    setChartSpecs(next);
  };

  /* Pivot targets: every link touching this type, pointing at the object on the other side. */
  const pivots = useMemo(
    () =>
      links
        .filter(
          (link) =>
            link.source_object_type_id === typeId || link.target_object_type_id === typeId
        )
        .map((link) => {
          const outward = link.source_object_type_id === typeId;
          return {
            key: `${link.id}:${outward ? 'out' : 'in'}`,
            link: link.api_name ?? link.id,
            label: outward
              ? link.target_object_type_name ?? link.target_object_type_id
              : link.source_object_type_name ?? link.source_object_type_id,
            targetTypeId: outward ? link.target_object_type_id : link.source_object_type_id,
            viaName: link.name,
          };
        }),
    [links, typeId]
  );

  /* A pivot keeps the caller's conditions by moving them one hop out; a set that already crossed a link cannot be
     expressed on the other side without a second hop, so it is refused rather than widened. */
  const canPivot = filters.every((filter) => !filter.startsWith('@'));
  const pivotTo = (targetTypeId: string, linkName: string) => {
    setPivotOpen(false);
    const params = new URLSearchParams();
    for (const filter of filters) {
      const [prop, op, ...rest] = filter.split(':');
      params.append('f', `@${linkName}/${prop}:${op}:${rest.join(':')}`);
    }
    if (perspective === 'results') params.set('view', 'results');
    // The word the caller typed stays their question across the hop; only the subject changes.
    if (search.trim()) params.set('q', search.trim());
    const query = params.toString();
    navigate(`/object-explorer/explorations/${targetTypeId}${query ? `?${query}` : ''}`);
  };

  /** The layout currently on screen — what "save as my default" stores. */
  const currentLayout = () => ({
    charts: specs,
    columns: visibleColumns,
    sorts: parseSortList(sort).map((term) => ({ prop: term.prop, desc: term.desc })),
    perspective,
  });

  const saveAsMyLayout = async (scope: 'personal' | 'global' = 'personal') => {
    if (!typeId) return;
    setLayoutSaving(true);
    try {
      await saveExplorationLayout(typeId, currentLayout(), scope);
      const refreshed = await fetchExplorationLayout(typeId);
      setLayoutChoices(refreshed.available ?? []);
      toast.success(
        scope === 'global' ? t('objectSet.layoutSavedGlobal') : t('objectSet.layoutSaved')
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectSet.layoutFailed'));
    } finally {
      setLayoutSaving(false);
    }
  };

  const resetLayout = async () => {
    if (!typeId) return;
    setLayoutSaving(true);
    try {
      await saveExplorationLayout(typeId, {}, 'personal');
      setChartSpecs(null);
      toast.success(t('objectSet.layoutReset'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectSet.layoutFailed'));
    } finally {
      setLayoutSaving(false);
    }
  };

  const save = async () => {
    if (!typeId || !saveName.trim()) return;
    setSaving(true);
    try {
      const layout = currentLayout();
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

  const action = useObjectSetAction(({ name, succeeded }) => {
    outcome.capture(name, succeeded);
    setSelected(new Set());
    void loadRows();
  });

  if (loading) return <Loading label={t('objectSet.typeLoading')} />;
  if (!objectType) return <EmptyState title={t('objectSet.typeMissing')} />;

  return (
    <ListPage
      className="object-exploration"
      title={saved ? saved.name : objectType.name}
      subtitle={
        total === null
          ? objectType.description ?? undefined
          : [
              objectType.description,
              t('objectSet.objectCount', { count: total }),
              objectType.last_indexed_at
                ? t('objectSet.dataAsOf', {
                    time: new Date(objectType.last_indexed_at).toLocaleString(),
                  })
                : t('objectSet.neverIndexed'),
            ]
              .filter(Boolean)
              .join(' · ')
      }
      actions={
        <>
          <ExplorerMenu />
          <ExplorationLayoutMenu
            open={layoutOpen}
            choices={layoutChoices}
            saving={layoutSaving}
            isAdmin={isAdmin}
            onToggle={() => setLayoutOpen((value) => !value)}
            onUse={(choice) => {
              setLayoutOpen(false);
              const charts = (choice.layout?.charts as ChartSpec[] | undefined) ?? [];
              setChartSpecs(charts.length > 0 ? charts : null);
              setLayoutColumns((choice.layout?.columns as string[] | undefined) ?? []);
            }}
            onSave={(scope) => {
              setLayoutOpen(false);
              void saveAsMyLayout(scope);
            }}
            onReset={() => {
              setLayoutOpen(false);
              void resetLayout();
            }}
          />
          <ObjectSetActionMenu
            actions={actions}
            count={selected.size}
            onPick={action.setOpenAction}
          />
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
        {pivots.length > 0 ? (
          <div className="object-set-pivot">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-expanded={pivotOpen}
              disabled={!canPivot}
              title={canPivot ? undefined : t('objectSet.pivotNeedsPlainSet')}
              onClick={() => setPivotOpen((value) => !value)}
            >
              {t('objectSet.pivot')}
            </button>
            {pivotOpen && canPivot ? (
              <div className="object-set-pivot__panel" role="menu">
                {pivots.map((pivot) => (
                  <button
                    key={pivot.key}
                    type="button"
                    role="menuitem"
                    onClick={() => pivotTo(pivot.targetTypeId, pivot.link)}
                  >
                    <span>{pivot.label}</span>
                    <span className="object-set-pivot__via">
                      {t('objectSet.pivotVia', { name: pivot.viaName })}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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

      {rowsError ? <p className="object-set-refusal">{rowsError}</p> : null}

      {perspective === 'explore' ? (
        <ObjectSetChartBoard
          total={total}
          compareLabel={compareSet?.label ?? null}
          explorations={allSaved.filter(
            /* A baseline is the same set of things measured differently: another type's conditions cannot apply to
               this one, and offering them produced a refused request instead of a comparison. */
            (row) => row.object_type_id === typeId && row.id !== saved?.id
          )}
          onCompare={(next) =>
            updateParams((params) => {
              if (next) params.set('vs', next);
              else params.delete('vs');
            })
          }
          outcome={outcome.result}
          onDismissOutcome={outcome.dismiss}
          typeId={typeId}
          search={search}
          filters={filters}
          chartSpecs={specs}
          chartOptions={chartOptions}
          addable={addable}
          compare={compareSet ?? undefined}
          refreshKey={outcome.refreshKey}
          onLoaded={outcome.onLoaded}
          onSettings={(key, next) => {
            /* A setting that says nothing is not a setting: keep only the keys that were chosen. */
            const current = specs.find((spec) => chartKey(spec) === key);
            const cleaned: ChartSpec = { prop: current?.prop ?? key };
            if (next.metric && next.metric !== 'count') {
              cleaned.metric = next.metric;
              if (next.measure) cleaned.measure = next.measure;
            }
            if (next.split) cleaned.split = next.split;
            setChartSpecs(specs.map((spec) => (chartKey(spec) === key ? cleaned : spec)));
          }}
          onPick={(prop, value) => setFilters([...filters, formatFilter(prop, 'eq', value)])}
          onPickPair={(prop, value, splitProp, splitValue) =>
            /* One cell, two conditions — the cell means "this row *and* this column". */
            setFilters([
              ...filters,
              formatFilter(prop, 'eq', value),
              formatFilter(splitProp, 'eq', splitValue),
            ])
          }
          onPickRange={(prop, from, to) =>
            /* An interval is two conditions: `>= from` and `< to`. One bar, one readable pair of chips. */
            setFilters([
              ...filters,
              formatFilter(prop, 'ge', String(from)),
              formatFilter(prop, 'lt', String(to)),
            ])
          }
          onRemove={removeChart}
          onMove={moveChart}
          onAdd={(prop) => setChartSpecs(addSpec(specs, { prop }))}
        />
      ) : rowsLoading ? (
        <Loading label={t('objectSet.rowsLoading')} />
      ) : instances.length === 0 ? (
        <EmptyState title={t('objectSet.rowsEmpty')} />
      ) : (
        <ObjectSetResults
          total={total}
          instances={instances}
          properties={properties}
          visible={visibleColumns}
          sort={sort}
          selected={selected}
          onSort={toggleSort}
          onColumns={setLayoutColumns}
          onToggle={toggleRow}
          onToggleAll={toggleAllRows}
        />
      )}

      <ObjectSetActionDialog
        action={action.openAction}
        count={selected.size}
        busy={action.busy}
        onClose={() => action.setOpenAction(null)}
        onSubmit={(input) => void action.run([...selected], input)}
      />

      <ObjectExplorationSaveDialog
        open={saveOpen}
        updating={Boolean(saved)}
        name={saveName}
        shared={saveShared}
        saving={saving}
        onName={setSaveName}
        onShared={setSaveShared}
        onClose={() => setSaveOpen(false)}
        onSave={() => void save()}
      />
    </ListPage>
  );
}
