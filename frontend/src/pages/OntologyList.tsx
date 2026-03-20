import { useEffect, useState } from 'react';
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
      toast.error(e instanceof Error ? e.message : 'Failed to load ontology');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="ontology-list">
      <div className="page-header ontology-header">
        <div>
          <h1>Ontology</h1>
          <p className="page-subtitle">
            Browse object types and link types. Schema is managed in Console → Object Types / Link Types.
          </p>
        </div>
      </div>

      {loading && <p className="ontology-loading">Loading...</p>}

      {!loading && (
        <>
          <section className="ontology-section">
            <h2 className="ontology-section-title">Object Types</h2>
            {objectTypes.length === 0 ? (
              <div className="ontology-empty">
                <Box size={40} strokeWidth={1} />
                <p>No object types yet. Add them in Console → Object Types.</p>
              </div>
            ) : (
              <div className="ontology-grid">
                {objectTypes.map((t) => (
                  <Link key={t.id} to={`/objects/${t.id}`} className="ontology-card">
                    <div className="ontology-card-top">
                      <div className="ontology-icon ontology-icon-object">
                        <Box size={24} strokeWidth={1.5} />
                      </div>
                    </div>
                    <h3>{t.name}</h3>
                    <p className="ontology-desc">{t.description || 'No description'}</p>
                    <div className="ontology-meta">
                      <span>{t.instance_count} instance{t.instance_count !== 1 ? 's' : ''}</span>
                      {t.properties?.length ? (
                        <span>{t.properties.length} propert{t.properties.length !== 1 ? 'ies' : 'y'}</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="ontology-section">
            <h2 className="ontology-section-title">Link Types</h2>
            {linkTypes.length === 0 ? (
              <div className="ontology-empty">
                <Link2 size={40} strokeWidth={1} />
                <p>No link types yet. Add them in Console → Link Types.</p>
              </div>
            ) : (
              <div className="ontology-grid">
                {linkTypes.map((t) => (
                  <Link key={t.id} to={`/links/${t.id}`} className="ontology-card">
                    <div className="ontology-card-top">
                      <div className="ontology-icon ontology-icon-link">
                        <Link2 size={24} strokeWidth={1.5} />
                      </div>
                    </div>
                    <h3>{t.name}</h3>
                    <p className="ontology-desc">{t.description || 'No description'}</p>
                    <div className="ontology-meta">
                      <span className="ontology-type-arrow">
                        {t.source_object_type_name || 'Source'}
                        <ArrowRight size={14} />
                        {t.target_object_type_name || 'Target'}
                      </span>
                      <span>{t.link_count} link{t.link_count !== 1 ? 's' : ''}</span>
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
