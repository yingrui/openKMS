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
  type ExplorationResponse,
} from '../../data/explorationsApi';

import { useAuth } from '../../contexts/AuthContext';
import { ExplorerMenu } from '../../components/ontology/ExplorerMenu';
import {
  fetchApplicableActions,
  type ActionApplicability,
} from '../../data/ontologyActionsApi';
import { ObjectSetActionDialog } from './ObjectSetActionDialog';
import { ObjectSetChartBoard } from './ObjectSetChartBoard';
import { ObjectSetResults } from './ObjectSetResults';
import { ObjectSetToolbar } from './ObjectSetToolbar';
import { useObjectSetCompare } from './useObjectSetCompare';
import { ObjectSetActionMenu } from './ObjectSetActionMenu';

import { explorationSubtitle } from './explorationSubtitle';
import { inlineInput } from './useInlineActions';
import { useCompareRows } from './useCompareRows';
import { useLayoutSaving } from './useLayoutSaving';
import { useTableActions } from './useTableActions';
import { useRowSelection } from './useRowSelection';
import { actionCount, useObjectSetAction } from './useObjectSetAction';
import { formatCharts, formatColumns, parseCharts, parseColumns } from './objectSetUrl';
import { useBrowserHistory } from './useBrowserHistory';
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

  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [instances, setInstances] = useState<ObjectInstanceResponse[]>([]);
  /* How much of the set is on screen: a page size the reader chooses, plus the pages they asked for. */
  const [pageSize, setPageSize] = useState(200);
  const [extraPages, setExtraPages] = useState(0);
  const rowLimit = pageSize + extraPages;
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
  /* Charts and columns are in the URL, like conditions and sort: an exploration is an addressable state, and a
     second copy in component state is a second history that the back button cannot see. */
  const chartSpecs = useMemo(() => parseCharts(searchParams.get('c')), [searchParams]);
  const layoutColumns = useMemo(() => parseColumns(searchParams.get('cols')), [searchParams]);
  const [links, setLinks] = useState<LinkTypeResponse[]>([]);
  /* Actions are the one write an exploration offers: they run on the rows the caller ticked, never on the whole set. */
  /* What the menu may offer: asked of the backend, because only it can evaluate an action's submission criteria
     against this set. */
  const [actions, setActions] = useState<ActionApplicability[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const outcome = useObjectSetOutcome();
  /* The types on the other side of those links: a chart may read a neighbour's property, and the option list has to
     know what that neighbour declares. */
  const [typeById, setTypeById] = useState<Record<string, ObjectTypeResponse>>({});
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layoutChoices, setLayoutChoices] = useState<ExplorationLayoutChoice[]>([]);
  const [allSaved, setAllSaved] = useState<ExplorationResponse[]>([]);
  const { set: compareSet } = useObjectSetCompare();
  const { isAdmin } = useAuth();

  /**
   * Every change the reader makes is a new history entry, so the browser's Back button undoes it. Derived writes (the
   * charts a saved exploration carries, the initial seed) replace instead: they are part of arriving at the page, not
   * a step the reader took.
   */
  const updateParams = (
    mutate: (params: URLSearchParams) => void,
    options: { replace?: boolean } = {}
  ) => {
    const params = new URLSearchParams(searchParams);
    mutate(params);
    setSearchParams(params, { replace: options.replace ?? false });
  };

  const writeCharts = (next: ChartSpec[] | null, replace: boolean) =>
    updateParams((params) => {
      if (next && next.length > 0) params.set('c', formatCharts(next));
      else params.delete('c');
    }, { replace });

  const writeColumns = (next: string[], replace: boolean) =>
    updateParams((params) => {
      if (next.length > 0) params.set('cols', formatColumns(next));
      else params.delete('cols');
    }, { replace });

  /* A reader's edit is a history entry; a seed that comes with the page is not. */
  const setChartSpecs = (next: ChartSpec[] | null) => writeCharts(next, false);
  const setLayoutColumns = (next: string[]) => writeColumns(next, false);

  const setFilters = (next: string[]) =>
    updateParams((params) => {
      params.delete('f');
      for (const filter of next) params.append('f', filter);
    });

  const history = useBrowserHistory();

  const { toggleRow, toggleAllRows } = useRowSelection(instances, setSelected);

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

  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    void fetchApplicableActions({
      object_type_id: typeId,
      conditions: filters,
      object_ids: [...selected],
    })
      .then((rows) => {
        if (!cancelled) setActions(rows);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [typeId, filters, selected]);

  /* A selection is a claim about specific objects: when the set changes it no longer means anything. */
  useEffect(() => {
    setSelected(new Set());
  }, [filters, search]);

  /* A different set, or a different page size, is a different first page. */
  useEffect(() => {
    setExtraPages(0);
  }, [typeId, filters, search, sort, pageSize]);

  /* A chart list belongs to one type: clear it when the type changes. */
  const loadedType = useRef<string | null>(null);
  const dismissOutcome = useRef(outcome.dismiss);
  dismissOutcome.current = outcome.dismiss;
  useEffect(() => {
    if (loadedType.current === typeId) return;
    loadedType.current = typeId;
    writeCharts(null, true);
    writeColumns([], true);
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
    if (!savedId) writeCharts(null, true);
    void fetchExplorationLayout(typeId)
      .then((res) => {
        if (cancelled) return;
        const charts = (res.layout?.charts as ChartSpec[] | undefined) ?? [];
        const props = charts.map((chart) => chart.prop).filter(Boolean);
        if (!savedId) {
          writeCharts(props.length > 0 ? charts : null, true);
          writeColumns((res.layout?.columns as string[] | undefined) ?? [], true);
        }
        setLayoutChoices(res.available ?? []);
      })
      .catch(() => {
        if (!cancelled && !savedId) writeCharts(null, true);
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
        limit: rowLimit,
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
  }, [typeId, search, filters, sort, rowLimit, t]);

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
        if (charts.length > 0) writeCharts(charts, true);
        writeColumns((row.layout?.columns as string[] | undefined) ?? [], true);
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
    const params = new URLSearchParams();
    for (const filter of filters) {
      const [prop, op, ...rest] = filter.split(':');
      params.append('f', `@${linkName}/${prop}:${op}:${rest.join(':')}`);
    }
    // The word the caller typed stays their question across the hop; only the subject changes.
    if (search.trim()) params.set('q', search.trim());
    const query = params.toString();
    navigate(`/object-explorer/explorations/${targetTypeId}${query ? `?${query}` : ''}`);
  };

  /** The layout currently on screen — what "save as my default" stores. */
  const currentLayout = useCallback(() => ({
    charts: specs,
    columns: visibleColumns,
    sorts: parseSortList(sort).map((term) => ({ prop: term.prop, desc: term.desc })),
  }), [specs, sort, visibleColumns]);

  const layoutSaver = useLayoutSaving({
    typeId,
    buildLayout: currentLayout,
    onChoices: setLayoutChoices,
    onReset: () => setChartSpecs(null),
  });

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
        updateParams((params) => params.set('saved', row.id), { replace: true });
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

  /* What the table needs beyond rows: which cells an action edits, and what an id column points at. */
  const baseline = useCompareRows({ typeId, compareSet, search, limit: rowLimit });

  const { inlineActions, columnLabels } = useTableActions({
    actions,
    typeId,
    links,
    typeById,
    columns: visibleColumns,
    rows: instances,
  });

  /* An inline edit is one object and one value: no dialog, no selection. */
  const submitInline = (picked: ActionApplicability, row: { id: string }, value: unknown) =>
    void action.runInline(picked, row.id, inlineInput(picked, value));


  if (loading) return <Loading label={t('objectSet.typeLoading')} />;
  if (!objectType) return <EmptyState title={t('objectSet.typeMissing')} />;

  return (
    <ListPage
      className="object-exploration"
      title={saved ? saved.name : objectType.name}
      subtitle={explorationSubtitle(objectType, total, t)}
      actions={
        <>
          <ExplorerMenu />
          <ExplorationLayoutMenu
            open={layoutOpen}
            choices={layoutChoices}
            saving={layoutSaver.saving}
            isAdmin={isAdmin}
            onToggle={() => setLayoutOpen((value) => !value)}
            onUse={(choice) => {
              setLayoutOpen(false);
              const charts = (choice.layout?.charts as ChartSpec[] | undefined) ?? [];
              writeCharts(charts.length > 0 ? charts : null, true);
              writeColumns((choice.layout?.columns as string[] | undefined) ?? [], true);
            }}
            onSave={(scope) => {
              setLayoutOpen(false);
              void layoutSaver.saveAsMine(scope);
            }}
            onReset={() => {
              setLayoutOpen(false);
              void layoutSaver.reset();
            }}
          />
          <ObjectSetActionMenu
            actions={actions}
            count={selected.size}
            onPick={(picked) =>
              action.openFor(picked, picked.per_object ? 'selection' : 'single')
            }
            onPickSet={(picked) => action.openFor(picked, 'set')}
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
      <ObjectSetToolbar
        search={search}
        onSearch={setSearch}
        pivots={pivots}
        canPivot={canPivot}
        pivotBlockedReason={t('objectSet.pivotNeedsPlainSet')}
        onPivot={pivotTo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        addable={addable}
        onAddChart={(prop) => setChartSpecs(addSpec(specs, { prop }))}
      />

      <ObjectSetFilters filters={filters} properties={properties} onChange={setFilters} />

      {rowsError ? <p className="object-set-refusal">{rowsError}</p> : null}

      <ObjectSetChartBoard
          compareLabel={compareSet?.label ?? null}
          explorations={allSaved.filter(
            /* A baseline is the same set of things measured differently: another type's conditions cannot apply. */
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
          chartLabels={Object.fromEntries(chartOptions.map((option) => [option.value, option.label]))}
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
        />

      {/* The objects the charts describe, on the same screen: a chart tells you where they are, the table tells you
          which ones — and a mode you have to switch into is a table half the readers never find. */}
      {rowsLoading ? (
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
          inlineActions={inlineActions}
          onInlineSubmit={submitInline}
          labels={columnLabels}
          baseline={baseline}
          shown={instances.length}
          pageSize={pageSize}
          onPageSize={setPageSize}
          onLoadMore={() => setExtraPages((pages) => pages + 1)}
        />
      )}

      <ObjectSetActionDialog
        key={action.openAction?.id ?? 'none'}
        action={action.openAction}
        count={actionCount(action.scope, action.openAction, selected.size)}
        selectionTypeId={typeId}
        selection={instances.filter((row) => selected.has(row.id))}
        busy={action.busy}
        onClose={() => action.setOpenAction(null)}
        onSubmit={(input) =>
          void action.run(
            action.scope === 'set'
              ? { conditions: filters }
              : action.scope === 'single'
                ? { single: true }
                : { ids: [...selected] },
            input
          )
        }
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
