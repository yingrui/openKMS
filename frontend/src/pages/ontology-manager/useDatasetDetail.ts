import { createContext, useContext } from 'react';
import type { DatasetResponse } from '../../data/datasetsApi';

/** Read + shell actions only: the editable fields live in the tab that owns the form. */
export type DatasetDetailContext = {
  dataset: DatasetResponse;
  setDataset: (d: DatasetResponse) => void;
  onDelete: () => Promise<void>;
  columnCount: number | null;
  rowTotal: number | null;
  /** File datasets: how many versions exist, and how many files the current one carries. */
  versionCount: number | null;
  fileCount: number | null;
};

export const DatasetDetailCtx = createContext<DatasetDetailContext | null>(null);

export function useDatasetDetail(): DatasetDetailContext {
  const ctx = useContext(DatasetDetailCtx);
  if (!ctx) throw new Error('useDatasetDetail requires DatasetDetailPage');
  return ctx;
}
