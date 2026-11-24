import { config } from '../config';
import { ontologyFetch, type OntologyExecutionResult } from './ontologyFetch';

export type { OntologyExecutionResult } from './ontologyFetch';
export * from './ontologyGroupsApi';
export * from './ontologyActionsApi';
export { DEFAULT_FUNCTION_TEMPLATE, DEFAULT_PREVIEW_INPUT } from './ontologyFunctionDefaults';

export type OntologySchemaFieldKind = 'primitive' | 'object_type' | 'link_type';

export interface OntologySchemaFieldRef {
  path: string;
  side: 'input' | 'output';
  kind: OntologySchemaFieldKind;
  type_name?: string | null;
  json_type?: string | null;
}

export interface OntologyFunctionSchemaRelations {
  object_type_names: string[];
  link_type_names: string[];
  fields: OntologySchemaFieldRef[];
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  version?: number | null;
}

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
  schema_relations?: OntologyFunctionSchemaRelations | null;
  /** External services its source calls with `client.external(...)`. */
  external_services?: { api_name: string; registered: boolean }[];
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
  flow_spec?: Record<string, unknown> | null;
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

/** `source` is the authoring mode: `code` (source files) or `logic` (Logic functions). Omitted = whole registry. */
export async function fetchOntologyFunctions(params?: {
  source?: 'code' | 'logic';
}): Promise<OntologyFunctionListResponse> {
  const qs = params?.source ? `?source=${params.source}` : '';
  return ontologyFetch<OntologyFunctionListResponse>(
    `${base}${qs}`,
    undefined,
    'Failed to fetch functions',
  );
}

export async function fetchOntologyFunction(id: string): Promise<OntologyFunctionResponse> {
  return ontologyFetch<OntologyFunctionResponse>(`${base}/${id}`, undefined, 'Failed to fetch function');
}

export async function createOntologyFunction(body: {
  api_name: string;
  display_name: string;
  description?: string;
  object_type_id?: string | null;
  /** `logic` means the body is a flow; v1 then carries `flow_spec` instead of Python. */
  source?: 'code' | 'logic';
  source_code?: string;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  flow_spec?: Record<string, unknown> | null;
}): Promise<OntologyFunctionResponse> {
  return ontologyFetch<OntologyFunctionResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create function',
  );
}

export async function updateOntologyFunction(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    object_type_id?: string | null;
    development_status?: string;
    status?: string;
  },
): Promise<OntologyFunctionResponse> {
  return ontologyFetch<OntologyFunctionResponse>(
    `${base}/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update function',
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
  body: {
    source_code: string;
    input_schema?: Record<string, unknown> | null;
    output_schema?: Record<string, unknown> | null;
    flow_spec?: Record<string, unknown> | null;
  },
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

/** Run an unsaved flow (the editor's Run button). Needs write permission: it is authoring, not calling. */
export async function dryRunLogicFlow(
  functionId: string,
  body: { flow_spec: Record<string, unknown>; input: Record<string, unknown> },
): Promise<OntologyExecutionResult> {
  return ontologyFetch<OntologyExecutionResult>(
    `${base}/${functionId}/dry-run`,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to run the flow',
  );
}

export async function executeOntologyFunctionByApiName(
  apiName: string,
  body: { input?: Record<string, unknown>; use_published?: boolean },
): Promise<OntologyExecutionResult> {
  return ontologyFetch<OntologyExecutionResult>(
    `${base}/by-api-name/${encodeURIComponent(apiName)}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: body.input || {},
        use_published: body.use_published ?? true,
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
