import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { DataSourceResponse } from '../../data/dataSourcesApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';
import type {
  OntologyActionTypeResponse,
  OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import type { FormProperty } from './objectTypeFormModel';

export type ObjectTypeDetailContext = {
  objectType: ObjectTypeResponse;
  relatedLinks: LinkTypeResponse[];
  relatedActions: OntologyActionTypeResponse[];
  relatedFunctions: OntologyFunctionResponse[];
  datasets: DatasetResponse[];
  neo4jDataSources: DataSourceResponse[];
  name: string;
  setName: (v: string) => void;
  /** Frozen identifier; empty when the row predates the column and has not claimed one. */
  apiName: string;
  setApiName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isMasterData: boolean;
  setIsMasterData: (v: boolean) => void;
  displayProperty: string;
  setDisplayProperty: (v: string) => void;
  datasetId: string;
  setDatasetId: (v: string) => void;
  properties: FormProperty[];
  setProperties: Dispatch<SetStateAction<FormProperty[]>>;
  keyProperties: string[];
  setKeyProperties: Dispatch<SetStateAction<string[]>>;
  loadingMetadata: boolean;
  saving: boolean;
  indexing: boolean;
  onSave: () => Promise<void>;
  onIndex: (neo4jId: string) => Promise<void>;
  reload: () => Promise<void>;
};

export const ObjectTypeDetailCtx = createContext<ObjectTypeDetailContext | null>(null);

export function useObjectTypeDetail(): ObjectTypeDetailContext {
  const ctx = useContext(ObjectTypeDetailCtx);
  if (!ctx) throw new Error('useObjectTypeDetail requires ObjectTypeDetailPage');
  return ctx;
}
