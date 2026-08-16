import { config } from '../config';
import { ontologyFetch } from './ontologyFetch';

export interface OntologyGroupResponse {
  id: string;
  display_name: string;
  description?: string | null;
  object_type_ids: string[];
  created_at: string;
  updated_at: string;
}

const base = `${config.apiUrl}/api/ontology/groups`;

export async function fetchOntologyGroups(): Promise<OntologyGroupResponse[]> {
  return ontologyFetch<OntologyGroupResponse[]>(base, undefined, 'Failed to fetch groups');
}

export async function createOntologyGroup(body: {
  display_name: string;
  description?: string;
  object_type_ids?: string[];
}): Promise<OntologyGroupResponse> {
  return ontologyFetch<OntologyGroupResponse>(
    base,
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create group',
  );
}

export async function fetchOntologyGroup(id: string): Promise<OntologyGroupResponse> {
  return ontologyFetch<OntologyGroupResponse>(`${base}/${id}`, undefined, 'Failed to fetch group');
}

export async function updateOntologyGroup(
  id: string,
  body: { display_name?: string; description?: string; object_type_ids?: string[] },
): Promise<OntologyGroupResponse> {
  return ontologyFetch<OntologyGroupResponse>(
    `${base}/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update group',
  );
}

export async function deleteOntologyGroup(id: string): Promise<void> {
  await ontologyFetch<void>(`${base}/${id}`, { method: 'DELETE' }, 'Failed to delete group');
}

export interface OntologyGroupRelatedLinkType {
  id: string;
  name: string;
  source_object_type_id: string;
  target_object_type_id: string;
  source_object_type_name?: string | null;
  target_object_type_name?: string | null;
}

export interface OntologyGroupRelatedFunction {
  id: string;
  api_name: string;
  display_name: string;
  object_type_id?: string | null;
}

export interface OntologyGroupRelatedAction {
  id: string;
  api_name: string;
  display_name: string;
  object_type_id: string;
  status: string;
}

export interface OntologyGroupRelatedResponse {
  object_type_ids: string[];
  link_types: OntologyGroupRelatedLinkType[];
  functions: OntologyGroupRelatedFunction[];
  action_types: OntologyGroupRelatedAction[];
}

export async function fetchOntologyGroupRelated(id: string): Promise<OntologyGroupRelatedResponse> {
  return ontologyFetch<OntologyGroupRelatedResponse>(
    `${base}/${id}/related`,
    undefined,
    'Failed to fetch group related resources',
  );
}
