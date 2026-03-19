import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchLinkTypes, type LinkTypeResponse } from '../data/ontologyApi';
import './LinksList.css';

export function LinksList() {
  const [types, setTypes] = useState<LinkTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchLinkTypes({ countFromNeo4j: true });
      setTypes(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load link types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="links-list">
      <div className="page-header links-header">
        <div>
          <h1>Links</h1>
          <p className="page-subtitle">
            Browse relationship types between objects. Schema is managed in Console → Link Types.
          </p>
        </div>
      </div>

      {loading && <p className="links-loading">Loading...</p>}

      {!loading && types.length === 0 && (
        <div className="links-empty">
          <Link2 size={48} strokeWidth={1} />
          <p>No link types yet. Add them in Console → Link Types.</p>
        </div>
      )}

      <div className="links-grid">
        {types.map((t) => (
          <Link key={t.id} to={`/links/${t.id}`} className="links-card">
            <div className="links-card-top">
              <div className="links-icon">
                <Link2 size={28} strokeWidth={1.5} />
              </div>
            </div>
            <h3>{t.name}</h3>
            <p className="links-desc">{t.description || 'No description'}</p>
            <div className="links-meta">
              <span className="links-type-arrow">
                {t.source_object_type_name || 'Source'}
                <ArrowRight size={14} />
                {t.target_object_type_name || 'Target'}
              </span>
              <span>{t.link_count} link{t.link_count !== 1 ? 's' : ''}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
