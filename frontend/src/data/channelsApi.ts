/** API for document channels (backend). */
import { config } from '../config';

export interface ChannelNode {
  id: string;
  name: string;
  description?: string | null;
  children: ChannelNode[];
}

export async function fetchDocumentChannels(): Promise<ChannelNode[]> {
  try {
    const res = await fetch(`${config.apiUrl}/api/channels/documents`);
    if (!res.ok) throw new Error(`Failed to fetch channels (${res.status})`);
    return res.json();
  } catch (e) {
    if (e instanceof TypeError && (e as Error).message === 'Failed to fetch') {
      throw new Error(`Cannot connect to backend at ${config.apiUrl}. Is it running?`);
    }
    throw e;
  }
}

function handleNetworkError(e: unknown): never {
  if (e instanceof TypeError && e.message === 'Failed to fetch') {
    throw new Error(`Cannot connect to backend at ${config.apiUrl}. Is it running?`);
  }
  throw e;
}

export async function createDocumentChannel(params: {
  name: string;
  parent_id?: string | null;
}): Promise<ChannelNode> {
  try {
    const res = await fetch(`${config.apiUrl}/api/channels/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create channel');
    }
    return res.json();
  } catch (e) {
    handleNetworkError(e);
  }
}
