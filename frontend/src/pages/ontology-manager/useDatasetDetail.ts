import { createContext, useContext } from 'react';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { ObjectTypeResponse, LinkTypeResponse } from '../../data/ontologyApi';

/** Read + shell actions only: the editable fields live in the tab that owns the form. */
export type DatasetDetailContext = {
  dataset: DatasetResponse;
  setDataset: (d: DatasetResponse) => void;
  onDelete: () => Promise<void>;
  columnCount: number | null;
  rowTotal: number | null;
  usageObjectTypes: ObjectTypeResponse[];
  usageLinkTypes: LinkTypeResponse[];
  usageLoading: boolean;
};

export const DatasetDetailCtx = createContext<DatasetDetailContext | null>(null);

export function useDatasetDetail(): DatasetDetailContext {
  const ctx = useContext(DatasetDetailCtx);
  if (!ctx) throw new Error('useDatasetDetail requires DatasetDetailPage');
  return ctx;
}
