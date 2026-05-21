import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import './ObjectsList.scss';

export function ObjectsList() {
  const { t } = useTranslation('explore');
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchObjectTypes({ countFromNeo4j: true });
      setTypes(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objects.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="objects-list">
      <div className="page-header objects-header">
        <div>
          <h1>{t('objects.title')}</h1>
          <p className="page-subtitle">{t('objects.subtitle')}</p>
        </div>
      </div>

      {loading && <p className="objects-loading">{t('shared.loading')}</p>}

      {!loading && types.length === 0 && (
        <div className="objects-empty">
          <Box size={48} strokeWidth={1} />
          <p>{t('objects.empty')}</p>
        </div>
      )}

      <div className="objects-grid">
        {types.map((ot) => (
          <Link key={ot.id} to={`/objects/${ot.id}`} className="objects-card">
            <div className="objects-card-top">
              <div className="objects-icon">
                <Box size={28} strokeWidth={1.5} />
              </div>
            </div>
            <h3>{ot.name}</h3>
            <p className="objects-desc">{ot.description || t('shared.noDescription')}</p>
            <div className="objects-meta">
              <span>{t('ontology.instanceCount', { count: ot.instance_count })}</span>
              {ot.properties?.length ? (
                <span>{t('ontology.propertyCount', { count: ot.properties.length })}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
