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

const mockDocumentsByChannel: Record<string, DocumentItem[]> = {
  dc1a: [
    { id: '1', name: 'Life-Shield-Brochure.pdf', type: 'PDF', size: '5.2 MB', uploaded: '2 days ago', markdown: true, channelId: 'dc1a' },
    { id: '2', name: 'Paper_Demo.pdf', type: 'PDF', size: '337 KB', uploaded: '1 week ago', markdown: true, channelId: 'dc1a' },
  ],
  dc1b: [
    { id: '3', name: 'Commission_Structure_2024.pdf', type: 'PDF', size: '456 KB', uploaded: '3 days ago', markdown: true, channelId: 'dc1b' },
  ],
  dc2a: [
    { id: '4', name: 'Risk_Selection_Guidelines.pdf', type: 'PDF', size: '892 KB', uploaded: '2 weeks ago', markdown: true, channelId: 'dc2a' },
  ],
  dc2b: [
    { id: '5', name: 'Policy_Terms_Standard.pdf', type: 'PDF', size: '1.5 MB', uploaded: '1 week ago', markdown: true, channelId: 'dc2b' },
  ],
  dc3a: [
    { id: '6', name: 'Claims_Process_Flow.pdf', type: 'PDF', size: '324 KB', uploaded: '5 days ago', markdown: true, channelId: 'dc3a' },
  ],
  dc3b: [
    { id: '7', name: 'Renewal_Checklist.pdf', type: 'PDF', size: '128 KB', uploaded: '3 days ago', markdown: true, channelId: 'dc3b' },
  ],
  dc3c: [],
  root: [],
  dc1: [],
  dc2: [],
  dc3: [],
};

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
