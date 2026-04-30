/** Re-exports and channel tree helpers. Document channels: DocumentChannelsContext + channelsApi. */

export type { ChannelNode } from './channelUtils';
export {
  getDocumentLeafChannelIds,
  getDocumentChannelName,
  getFirstLeafChannelId,
} from './channelUtils';

import type { ChannelNode } from './channelUtils';
import { getDocumentLeafChannelIds } from './channelUtils';

/** Leaf article channel IDs under the selected channel (same tree rules as documents). */
export function getArticleLeafChannelIds(channels: ChannelNode[], channelId: string): string[] {
  if (!channelId) return [];
  return getDocumentLeafChannelIds(channels, channelId);
}
