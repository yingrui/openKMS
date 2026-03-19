import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../data/ontologyApi';
import './ObjectsList.css';

export function ObjectsList() {
  const [types, setTypes] = useState<ObjectTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchObjectTypes({ countFromNeo4j: true });
      setTypes(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load object types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="objects-list">
      <div className="page-header objects-header">
        <div>
          <h1>Objects</h1>
          <p className="page-subtitle">
            Browse object types and their instances. Schema is managed in Console → Object Types.
          </p>
        </div>
      </div>

      {loading && <p className="objects-loading">Loading...</p>}

      {!loading && types.length === 0 && (
        <div className="objects-empty">
          <Box size={48} strokeWidth={1} />
          <p>No object types yet. Add them in Console → Object Types.</p>
        </div>
      )}

      <div className="objects-grid">
        {types.map((t) => (
          <Link key={t.id} to={`/objects/${t.id}`} className="objects-card">
            <div className="objects-card-top">
              <div className="objects-icon">
                <Box size={28} strokeWidth={1.5} />
              </div>
            </div>
            <h3>{t.name}</h3>
            <p className="objects-desc">{t.description || 'No description'}</p>
            <div className="objects-meta">
              <span>{t.instance_count} instance{t.instance_count !== 1 ? 's' : ''}</span>
              {t.properties?.length ? (
                <span>{t.properties.length} propert{t.properties.length !== 1 ? 'ies' : 'y'}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
