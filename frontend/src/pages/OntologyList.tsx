import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Box, Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchObjectTypes,
  fetchLinkTypes,
  type ObjectTypeResponse,
  type LinkTypeResponse,
} from '../data/ontologyApi';
import './OntologyList.css';

export function OntologyList() {
  const { t } = useTranslation('explore');
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [objRes, linkRes] = await Promise.all([
        fetchObjectTypes({ countFromNeo4j: true }),
        fetchLinkTypes({ countFromNeo4j: true }),
      ]);
      setObjectTypes(objRes.items);
      setLinkTypes(linkRes.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('ontology.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="ontology-list">
      <div className="page-header ontology-header">
        <div>
          <h1>{t('ontology.title')}</h1>
          <p className="page-subtitle">{t('ontology.subtitle')}</p>
        </div>
      </div>

      {loading && <p className="ontology-loading">{t('shared.loading')}</p>}

      {!loading && (
        <>
          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.objectTypesHeading')}</h2>
            {objectTypes.length === 0 ? (
              <div className="ontology-empty">
                <Box size={40} strokeWidth={1} />
                <p>{t('ontology.emptyObjectTypes')}</p>
              </div>
            ) : (
              <div className="ontology-grid">
                {objectTypes.map((ot) => (
                  <Link key={ot.id} to={`/objects/${ot.id}`} className="ontology-card">
                    <div className="ontology-card-top">
                      <div className="ontology-icon ontology-icon-object">
                        <Box size={24} strokeWidth={1.5} />
                      </div>
                    </div>
                    <h3>{ot.name}</h3>
                    <p className="ontology-desc">{ot.description || t('shared.noDescription')}</p>
                    <div className="ontology-meta">
                      <span>{t('ontology.instanceCount', { count: ot.instance_count })}</span>
                      {ot.properties?.length ? (
                        <span>{t('ontology.propertyCount', { count: ot.properties.length })}</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">{t('ontology.linkTypesHeading')}</h2>
            {linkTypes.length === 0 ? (
              <div className="ontology-empty">
                <Link2 size={40} strokeWidth={1} />
                <p>{t('ontology.emptyLinkTypes')}</p>
              </div>
            ) : (
              <div className="ontology-grid">
                {linkTypes.map((lt) => (
                  <Link key={lt.id} to={`/links/${lt.id}`} className="ontology-card">
                    <div className="ontology-card-top">
                      <div className="ontology-icon ontology-icon-link">
                        <Link2 size={24} strokeWidth={1.5} />
                      </div>
                    </div>
                    <h3>{lt.name}</h3>
                    <p className="ontology-desc">{lt.description || t('shared.noDescription')}</p>
                    <div className="ontology-meta">
                      <span className="ontology-type-arrow">
                        {lt.source_object_type_name || t('ontology.endpointSource')}
                        <ArrowRight size={14} />
                        {lt.target_object_type_name || t('ontology.endpointTarget')}
                      </span>
                      <span>{t('ontology.linkCount', { count: lt.link_count })}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
