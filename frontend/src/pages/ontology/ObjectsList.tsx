import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import { ListPage } from '../../styles/design-system/ListPage';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';

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
    <ListPage title={t('objects.title')} subtitle={t('objects.subtitle')}>
      {loading ? <Loading label={t('shared.loading')} /> : null}

      {!loading && types.length === 0 ? (
        <EmptyState icon={<Box size={48} strokeWidth={1} />} title={t('objects.empty')} />
      ) : null}

      <div className="ds-resource-list-grid">
        {types.map((ot) => (
          <Link key={ot.id} to={`/object-explorer/objects/${ot.id}`} className="ds-resource-list-card">
            <div className="ds-resource-list-card-top">
              <div className="ds-resource-list-icon">
                <Box size={28} strokeWidth={1.5} />
              </div>
            </div>
            <h3>{ot.name}</h3>
            <p className="ds-resource-list-desc">{ot.description || t('shared.noDescription')}</p>
            <div className="ds-resource-list-meta">
              <span>{t('ontology.instanceCount', { count: ot.instance_count })}</span>
              {ot.properties?.length ? (
                <span>{t('ontology.propertyCount', { count: ot.properties.length })}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </ListPage>
  );
}
