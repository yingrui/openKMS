import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchLinkTypes, type LinkTypeResponse } from '../data/ontologyApi';
import './LinksList.css';

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
    <div className="links-list">
      <div className="page-header links-header">
        <div>
          <h1>{t('links.title')}</h1>
          <p className="page-subtitle">{t('links.subtitle')}</p>
        </div>
      </div>

      {loading && <p className="links-loading">{t('shared.loading')}</p>}

      {!loading && types.length === 0 && (
        <div className="links-empty">
          <Link2 size={48} strokeWidth={1} />
          <p>{t('links.empty')}</p>
        </div>
      )}

      <div className="links-grid">
        {types.map((lt) => (
          <Link key={lt.id} to={`/links/${lt.id}`} className="links-card">
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
    </div>
  );
}
