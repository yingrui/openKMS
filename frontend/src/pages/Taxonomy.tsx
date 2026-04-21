import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Link2,
  Loader2,
  FolderTree,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  ArrowRightLeft,
  Pencil,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import type { ChannelNode } from '../data/channelUtils';
import {
  createTaxonomyNode,
  deleteResourceLink,
  deleteTaxonomyNode,
  fetchResourceLinks,
  fetchTaxonomyTree,
  updateTaxonomyNode,
  upsertResourceLink,
  type ResourceLink,
  type TaxonomyNode,
} from '../data/taxonomyApi';
import { fetchWikiSpaces } from '../data/wikiSpacesApi';
import './Taxonomy.css';

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  document_channel: 'Document channel',
  article_channel: 'Article channel',
  wiki_space: 'Wiki space',
};

function flattenTaxonomyOptions(nodes: TaxonomyNode[], prefix = ''): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${prefix}${n.name}` });
    if (n.children?.length) {
      out.push(...flattenTaxonomyOptions(n.children, `${prefix}${n.name} / `));
    }
  }
  return out;
}

function flattenTaxonomyForParent(nodes: TaxonomyNode[], depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) out.push(...flattenTaxonomyForParent(n.children, depth + 1));
  }
  return out;
}

function flattenDocChannels(nodes: ChannelNode[], prefix = ''): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${prefix}${n.name}` });
    if (n.children?.length) {
      out.push(...flattenDocChannels(n.children, `${prefix}${n.name} / `));
    }
  }
  return out;
}

function findTaxonomyNode(nodes: TaxonomyNode[], id: string): TaxonomyNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findTaxonomyNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function collectTaxonomyIds(nodes: TaxonomyNode[]): Set<string> {
  const out = new Set<string>();
  function walk(n: TaxonomyNode) {
    out.add(n.id);
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of nodes) walk(n);
  return out;
}

function getTaxonomyDescendantIds(nodes: TaxonomyNode[], nodeId: string): Set<string> {
  const out = new Set<string>();
  function addWithChildren(n: TaxonomyNode) {
    out.add(n.id);
    for (const c of n.children ?? []) addWithChildren(c);
  }
  const found = findTaxonomyNode(nodes, nodeId);
  if (found) addWithChildren(found);
  return out;
}

function findSiblingContext(
  nodes: TaxonomyNode[],
  targetId: string,
): { siblings: TaxonomyNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) return { siblings: nodes, index: i };
    const ch = nodes[i].children;
    if (ch?.length) {
      const found = findSiblingContext(ch, targetId);
      if (found) return found;
    }
  }
  return null;
}

function TaxonomyTermItem({
  node,
  depth,
  siblingIndex,
  siblingsCount,
  tree,
  canWrite,
  selectedNodeId,
  onSelectNode,
  onReload,
  getMoveParentOptions,
}: {
  node: TaxonomyNode;
  depth: number;
  siblingIndex: number;
  siblingsCount: number;
  tree: TaxonomyNode[];
  canWrite: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onReload: () => Promise<void>;
  getMoveParentOptions: (excludeId: string) => { id: string; name: string; depth: number }[];
}) {
  const [moving, setMoving] = useState(false);
  const [moveParentId, setMoveParentId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editDescription, setEditDescription] = useState(node.description ?? '');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isSelected = selectedNodeId === node.id;
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblingsCount - 1;

  const handleReorder = async (direction: 'up' | 'down') => {
    const ctx = findSiblingContext(tree, node.id);
    if (!ctx) return;
    const { siblings, index } = ctx;
    const j = direction === 'up' ? index - 1 : index + 1;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[index];
    const b = siblings[j];
    try {
      await updateTaxonomyNode(a.id, { sort_order: b.sort_order });
      await updateTaxonomyNode(b.id, { sort_order: a.sort_order });
      await onReload();
      toast.success(`Moved "${node.name}" ${direction}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder term');
    }
  };

  const moveOptions = getMoveParentOptions(node.id);

  const handleMoveConfirm = async () => {
    const newParent = moveParentId || null;
    if (newParent === node.id) return;
    setMoveLoading(true);
    try {
      await updateTaxonomyNode(node.id, { parent_id: newParent });
      await onReload();
      toast.success(`Moved "${node.name}"`);
      setMoving(false);
      setMoveParentId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move term');
    } finally {
      setMoveLoading(false);
    }
  };

  const handleMoveCancel = () => {
    setMoving(false);
    setMoveParentId('');
  };

  const handleEditOpen = () => {
    setEditName(node.name);
    setEditDescription(node.description ?? '');
    setEditing(true);
  };

  const handleEditSave = async () => {
    const name = editName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    setEditLoading(true);
    try {
      await updateTaxonomyNode(node.id, {
        name,
        description: editDescription.trim() || null,
      });
      await onReload();
      toast.success('Term updated');
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update term');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditCancel = () => {
    setEditing(false);
  };

  const handleDeleteClick = () => setDeleteConfirming(true);
  const handleDeleteCancel = () => setDeleteConfirming(false);
  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await deleteTaxonomyNode(node.id);
      await onReload();
      toast.success(`Deleted "${node.name}"`);
      setDeleteConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <li style={{ paddingLeft: depth * 20 }} className="taxonomy-tree-li">
      <div className={`taxonomy-tree-row${isSelected ? ' taxonomy-tree-row--selected' : ''}`}>
        <button
          type="button"
          className="taxonomy-tree-select"
          onClick={() => onSelectNode(node.id)}
          aria-current={isSelected ? 'true' : undefined}
          title={`${node.name} — id ${node.id}`}
        >
          <FolderTree size={16} className="taxonomy-tree-select-icon" aria-hidden />
          <span className="taxonomy-tree-name-wrap">
            <span className="taxonomy-tree-name">{node.name}</span>
            {node.description ? (
              <span className="taxonomy-tree-desc" title={node.description}>
                {node.description}
              </span>
            ) : null}
          </span>
          {node.link_count > 0 && (
            <span className="taxonomy-tree-badge" title="Resources this term refers to">
              {node.link_count}
            </span>
          )}
        </button>
        {canWrite && (
          <span className="taxonomy-tree-actions">
            <button
              type="button"
              className="taxonomy-tree-action"
              title="Move up"
              aria-label="Move term up"
              onClick={() => void handleReorder('up')}
              disabled={!canMoveUp}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="taxonomy-tree-action"
              title="Move down"
              aria-label="Move term down"
              onClick={() => void handleReorder('down')}
              disabled={!canMoveDown}
            >
              <ChevronDown size={14} />
            </button>
            <button type="button" className="taxonomy-tree-action" title="Edit" onClick={handleEditOpen}>
              <Pencil size={14} />
            </button>
            <button type="button" className="taxonomy-tree-action" title="Move under…" onClick={() => setMoving(true)}>
              <ArrowRightLeft size={14} />
            </button>
            <button
              type="button"
              className="taxonomy-tree-action taxonomy-tree-action-delete"
              title="Delete"
              onClick={handleDeleteClick}
            >
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>
      {deleteConfirming && (
        <div className="taxonomy-confirm-bar">
          <span>
            Delete &quot;{node.name}&quot; and nested terms? Refer-to mappings are removed. This cannot be undone.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleDeleteConfirm()}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDeleteCancel}>
            Cancel
          </button>
        </div>
      )}
      {editing && (
        <div className="taxonomy-edit-bar">
          <div className="taxonomy-edit-fields">
            <label className="taxonomy-edit-label">
              <span>Name</span>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="taxonomy-edit-input" />
            </label>
            <label className="taxonomy-edit-label">
              <span>Description</span>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="taxonomy-edit-textarea"
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="taxonomy-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleEditSave()} disabled={editLoading}>
              {editLoading ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleEditCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {moving && (
        <div className="taxonomy-move-bar">
          <select
            value={moveParentId}
            onChange={(e) => setMoveParentId(e.target.value)}
            className="taxonomy-move-select"
            aria-label="Parent term"
          >
            {moveOptions.map((p) => (
              <option key={p.id || 'root'} value={p.id}>
                {'—'.repeat(p.depth)} {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleMoveConfirm()}
            disabled={moveLoading}
          >
            {moveLoading ? 'Moving…' : 'Move'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleMoveCancel}>
            Cancel
          </button>
        </div>
      )}
      {node.children?.length ? (
        <ul className="taxonomy-tree-list">
          {node.children.map((ch, index) => (
            <TaxonomyTermItem
              key={ch.id}
              node={ch}
              depth={depth + 1}
              siblingIndex={index}
              siblingsCount={node.children.length}
              tree={tree}
              canWrite={canWrite}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onReload={onReload}
              getMoveParentOptions={getMoveParentOptions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function Taxonomy() {
  const { hasPermission } = useAuth();
  const { channels } = useDocumentChannels();
  const [searchParams] = useSearchParams();
  const nodeFromUrl = searchParams.get('node');
  const canRead = hasPermission('taxonomy:read') || hasPermission('all');
  const canWrite = hasPermission('taxonomy:write') || hasPermission('all');

  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createParentId, setCreateParentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showNewTermModal, setShowNewTermModal] = useState(false);

  const [linkType, setLinkType] = useState('document_channel');
  const [linkResourceId, setLinkResourceId] = useState('');

  const [wikiOptions, setWikiOptions] = useState<{ id: string; label: string }[]>([]);
  const lastAppliedNodeParam = useRef<string | undefined>(undefined);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!canRead) {
        setLoading(false);
        return;
      }
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const [t, l] = await Promise.all([fetchTaxonomyTree(), fetchResourceLinks()]);
        setTree(t);
        setLinks(l);
        setLoadError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load Knowledge Map';
        toast.error(msg);
        setLoadError(msg);
        setTree([]);
        setLinks([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [canRead],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const w = await fetchWikiSpaces();
        if (cancelled) return;
        setWikiOptions(w.items.map((s) => ({ id: s.id, label: s.name })));
      } catch {
        if (!cancelled) setWikiOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nodeOptions = useMemo(() => flattenTaxonomyOptions(tree), [tree]);
  const parentOptions = useMemo(() => flattenTaxonomyForParent(tree), [tree]);
  const docChannelOptions = useMemo(() => flattenDocChannels(channels), [channels]);

  const termLabelById = useMemo(() => new Map(nodeOptions.map((o) => [o.id, o.label])), [nodeOptions]);
  const channelLabelById = useMemo(() => new Map(docChannelOptions.map((o) => [o.id, o.label])), [docChannelOptions]);
  const wikiLabelById = useMemo(() => new Map(wikiOptions.map((o) => [o.id, o.label])), [wikiOptions]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? findTaxonomyNode(tree, selectedNodeId) : null),
    [tree, selectedNodeId],
  );

  const linksForSelected = useMemo(
    () => (selectedNodeId ? links.filter((r) => r.taxonomy_node_id === selectedNodeId) : []),
    [links, selectedNodeId],
  );

  useEffect(() => {
    if (!selectedNodeId) return;
    const ids = collectTaxonomyIds(tree);
    if (!ids.has(selectedNodeId)) setSelectedNodeId(null);
  }, [tree, selectedNodeId]);

  useEffect(() => {
    if (!tree.length) return;
    if (!nodeFromUrl) {
      lastAppliedNodeParam.current = undefined;
      return;
    }
    if (lastAppliedNodeParam.current === nodeFromUrl) return;
    const ids = collectTaxonomyIds(tree);
    if (ids.has(nodeFromUrl)) {
      setSelectedNodeId(nodeFromUrl);
      lastAppliedNodeParam.current = nodeFromUrl;
    }
  }, [tree, nodeFromUrl]);

  const getMoveParentOptions = useCallback(
    (excludeTermId: string) => {
      const exclude = getTaxonomyDescendantIds(tree, excludeTermId);
      return [{ id: '', name: 'None (top-level)', depth: 0 }, ...parentOptions.filter((p) => !exclude.has(p.id))];
    },
    [tree, parentOptions],
  );

  const resolveResourceLabel = useCallback(
    (resourceType: string, resourceId: string) => {
      if (resourceType === 'document_channel') return channelLabelById.get(resourceId) ?? resourceId;
      if (resourceType === 'wiki_space') return wikiLabelById.get(resourceId) ?? resourceId;
      return resourceId;
    },
    [channelLabelById, wikiLabelById],
  );

  const openNewTermModal = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateParentId('');
    setCreateError(null);
    setShowNewTermModal(true);
  };

  const closeNewTermModal = () => {
    if (creating) return;
    setShowNewTermModal(false);
    setCreateError(null);
  };

  const handleCreateTerm = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createTaxonomyNode({
        name,
        description: createDescription.trim() || null,
        parent_id: createParentId || null,
      });
      setCreateName('');
      setCreateDescription('');
      setCreateParentId('');
      toast.success('Term created');
      setShowNewTermModal(false);
      // Reload tree before selecting: avoids a frame where selection points at a term not yet in `tree`,
      // which triggered the sync effect and broke updates (especially first term from empty tree).
      await load({ silent: true });
      setSelectedNodeId(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create term');
    } finally {
      setCreating(false);
    }
  };

  const onAddLink = async () => {
    if (!selectedNodeId) {
      toast.error('Select a term in the tree first.');
      return;
    }
    if (!linkResourceId.trim()) {
      toast.error('Choose a resource to refer to.');
      return;
    }
    try {
      await upsertResourceLink({
        taxonomy_node_id: selectedNodeId,
        resource_type: linkType,
        resource_id: linkResourceId.trim(),
      });
      toast.success('Refer-to saved');
      setLinkResourceId('');
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save refer-to');
    }
  };

  const onDeleteLink = async (resourceType: string, resourceId: string) => {
    if (!window.confirm('Remove this refer-to?')) return;
    try {
      await deleteResourceLink(resourceType, resourceId);
      toast.success('Refer-to removed');
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  if (!canRead) {
    return (
      <div className="taxonomy-page">
        <div className="page-header">
          <h1>Knowledge Map</h1>
          <p className="page-subtitle">You need the taxonomy:read permission to view the Knowledge Map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="taxonomy-page">
      <Link to="/" className="taxonomy-back-row">
        <ArrowLeft size={18} />
        <span>Back to Home</span>
      </Link>

      <div className="page-header taxonomy-header">
        <h1>Knowledge Map</h1>
        <p className="page-subtitle">
          Like a <strong>sitemap</strong> for your knowledge base: a tree of terms that shows how topics nest. Terms
          can <strong>refer to</strong> document channels, article channels, or wiki spaces so people can jump from a
          term to real content.
        </p>
      </div>

      {loadError && (
        <div className="taxonomy-error-banner" role="alert">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="taxonomy-loading">
          <Loader2 className="taxonomy-spinner" size={28} aria-hidden />
          <span>Loading…</span>
        </div>
      ) : (
        <>
          <div className="taxonomy-master-detail">
            <section className="taxonomy-tree-panel" aria-label="Knowledge Map tree">
              <div className="taxonomy-tree-panel-header">
                <h2>
                  <FolderTree size={20} />
                  Tree
                </h2>
                {canWrite && (
                  <button type="button" className="btn btn-primary taxonomy-new-term-btn" onClick={openNewTermModal}>
                    <Plus size={18} />
                    <span>New term</span>
                  </button>
                )}
              </div>
              {!tree.length ? (
                <div className="taxonomy-empty">
                  <FolderTree size={40} />
                  <p>No terms yet</p>
                  <p className="taxonomy-empty-hint">
                    {canWrite
                      ? 'Use New term to add a root or narrower term. Choose “None (top-level)” for a root entry.'
                      : 'An editor with taxonomy:write can add terms to the map here.'}
                  </p>
                </div>
              ) : (
                <ul className="taxonomy-tree-list">
                  {tree.map((n, index) => (
                    <TaxonomyTermItem
                      key={n.id}
                      node={n}
                      depth={0}
                      siblingIndex={index}
                      siblingsCount={tree.length}
                      tree={tree}
                      canWrite={canWrite}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={setSelectedNodeId}
                      onReload={() => load({ silent: true })}
                      getMoveParentOptions={getMoveParentOptions}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="taxonomy-detail-card" aria-label="Node details">
              {!tree.length ? (
                <p className="taxonomy-muted taxonomy-detail-placeholder">
                  Add terms to the map to select one and manage refer-tos.
                </p>
              ) : !selectedNodeId || !selectedNode ? (
                <div className="taxonomy-detail-placeholder">
                  <p className="taxonomy-detail-placeholder-title">Node details</p>
                  <p className="taxonomy-muted">
                    Select a term in the map to see its path, notes, and which channels or wiki spaces refer to it.
                  </p>
                </div>
              ) : (
                <>
                  <header className="taxonomy-detail-header">
                    <p className="taxonomy-detail-path">{termLabelById.get(selectedNode.id) ?? selectedNode.name}</p>
                    <h2 className="taxonomy-detail-title">{selectedNode.name}</h2>
                    {selectedNode.description ? (
                      <p className="taxonomy-detail-description">{selectedNode.description}</p>
                    ) : (
                      <p className="taxonomy-detail-description taxonomy-muted">No description.</p>
                    )}
                    <p className="taxonomy-detail-id">
                      <span className="taxonomy-muted">Id</span> <code>{selectedNode.id}</code>
                    </p>
                  </header>

                  <div className="taxonomy-detail-refer">
                    <h3 className="taxonomy-detail-subheading">
                      <Link2 size={16} className="taxonomy-inline-icon" aria-hidden />
                      Refer to
                    </h3>
                    <p className="taxonomy-muted taxonomy-detail-refer-intro">
                      Each channel or wiki space can map to at most one term (one refer-to per resource). Article
                      channel IDs match the sidebar (mock data until a backend exists).
                    </p>
                    {canWrite && (
                      <div className="taxonomy-link-form">
                        <select
                          aria-label="Resource type"
                          className="taxonomy-select"
                          value={linkType}
                          onChange={(e) => {
                            setLinkType(e.target.value);
                            setLinkResourceId('');
                          }}
                        >
                          <option value="document_channel">Document channel</option>
                          <option value="article_channel">Article channel</option>
                          <option value="wiki_space">Wiki space</option>
                        </select>
                        {linkType === 'document_channel' && (
                          <select
                            aria-label="Document channel"
                            className="taxonomy-select"
                            value={linkResourceId}
                            onChange={(e) => setLinkResourceId(e.target.value)}
                          >
                            <option value="">Select channel…</option>
                            {docChannelOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {linkType === 'wiki_space' && (
                          <select
                            aria-label="Wiki space"
                            className="taxonomy-select"
                            value={linkResourceId}
                            onChange={(e) => setLinkResourceId(e.target.value)}
                          >
                            <option value="">Select wiki…</option>
                            {wikiOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {linkType === 'article_channel' && (
                          <input
                            type="text"
                            className="taxonomy-input"
                            placeholder="Article channel id (e.g. ac1a)"
                            value={linkResourceId}
                            onChange={(e) => setLinkResourceId(e.target.value)}
                          />
                        )}
                        <button type="button" className="btn btn-secondary" onClick={() => void onAddLink()}>
                          Save refer-to
                        </button>
                      </div>
                    )}
                    {!linksForSelected.length ? (
                      <p className="taxonomy-muted">This term has no refer-tos yet.</p>
                    ) : (
                      <div className="taxonomy-table-wrap">
                        <table className="taxonomy-table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Resource</th>
                              {canWrite && <th aria-label="Actions" />}
                            </tr>
                          </thead>
                          <tbody>
                            {linksForSelected.map((r) => (
                              <tr key={r.id}>
                                <td>{RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}</td>
                                <td>
                                  <span className="taxonomy-resource-label">
                                    {resolveResourceLabel(r.resource_type, r.resource_id)}
                                  </span>
                                  <code className="taxonomy-resource-id">{r.resource_id}</code>
                                </td>
                                {canWrite && (
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      aria-label="Remove refer-to"
                                      onClick={() => void onDeleteLink(r.resource_type, r.resource_id)}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          {showNewTermModal && (
            <div className="taxonomy-dialog-overlay" role="presentation" onClick={closeNewTermModal}>
              <div
                className="taxonomy-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="taxonomy-new-term-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="taxonomy-dialog-header">
                  <h2 id="taxonomy-new-term-title">New term</h2>
                  <button
                    type="button"
                    className="taxonomy-dialog-close"
                    aria-label="Close"
                    onClick={closeNewTermModal}
                    disabled={creating}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="taxonomy-dialog-body">
                  {createError && (
                    <div className="taxonomy-dialog-error" role="alert">
                      {createError}
                    </div>
                  )}
                  <label>
                    <span>Name (preferred label)</span>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Product family"
                      autoFocus
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="Scope note or definition (optional)"
                      rows={2}
                    />
                  </label>
                  <label>
                    <span>Broader term (parent)</span>
                    <select value={createParentId} onChange={(e) => setCreateParentId(e.target.value)}>
                      <option value="">None (top-level)</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {'—'.repeat(p.depth)} {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="taxonomy-dialog-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeNewTermModal} disabled={creating}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={creating || !createName.trim()}
                    onClick={() => void handleCreateTerm()}
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
