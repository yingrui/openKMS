/** Shared list / create / move / merge / delete / reorder calls for document, article and media channel trees. */
import { request } from './apiClient';

interface ChannelTreePage<Raw> {
  items: Raw[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChannelTreeApi<Node> {
  /** Load every root channel tree (paginates until all roots are fetched). */
  fetchAll(): Promise<Node[]>;
  create(params: { name: string; description?: string | null; parent_id?: string | null }): Promise<Node>;
  setParent(channelId: string, parentId: string | null): Promise<Node>;
  remove(channelId: string): Promise<void>;
  merge(params: { source_channel_id: string; target_channel_id: string; include_descendants?: boolean }): Promise<void>;
  reorder(channelId: string, direction: 'up' | 'down'): Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createChannelTreeApi<Raw, Node>(basePath: string, toNode: (raw: Raw) => Node): ChannelTreeApi<Node> {
  return {
    async fetchAll() {
      const merged: Node[] = [];
      const limit = 200;
      let offset = 0;
      let total = 0;
      do {
        const page = await request<ChannelTreePage<Raw>>(basePath, { query: { limit, offset } });
        merged.push(...page.items.map(toNode));
        total = page.total;
        offset += limit;
      } while (offset < total);
      return merged;
    },
    async create(params) {
      const raw = await request<Raw>(basePath, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(params) });
      return toNode(raw);
    },
    async setParent(channelId, parentId) {
      const raw = await request<Raw>(`${basePath}/${channelId}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ parent_id: parentId }),
      });
      return toNode(raw);
    },
    remove(channelId) {
      return request<void>(`${basePath}/${channelId}`, { method: 'DELETE' });
    },
    merge(params) {
      return request<void>(`${basePath}/merge`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...params, include_descendants: params.include_descendants ?? true }),
      });
    },
    reorder(channelId, direction) {
      return request<void>(`${basePath}/${channelId}/reorder`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ direction }),
      });
    },
  };
}
