import type { WikiPageResponse } from '../../data/wikiSpacesApi';

export interface WikiTreeNode {
  segment: string;
  pathPrefix: string;
  page: WikiPageResponse | undefined;
  children: Map<string, WikiTreeNode>;
}

export function buildWikiTree(pages: WikiPageResponse[]): WikiTreeNode {
  const root: WikiTreeNode = {
    segment: '',
    pathPrefix: '',
    page: undefined,
    children: new Map(),
  };
  for (const p of pages) {
    const parts = p.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      prefix = prefix ? `${prefix}/${seg}` : seg;
      if (!cur.children.has(seg)) {
        cur.children.set(seg, {
          segment: seg,
          pathPrefix: prefix,
          page: undefined,
          children: new Map(),
        });
      }
      cur = cur.children.get(seg)!;
      if (i === parts.length - 1) {
        cur.page = p;
      }
    }
  }
  return root;
}
