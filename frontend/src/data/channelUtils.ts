/** Utilities for channel trees. No mock data - channels come from API. */

export interface ExtractionSchemaField {
  key: string;
  label: string;
  type: string;
  description?: string;
}

export interface ChannelNode {
  id: string;
  name: string;
  description?: string | null;
  pipeline_id?: string | null;
  auto_process?: boolean;
  extraction_model_id?: string | null;
  extraction_schema?: ExtractionSchemaField[] | null;
  children?: ChannelNode[];
}

/** Find a channel by ID in the tree. */
export function findChannel(nodes: ChannelNode[], targetId: string): ChannelNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children) {
      const found = findChannel(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

/** Collect all leaf channel IDs under a channel (or the channel itself if it's a leaf) */
function collectLeafIds(nodes: ChannelNode[], targetId: string, found: string[]): boolean {
  for (const node of nodes) {
    if (node.id === targetId) {
      if (!node.children || node.children.length === 0) {
        found.push(node.id);
      } else {
        collectLeafIdsRec(node.children, found);
      }
      return true;
    }
    if (node.children && collectLeafIds(node.children, targetId, found)) {
      return true;
    }
  }
  return false;
}

function collectLeafIdsRec(nodes: ChannelNode[], found: string[]): void {
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) {
      found.push(node.id);
    } else {
      collectLeafIdsRec(node.children, found);
    }
  }
}

export function getDocumentLeafChannelIds(channels: ChannelNode[], channelId: string): string[] {
  const found: string[] = [];
  collectLeafIds(channels, channelId, found);
  return found.length > 0 ? found : [channelId];
}

function findChannelName(nodes: ChannelNode[], targetId: string): string | null {
  for (const node of nodes) {
    if (node.id === targetId) return node.name;
    if (node.children) {
      const found = findChannelName(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function getDocumentChannelName(channels: ChannelNode[], channelId: string): string {
  return findChannelName(channels, channelId) ?? channelId;
}

function findChannelDescription(nodes: ChannelNode[], targetId: string): string | null {
  for (const node of nodes) {
    if (node.id === targetId) return (node.description ?? '').trim() || null;
    if (node.children) {
      const found = findChannelDescription(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function getDocumentChannelDescription(channels: ChannelNode[], channelId: string): string | null {
  return findChannelDescription(channels, channelId);
}

/** Get first leaf channel ID from tree (for default selection). Returns null if empty. */
export function getFirstLeafChannelId(channels: ChannelNode[]): string | null {
  for (const node of channels) {
    if (!node.children || node.children.length === 0) return node.id;
    const found = getFirstLeafChannelId(node.children);
    if (found) return found;
  }
  return null;
}

/** Flatten channel tree to list of { id, name, depth } for display. */
export function flattenChannels(
  nodes: ChannelNode[],
  depth = 0
): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children?.length) {
      out.push(...flattenChannels(n.children, depth + 1));
    }
  }
  return out;
}
