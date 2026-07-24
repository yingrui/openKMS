import { config } from '../config';
import { ontologyFetch, type OntologyExecutionResult } from './ontologyFetch';

export type { OntologyExecutionResult } from './ontologyFetch';
export * from './ontologyGroupsApi';
export * from './ontologyActionsApi';
export { DEFAULT_FUNCTION_TEMPLATE, DEFAULT_PREVIEW_INPUT } from './ontologyFunctionDefaults';

export interface OntologyFunctionResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  source: string;
  object_type_id?: string | null;
  development_status: string;
  status: string;
  published_version_id?: string | null;
  published_version?: number | null;
  latest_version?: number | null;
  created_at: string;
  updated_at: string;
}

export interface OntologyFunctionListResponse {
  items: OntologyFunctionResponse[];
  total: number;
}

export interface OntologyFunctionVersionResponse {
  id: string;
  function_id: string;
  version: number;
  source_code: string;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  entrypoint: string;
  runtime: string;
  validation_result?: Record<string, unknown> | null;
  created_at: string;
}

export interface OntologyFunctionExecutionResponse {
  id: string;
  function_id: string;
  version_id: string;
  duration_ms?: number | null;
  status: string;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
}

const base = `${config.apiUrl}/api/ontology/functions`;

export async function fetchOntologyFunctions(): Promise<OntologyFunctionListResponse> {
  return ontologyFetch<OntologyFunctionListResponse>(base, undefined, 'Failed to fetch functions');
}

export async function fetchOntologyFunction(id: string): Promise<OntologyFunctionResponse> {
  return ontologyFetch<OntologyFunctionResponse>(`${base}/${id}`, undefined, 'Failed to fetch function');
}

export async function createOntologyFunction(body: {
  api_name: string;
  display_name: string;
  description?: string;
  source_code?: string;
}): Promise<OntologyFunctionResponse> {
  return ontologyFetch<OntologyFunctionResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create function',
  );
}

export async function deleteOntologyFunction(id: string): Promise<void> {
  await ontologyFetch<void>(`${base}/${id}`, { method: 'DELETE' }, 'Failed to delete function');
}

export async function fetchFunctionVersions(functionId: string): Promise<OntologyFunctionVersionResponse[]> {
  return ontologyFetch<OntologyFunctionVersionResponse[]>(
    `${base}/${functionId}/versions`,
    undefined,
    'Failed to fetch versions',
  );
}

export async function fetchFunctionVersion(
  functionId: string,
  versionId: string,
): Promise<OntologyFunctionVersionResponse> {
  return ontologyFetch<OntologyFunctionVersionResponse>(
    `${base}/${functionId}/versions/${versionId}`,
    undefined,
    'Failed to fetch version',
  );
}

export async function saveFunctionVersion(
  functionId: string,
  body: { source_code: string; input_schema?: Record<string, unknown>; output_schema?: Record<string, unknown> },
): Promise<OntologyFunctionVersionResponse> {
  return ontologyFetch<OntologyFunctionVersionResponse>(
    `${base}/${functionId}/versions`,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to save version',
  );
}

export async function validateFunctionSource(
  functionId: string,
  source_code: string,
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  return ontologyFetch(
    `${base}/${functionId}/validate`,
    { method: 'POST', body: JSON.stringify({ source_code }) },
    'Validate failed',
  );
}

export async function publishOntologyFunction(
  functionId: string,
  versionId?: string,
): Promise<OntologyFunctionResponse> {
  const qs = new URLSearchParams();
  if (versionId) qs.set('version_id', versionId);
  const suffix = qs.toString() ? `?${qs}` : '';
  return ontologyFetch<OntologyFunctionResponse>(
    `${base}/${functionId}/publish${suffix}`,
    { method: 'POST' },
    'Publish failed',
  );
}

export async function executeOntologyFunction(
  functionId: string,
  input: Record<string, unknown>,
  options?: { use_published?: boolean; version_id?: string },
): Promise<OntologyExecutionResult> {
  return ontologyFetch<OntologyExecutionResult>(
    `${base}/${functionId}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        input,
        use_published: options?.use_published,
        version_id: options?.version_id,
      }),
    },
    'Execute failed',
  );
}

export async function fetchFunctionExecutions(functionId: string): Promise<OntologyFunctionExecutionResponse[]> {
  return ontologyFetch<OntologyFunctionExecutionResponse[]>(
    `${base}/${functionId}/executions`,
    undefined,
    'Failed to fetch executions',
  );
}
