// Channel structures for an insurance company: Sales, Underwriting, Operation

export interface ChannelNode {
  id: string;
  name: string;
  children?: ChannelNode[];
}

export const documentChannels: ChannelNode[] = [
  {
    id: 'root',
    name: 'All Documents',
    children: [
      {
        id: 'dc1',
        name: 'Sales',
        children: [
          { id: 'dc1a', name: 'Product Brochures' },
          { id: 'dc1b', name: 'Commission & Incentives' },
        ],
      },
      {
        id: 'dc2',
        name: 'Underwriting',
        children: [
          { id: 'dc2a', name: 'Risk Guidelines' },
          { id: 'dc2b', name: 'Policy Terms' },
        ],
      },
      {
        id: 'dc3',
        name: 'Operation',
        children: [
          { id: 'dc3a', name: 'Claims' },
          { id: 'dc3b', name: 'Renewals' },
          { id: 'dc3c', name: 'Customer Service' },
        ],
      },
    ],
  },
];

export const articleChannels: ChannelNode[] = [
  {
    id: 'root',
    name: 'All Articles',
    children: [
      {
        id: 'ac1',
        name: 'Sales',
        children: [
          { id: 'ac1a', name: 'Product Knowledge' },
          { id: 'ac1b', name: 'Objection Handling' },
        ],
      },
      {
        id: 'ac2',
        name: 'Underwriting',
        children: [
          { id: 'ac2a', name: 'Risk Assessment' },
          { id: 'ac2b', name: 'Approval Workflow' },
        ],
      },
      {
        id: 'ac3',
        name: 'Operation',
        children: [
          { id: 'ac3a', name: 'Claims Process' },
          { id: 'ac3b', name: 'Renewal Handling' },
        ],
      },
    ],
  },
];

export const defaultDocumentChannel = 'dc1a';
export const defaultArticleChannel = 'ac1a';

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

export function getDocumentLeafChannelIds(channelId: string): string[] {
  const found: string[] = [];
  collectLeafIds(documentChannels, channelId, found);
  return found.length > 0 ? found : [channelId];
}

export function getArticleLeafChannelIds(channelId: string): string[] {
  const found: string[] = [];
  collectLeafIds(articleChannels, channelId, found);
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

export function getDocumentChannelName(channelId: string): string {
  return findChannelName(documentChannels, channelId) ?? channelId;
}
