/** API for semantic-model export / import (Ossie document). */
import { request, requestText } from './apiClient';

export interface SemanticModelImportSummary {
  relationships: number;
  metrics: number;
  queries: number;
  warnings: string[];
}

export async function exportSemanticModel(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/semantic-model');
}

export async function exportSemanticModelYaml(): Promise<string> {
  return requestText('/api/semantic-model?format=yaml');
}

export async function importSemanticModel(doc: unknown): Promise<SemanticModelImportSummary> {
  return request<SemanticModelImportSummary>('/api/semantic-model/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
}
