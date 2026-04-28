/** Re-exports and legacy stubs. Document channels come from API via DocumentChannelsContext. */

export type { ChannelNode } from './channelUtils';
export {
  getDocumentLeafChannelIds,
  getDocumentChannelName,
  getFirstLeafChannelId,
} from './channelUtils';

import type { ChannelNode } from './channelUtils';

/** Article channels: HSBC demo mock hierarchy (no backend yet). */
export const articleChannels: ChannelNode[] = [
  {
    id: 'ac1', name: '销售',
    children: [
      { id: 'ac1a', name: '产品对比' },
      { id: 'ac1b', name: '客户沟通' },
    ],
  },
  {
    id: 'ac2', name: '核保',
    children: [
      { id: 'ac2a', name: '健康告知' },
      { id: 'ac2b', name: '投保规则' },
    ],
  },
  {
    id: 'ac3', name: '理赔',
    children: [
      { id: 'ac3a', name: '理赔流程' },
      { id: 'ac3b', name: '拒赔分析' },
    ],
  },
  {
    id: 'ac4', name: '培训',
    children: [
      { id: 'ac4a', name: '新人入职' },
      { id: 'ac4b', name: '进阶研修' },
    ],
  },
];

export const defaultArticleChannel = 'ac1a';

const LEAF_BY_PARENT: Record<string, string[]> = {
  ac1: ['ac1a', 'ac1b'],
  ac2: ['ac2a', 'ac2b'],
  ac3: ['ac3a', 'ac3b'],
  ac4: ['ac4a', 'ac4b'],
  root: ['ac1a', 'ac1b', 'ac2a', 'ac2b', 'ac3a', 'ac3b', 'ac4a', 'ac4b'],
};

export function getArticleLeafChannelIds(channelId: string): string[] {
  if (!channelId) return [];
  if (LEAF_BY_PARENT[channelId]) return LEAF_BY_PARENT[channelId];
  return [channelId];
}
