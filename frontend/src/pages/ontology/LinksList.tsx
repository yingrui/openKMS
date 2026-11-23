import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchLinkTypes, type LinkTypeResponse } from '../../data/ontologyApi';
import { ListPage } from '../../styles/design-system/ListPage';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';
import './LinksList.scss';

export function LinksList() {
  const { t } = useTranslation('explore');
  const [types, setTypes] = useState<LinkTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchLinkTypes({ countFromNeo4j: true });
      setTypes(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('links.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <ListPage title={t('links.title')} subtitle={t('links.subtitle')}>
      {loading ? <Loading label={t('shared.loading')} /> : null}

      {!loading && types.length === 0 ? (
        <EmptyState icon={<Link2 size={48} strokeWidth={1} />} title={t('links.empty')} />
      ) : null}

      <div className="links-grid">
        {types.map((lt) => (
          <Link key={lt.id} to={`/object-explorer/links/${lt.id}`} className="links-card">
            <div className="links-card-top">
              <div className="links-icon">
                <Link2 size={28} strokeWidth={1.5} />
              </div>
            </div>
            <h3>{lt.name}</h3>
            <p className="links-desc">{lt.description || t('shared.noDescription')}</p>
            <div className="links-meta">
              <span className="links-type-arrow">
                {lt.source_object_type_name || t('ontology.endpointSource')}
                <ArrowRight size={14} />
                {lt.target_object_type_name || t('ontology.endpointTarget')}
              </span>
              <span>{t('ontology.linkCount', { count: lt.link_count })}</span>
            </div>
          </Link>
        ))}
      </div>
    </ListPage>
  );
}
