import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Folder, Plus } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { createDocumentChannel, type ChannelNode } from '../data/channelsApi';
import './DocumentChannels.css';

/** Flatten tree for parent dropdown (id, name, depth for indent) */
function flattenForParent(nodes: ChannelNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) out.push(...flattenForParent(n.children, depth + 1));
  }
  return out;
}

export function DocumentChannels() {
  const { channels, loading, error, refetch } = useDocumentChannels();
  const [createName, setCreateName] = useState('');
  const [createParentId, setCreateParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createDocumentChannel({
        name,
        parent_id: createParentId || null,
      });
      setCreateName('');
      setCreateParentId('');
      await refetch();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  const parentOptions = flattenForParent(channels);

  return (
    <div className="document-channels">
      <Link to="/documents" className="document-channels-back">
        <ArrowLeft size={18} />
        <span>Back to Documents</span>
      </Link>

      <div className="page-header">
        <h1>Document Channels</h1>
        <p className="page-subtitle">
          Create and manage document channels. Organize documents into top-level channels and sub-channels.
        </p>
      </div>

      {(error || createError) && (
        <div className="document-channels-error" role="alert">
          {createError || error}
        </div>
      )}

      <div className="document-channels-layout">
        <section className="document-channels-create">
          <h2>
            <Plus size={20} />
            New channel
          </h2>
          <form onSubmit={handleCreate} className="document-channels-form">
            <div className="document-channels-field">
              <label htmlFor="channel-name">Name</label>
              <input
                id="channel-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Sales, Product Brochures"
                required
              />
            </div>
            <div className="document-channels-field">
              <label htmlFor="channel-parent">Parent</label>
              <select
                id="channel-parent"
                value={createParentId}
                onChange={(e) => setCreateParentId(e.target.value)}
              >
                <option value="">None (top-level)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {'—'.repeat(p.depth)} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating || !createName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </section>

        <section className="document-channels-list">
          <h2>
            <Folder size={20} />
            Channels
          </h2>
          {loading ? (
            <p className="document-channels-loading">Loading…</p>
          ) : channels.length === 0 ? (
            <div className="document-channels-empty">
              <Folder size={40} />
              <p>No channels yet</p>
              <p className="document-channels-empty-hint">
                Create your first channel using the form on the left. Use &quot;None&quot; for a top-level channel.
              </p>
            </div>
          ) : (
            <ul className="document-channels-tree">
              {channels.map((ch) => (
                <ChannelItem key={ch.id} node={ch} depth={0} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChannelItem({ node, depth }: { node: ChannelNode; depth: number }) {
  return (
    <li style={{ paddingLeft: depth * 20 }}>
      <span className="document-channels-tree-item">
        <Folder size={16} />
        {node.name}
        <span className="document-channels-tree-id">{node.id}</span>
      </span>
      {node.children?.length ? (
        <ul className="document-channels-tree">
          {node.children.map((ch) => (
            <ChannelItem key={ch.id} node={ch} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
