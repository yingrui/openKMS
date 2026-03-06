/** Settings for a document channel */
export interface DocumentChannelSettings {
  channelId: string;
  pipelineId: string | null;
  chunkSize: number;
  extractTables: boolean;
}

const STORAGE_KEY = 'openkms-document-channel-settings';

const defaults: Omit<DocumentChannelSettings, 'channelId'> = {
  pipelineId: null,
  chunkSize: 512,
  extractTables: true,
};

function loadAll(): Record<string, DocumentChannelSettings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {};
}

function saveAll(settings: Record<string, DocumentChannelSettings>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function getDocumentChannelSettings(channelId: string): DocumentChannelSettings {
  const all = loadAll();
  const existing = all[channelId];
  if (existing) {
    return { ...defaults, ...existing, channelId };
  }
  return { ...defaults, channelId };
}

export function setDocumentChannelSettings(settings: DocumentChannelSettings) {
  const all = loadAll();
  all[settings.channelId] = settings;
  saveAll(all);
}
