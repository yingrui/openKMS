import type { KnowledgeMapNode, ResourceLink } from '../data/knowledgeMapApi';

/** Force-graph node: taxonomy term or synthetic resource vertex. */
export type KMNode = {
  id: string;
  name: string;
  deg: number;
  kind: 'taxonomy' | 'resource';
  resourceType?: string;
  resourceId?: string;
};

export type KMLink = { source: string; target: string; kind: 'tree' | 'ref' };

export function resourceNodeId(r: ResourceLink): string {
  return `res:${r.resource_type}:${r.resource_id}`;
}

export function walkTree(
  roots: KnowledgeMapNode[],
  links: ResourceLink[],
  resolveResourceLabel: (t: string, id: string) => string,
): { nodes: KMNode[]; links: KMLink[] } {
  const nodeById = new Map<string, KMNode>();
  const treeLinks: KMLink[] = [];

  function visit(n: KnowledgeMapNode, parentId: string | null) {
    nodeById.set(n.id, { id: n.id, name: n.name, deg: 0, kind: 'taxonomy' });
    if (parentId) {
      treeLinks.push({ source: parentId, target: n.id, kind: 'tree' });
    }
    for (const c of n.children ?? []) {
      visit(c, n.id);
    }
  }
  for (const root of roots) {
    visit(root, null);
  }

  const refLinks: KMLink[] = [];
  for (const r of links) {
    const rid = resourceNodeId(r);
    if (!nodeById.has(rid)) {
      const label = resolveResourceLabel(r.resource_type, r.resource_id);
      const name =
        r.resource_type === 'document_channel'
          ? `Document channel: ${label}`
          : r.resource_type === 'wiki_space'
            ? `Wiki space: ${label}`
            : `Articles: ${label}`;
      nodeById.set(rid, {
        id: rid,
        name,
        deg: 0,
        kind: 'resource',
        resourceType: r.resource_type,
        resourceId: r.resource_id,
      });
    }
    refLinks.push({ source: r.taxonomy_node_id, target: rid, kind: 'ref' });
  }

  const allLinks = [...treeLinks, ...refLinks];
  const deg = new Map<string, number>();
  for (const l of allLinks) {
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
  }
  const nodes = Array.from(nodeById.values()).map((n) => ({ ...n, deg: deg.get(n.id) ?? 0 }));
  return { nodes, links: allLinks };
}

export function stripKnownResourceTitle(name: string, resourceType?: string): string {
  if (resourceType === 'document_channel' && name.startsWith('Document channel: ')) {
    return name.slice('Document channel: '.length);
  }
  if (resourceType === 'wiki_space' && name.startsWith('Wiki space: ')) {
    return name.slice('Wiki space: '.length);
  }
  if ((resourceType === 'articles' || name.startsWith('Articles:')) && name.startsWith('Articles: ')) {
    return name.slice('Articles: '.length);
  }
  return name;
}

export function resourceBadgeAndTitle(n: KMNode): { badge: string; title: string } {
  if (n.resourceType === 'document_channel') {
    return { badge: 'Channel', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.resourceType === 'wiki_space') {
    return { badge: 'Wiki', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.resourceType === 'articles') {
    return { badge: 'Articles', title: stripKnownResourceTitle(n.name, n.resourceType) };
  }
  if (n.name.startsWith('Articles: ')) {
    return { badge: 'Articles', title: stripKnownResourceTitle(n.name, 'articles') };
  }
  return { badge: '', title: n.name };
}
