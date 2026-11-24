import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import { fetchOntologyGroups, type OntologyGroupResponse } from '../../data/ontologyGroupsApi';
import { ListPage } from '../../styles/design-system/ListPage';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';
import './ObjectSet.scss';

type Section = { key: string; title: string; count: number; types: ObjectTypeResponse[] };

/**
 * The explorer's entry: choose a type to open an exploration.
 *
 * Types are grouped the way the ontology groups them (a flat list of seventeen is already hard to scan, and it
 * grows), and every card leads to an exploration session — browsing raw rows and editing them is the manager's
 * job, not this page's.
 */
export function ObjectsList() {
  const { t } = useTranslation('explore');
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [groups, setGroups] = useState<OntologyGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchObjectTypes({ countFromNeo4j: true }),
      fetchOntologyGroups().catch(() => []),
    ])
      .then(([typePage, groupRows]) => {
        if (cancelled) return;
        setTypes(typePage.items);
        setGroups(groupRows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('objects.loadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (type: ObjectTypeResponse) =>
      !needle ||
      type.name.toLowerCase().includes(needle) ||
      (type.description ?? '').toLowerCase().includes(needle);

    const visible = types.filter(matches);
    const claimed = new Set<string>();
    const out: Section[] = [];
    for (const group of groups) {
      const members = visible.filter((type) => group.object_type_ids.includes(type.id));
      if (members.length === 0) continue;
      members.forEach((type) => claimed.add(type.id));
      out.push({
        key: group.id,
        title: group.display_name,
        count: members.length,
        types: members,
      });
    }
    const rest = visible.filter((type) => !claimed.has(type.id));
    if (rest.length > 0) {
      out.push({
        key: '__ungrouped',
        title: t('objects.ungrouped'),
        count: rest.length,
        types: rest,
      });
    }
    return out;
  }, [types, groups, query, t]);

  const empty = !loading && sections.length === 0;

  return (
    <ListPage title={t('objects.title')} subtitle={t('objects.subtitle')}>
      <input
        className="ds-control object-set-toolbar__search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('objects.searchPlaceholder')}
        aria-label={t('objects.searchPlaceholder')}
      />

      {loading ? <Loading label={t('shared.loading')} /> : null}

      {empty ? (
        <EmptyState
          icon={<Box size={48} strokeWidth={1} />}
          title={query.trim() ? t('objects.noMatch') : t('objects.empty')}
        />
      ) : null}

      {sections.map((section) => (
        <section key={section.key} className="object-explorer-group">
          <h2 className="object-explorer-group__title">
            {section.title}
            <span className="object-explorer-group__count">{section.count}</span>
          </h2>
          <div className="ds-resource-list-grid">
            {section.types.map((ot) => (
              <Link
                key={ot.id}
                to={`/object-explorer/explorations/${ot.id}`}
                className="ds-resource-list-card"
              >
                <div className="ds-resource-list-card-top">
                  <div className="ds-resource-list-icon">
                    <Box size={26} strokeWidth={1.5} />
                  </div>
                </div>
                <h3>{ot.name}</h3>
                <p className="ds-resource-list-desc">
                  {ot.description || t('shared.noDescription')}
                </p>
                <div className="ds-resource-list-meta">
                  <span>{t('ontology.instanceCount', { count: ot.instance_count })}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </ListPage>
  );
}
