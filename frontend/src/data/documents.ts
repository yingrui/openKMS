/** Document metadata for listing and detail views */
export interface DocumentItem {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded: string;
  markdown: boolean;
  channelId?: string;
}

/** Documents by channel - empty until backend integration. Keys are channel IDs. */
const mockDocumentsByChannel: Record<string, DocumentItem[]> = {};

const documentById = new Map<string, DocumentItem>();
for (const docs of Object.values(mockDocumentsByChannel)) {
  for (const doc of docs) {
    documentById.set(doc.id, doc);
  }
}

export function getDocumentById(id: string): DocumentItem | undefined {
  return documentById.get(id);
}

export { mockDocumentsByChannel };
