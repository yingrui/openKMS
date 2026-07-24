import { config } from '../config';
import { ontologyFetch, type OntologyExecutionResult } from './ontologyFetch';

export interface OntologyActionTypeResponse {
  id: string;
  api_name: string;
  display_name: string;
  description?: string | null;
  object_type_id: string;
  rule_type: string;
  function_id?: string | null;
  function_version?: number | null;
  parameters?: unknown[] | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OntologyActionLogResponse {
  id: string;
  action_type_id: string;
  object_id?: string | null;
  caller_user_id?: string | null;
  status: string;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
}

const base = `${config.apiUrl}/api/ontology/action-types`;

export async function fetchOntologyActionTypes(params?: {
  object_type_id?: string;
}): Promise<OntologyActionTypeResponse[]> {
  const qs = new URLSearchParams();
  if (params?.object_type_id) qs.set('object_type_id', params.object_type_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return ontologyFetch<OntologyActionTypeResponse[]>(`${base}${suffix}`, undefined, 'Failed to fetch actions');
}

export async function fetchOntologyActionType(id: string): Promise<OntologyActionTypeResponse> {
  return ontologyFetch<OntologyActionTypeResponse>(`${base}/${id}`, undefined, 'Failed to fetch action');
}

export async function updateOntologyActionType(
  id: string,
  body: {
    display_name?: string;
    description?: string;
    function_id?: string | null;
    function_version?: number | null;
    status?: string;
  },
): Promise<OntologyActionTypeResponse> {
  return ontologyFetch<OntologyActionTypeResponse>(
    `${base}/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update action',
  );
}

export async function executeOntologyAction(
  actionTypeId: string,
  body: { object_id?: string; input?: Record<string, unknown> },
): Promise<OntologyExecutionResult> {
  return ontologyFetch<OntologyExecutionResult>(
    `${base}/${actionTypeId}/execute`,
    { method: 'POST', body: JSON.stringify(body) },
    'Action execution failed',
  );
}

export async function fetchOntologyActionLogs(actionTypeId: string): Promise<OntologyActionLogResponse[]> {
  return ontologyFetch<OntologyActionLogResponse[]>(
    `${base}/${actionTypeId}/logs`,
    undefined,
    'Failed to fetch action logs',
  );
}

export async function createOntologyActionType(body: {
  api_name: string;
  display_name: string;
  description?: string;
  object_type_id: string;
  rule_type?: string;
  function_id?: string;
  function_version?: number;
}): Promise<OntologyActionTypeResponse> {
  return ontologyFetch<OntologyActionTypeResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create action',
  );
}

export async function deleteOntologyActionType(id: string): Promise<void> {
  await ontologyFetch<void>(`${base}/${id}`, { method: 'DELETE' }, 'Failed to delete action');
}
