import { createContext, useContext } from 'react';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { ObjectTypeResponse, LinkTypeResponse } from '../../data/ontologyApi';

export type DatasetDetailContext = {
  dataset: DatasetResponse;
  setDataset: (d: DatasetResponse) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
  businessDefinition: string;
  setBusinessDefinition: (v: string) => void;
  sensitivity: string;
  setSensitivity: (v: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
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
