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
