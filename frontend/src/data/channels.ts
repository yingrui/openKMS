/** Re-exports and legacy stubs. Document channels come from API via DocumentChannelsContext. */

export type { ChannelNode } from './channelUtils';
export {
  getDocumentLeafChannelIds,
  getDocumentChannelName,
  getFirstLeafChannelId,
} from './channelUtils';

/** Article channels: placeholder (no backend yet). */
export const articleChannels: { id: string; name: string; children?: unknown[] }[] = [];

export const defaultArticleChannel = '';

export function getArticleLeafChannelIds(channelId: string): string[] {
  return channelId ? [channelId] : [];
}
