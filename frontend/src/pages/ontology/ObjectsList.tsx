import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Box, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import { fetchOntologyGroups, type OntologyGroupResponse } from '../../data/ontologyGroupsApi';
import {
  deleteExploration,
  fetchExplorations,
  type ExplorationResponse,
} from '../../data/explorationsApi';
import { ListPage } from '../../styles/design-system/ListPage';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';
import { OntologyScopePicker } from './OntologyScopePicker';
import { typeOption } from './ontologyScopeOption';
import './ObjectSet.scss';

type Section = { key: string; title: string; count: number; types: ObjectTypeResponse[] };

/** Why a card matched: the property whose name hit the query, when the type name and description did not. */
type MatchedProperties = Record<string, string>;

/**
 * The explorer's home: pick a type to explore, or reopen a saved exploration.
 *
 * The left column is the ontology's own grouping — the thing that makes seventeen types scannable — and the search
 * runs **inside whatever the navigation is showing**: a group narrows both, and widening the scope back to a set
 * (or to all) is the picker's job. That inheritance is the whole point: one place decides the context, the other
 * can widen it, and neither has to be explained twice.
 */
export function ObjectsList() {
  const { t } = useTranslation('explore');
  const [searchParams, setSearchParams] = useSearchParams();
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [groups, setGroups] = useState<OntologyGroupResponse[]>([]);
  const [saved, setSaved] = useState<ExplorationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const scope = useMemo(
    () => (searchParams.get('scope') ?? '').split(',').filter(Boolean),
    [searchParams]
  );
  const nav = searchParams.get('nav') ?? 'all';
  /* The search inherits the navigation: inside a group, "All" means that group. Picking types in the scope picker
     replaces the inherited set, which is why the navigation highlight falls back to 全部 (the scope is no longer
     one group). */
  const inherited = nav !== 'all' && nav !== 'mine' ? [nav] : [];
  const effectiveScope = scope.length > 0 ? scope : inherited;
  /** One write for several keys: two `setParam` calls would each start from the same stale snapshot. */
  const setParams = (patch: Record<string, string | null>) => {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
        return params;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchObjectTypes({ countFromNeo4j: true }),
      fetchOntologyGroups().catch(() => []),
      fetchExplorations().catch(() => []),
    ])
      .then(([typePage, groupRows, savedRows]) => {
        if (cancelled) return;
        setTypes(typePage.items);
        setGroups(groupRows);
        setSaved(savedRows);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t('objects.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const { sections, matchedProps } = useMemo<{ sections: Section[]; matchedProps: MatchedProperties }>(() => {
    const matchedProps: MatchedProperties = {};
    const needle = query.trim().toLowerCase();
    const inScope = (groupId: string, type: ObjectTypeResponse) =>
      effectiveScope.length === 0 ||
      effectiveScope.includes(groupId) ||
      effectiveScope.includes(type.id);
    /* A type matches by name, description, or the name of one of its properties — "which types carry
       `trade_date`?" is a question the box has to answer, not a detail. */
    const matchedProperty = (type: ObjectTypeResponse): string | null => {
      if (!needle) return null;
      if (type.name.toLowerCase().includes(needle)) return null;
      if ((type.description ?? '').toLowerCase().includes(needle)) return null;
      const property = (type.properties ?? []).find((p) =>
        p.name.toLowerCase().includes(needle)
      );
      return property ? property.name : null;
    };
    const matches = (type: ObjectTypeResponse) =>
      !needle ||
      type.name.toLowerCase().includes(needle) ||
      (type.description ?? '').toLowerCase().includes(needle) ||
      matchedProperty(type) !== null;

    const claimed = new Set<string>();
    const out: Section[] = [];
    for (const group of groups) {
      const members = types.filter(
        (type) => group.object_type_ids.includes(type.id) && matches(type) && inScope(group.id, type)
      );
      if (members.length === 0) continue;
      members.forEach((type) => {
        claimed.add(type.id);
        const property = matchedProperty(type);
        if (property) matchedProps[type.id] = property;
      });
      out.push({ key: group.id, title: group.display_name, count: members.length, types: members });
    }
    {
      // Types the ontology has not grouped. With a scope set, only the ones named explicitly.
      const rest = types.filter(
        (type) =>
          !claimed.has(type.id) &&
          matches(type) &&
          (effectiveScope.length === 0 || effectiveScope.includes(type.id))
      );
      rest.forEach((type) => {
        const property = matchedProperty(type);
        if (property) matchedProps[type.id] = property;
      });
      if (rest.length > 0) {
        out.push({
          key: '__ungrouped',
          title: t('objects.ungrouped'),
          count: rest.length,
          types: rest,
        });
      }
    }
    return { sections: out, matchedProps };
  }, [types, groups, query, effectiveScope, t]);

  /* Why a card is in the list: the property whose name hit the query, when the name and description did not. */
  const propertyHit = (typeId: string) => matchedProps[typeId];

  const removeExploration = async (id: string) => {
    try {
      await deleteExploration(id);
      setSaved((rows) => rows.filter((row) => row.id !== id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objects.deleteExplorationFailed'));
    }
  };

  const groupOptions = groups.map((group) => ({
    id: group.id,
    label: group.display_name,
    detail: types
      .filter((type) => group.object_type_ids.includes(type.id))
      .map((type) => type.name)
      .join(', '),
    count: group.object_type_ids.length,
  }));

  const showSaved = nav === 'all' || nav === 'mine';
  const empty = !loading && sections.length === 0 && !(showSaved && saved.length > 0);

  return (
    <ListPage title={t('objects.title')} subtitle={t('objects.subtitle')}>
      <div className="ontology-home">
        <nav className="ontology-home__nav" aria-label={t('objects.groupNav')}>
          <button
            type="button"
            className="ontology-home__nav-item"
            aria-pressed={nav !== 'mine' && effectiveScope.length === 0}
            onClick={() => setParams({ nav: null, scope: null })}
          >
            {t('objects.navAll')}
          </button>
          <button
            type="button"
            className="ontology-home__nav-item"
            aria-pressed={nav === 'mine'}
            onClick={() => setParams({ nav: 'mine', scope: null })}
          >
            {t('objects.myExplorations')}
            {saved.length > 0 ? <span className="ontology-home__nav-count">{saved.length}</span> : null}
          </button>
          <p className="ds-eyebrow ontology-home__nav-title">{t('objects.groupNavTitle')}</p>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="ontology-home__nav-item"
              aria-pressed={nav !== 'mine' && effectiveScope.length === 1 && effectiveScope[0] === group.id}
              onClick={() => setParams({ nav: group.id, scope: null })}
            >
              <span className="ontology-home__nav-label">{group.display_name}</span>
              <span className="ontology-home__nav-count">{group.object_type_ids.length}</span>
            </button>
          ))}
        </nav>

        <div className="ontology-home__main">
          <div className="ontology-home-search">
            <OntologyScopePicker
              groups={groupOptions}
              types={types.map(typeOption)}
              selected={scope}
              inherited={inherited}
              onChange={(next) => {
                /* An explicit set replaces the inheritance; "remove all" must therefore drop the navigation's
                   group too, or the group would stay checked with no way to clear it. */
                const keepsInheritance =
                  next.length === 1 && inherited.length === 1 && next[0] === inherited[0];
                setParams({
                  scope: next.join(',') || null,
                  nav: keepsInheritance ? nav : null,
                });
              }}
            />
            <span className="ontology-home-search__divider" aria-hidden />
            <input
              className="ds-control ontology-home-search__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('objects.searchPlaceholder')}
              aria-label={t('objects.searchPlaceholder')}
            />
          </div>

          {loading ? <Loading label={t('shared.loading')} /> : null}

          {showSaved && saved.length > 0 ? (
            <section className="ontology-home-group">
              <h2 className="ds-eyebrow ontology-home-group__title">
                {t('objects.myExplorations')}
                <span className="ontology-home-group__count">{saved.length}</span>
              </h2>
              <div className="ontology-home-grid">
                {saved.map((row) => (
                  <article key={row.id} className="ontology-home-card">
                    <span className="ontology-home-card__icon">
                      <Box size={20} strokeWidth={1.5} aria-hidden />
                    </span>
                    <span className="ontology-home-card__body">
                      <Link
                        className="ontology-home-card__name"
                        to={`/object-explorer/explorations/${row.object_type_id}?saved=${row.id}`}
                      >
                        {row.name}
                      </Link>
                      <span className="ontology-home-card__desc">
                        {[
                          row.object_type_name ?? row.object_type_id,
                          row.visibility === 'shared'
                            ? t('objects.sharedExploration')
                            : t('objects.privateExploration'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {row.mine ? (
                      <button
                        type="button"
                        className="ontology-home-card__remove"
                        aria-label={t('objects.deleteExploration', { name: row.name })}
                        onClick={() => void removeExploration(row.id)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!loading && nav !== 'mine' ? (
            <h2 className="ontology-home-divider">
              <span>{t('objects.startNew')}</span>
            </h2>
          ) : null}

          {empty ? (
            <EmptyState
              icon={<Box size={48} strokeWidth={1} />}
              title={query.trim() ? t('objects.noMatch') : t('objects.empty')}
            />
          ) : null}

          {nav !== 'mine'
            ? sections.map((section) => (
                <section key={section.key} className="ontology-home-group">
                  <h2 className="ds-eyebrow ontology-home-group__title">
                    {section.title}
                    <span className="ontology-home-group__count">{section.count}</span>
                  </h2>
                  <div className="ontology-home-grid">
                    {section.types.map((ot) => (
                      <Link
                        key={ot.id}
                        to={`/object-explorer/explorations/${ot.id}`}
                        className="ontology-home-card"
                        title={ot.description || undefined}
                      >
                        <span className="ontology-home-card__icon">
                          <Box size={20} strokeWidth={1.5} aria-hidden />
                        </span>
                        <span className="ontology-home-card__body">
                          <span className="ontology-home-card__name">{ot.name}</span>
                          {propertyHit(ot.id) ? (
                            <span className="ontology-home-card__desc">
                              {t('objects.matchedProperty', { name: propertyHit(ot.id) })}
                            </span>
                          ) : ot.description ? (
                            <span className="ontology-home-card__desc">{ot.description}</span>
                          ) : null}
                        </span>
                        <span className="ontology-home-card__count">{ot.instance_count}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            : null}
        </div>
      </div>
    </ListPage>
  );
}
