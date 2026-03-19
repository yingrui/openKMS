import { Compass } from 'lucide-react';
import './ObjectExplorer.css';

export function ObjectExplorer() {
  return (
    <div className="object-explorer">
      <div className="page-header object-explorer-header">
        <div>
          <h1>Object Explorer</h1>
          <p className="page-subtitle">
            Explore and query the knowledge graph. Connect a Neo4j data source and index objects to get started.
          </p>
        </div>
        <Compass size={48} className="object-explorer-icon" strokeWidth={1} />
      </div>
      <div className="object-explorer-placeholder">
        <p>Object Explorer is coming soon. After indexing objects to Neo4j, you will be able to browse and search the graph here.</p>
      </div>
    </div>
  );
}
