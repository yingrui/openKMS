import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';

export type AclGrant = {
  grantee_type: 'user' | 'group' | 'authenticated';
  grantee_id: string | null;
  permissions: string;
  grantee_label?: string | null;
  is_owner?: boolean;
};

export type ResourceAclOut = {
  resource_type: string;
  resource_id: string;
  grants: AclGrant[];
  effective_permissions: string;
  inherits_from: { resource_type: string; resource_id: string }[];
  owner_subject?: string | null;
  owner_label?: string | null;
  created_by?: string | null;
};

export type OwnerCandidate = {
  subject: string;
  label: string;
};

async function parseError(res: Response): Promise<string> {
  let msg = res.statusText;
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') msg = j.detail;
  } catch {
    /* ignore */
  }
  return msg;
}

export async function fetchResourceAcl(
  resourceType: string,
  resourceId: string
): Promise<ResourceAclOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function putResourceAcl(
  resourceType: string,
  resourceId: string,
  grants: { grantee_type: string; grantee_id?: string | null; permissions: string }[]
): Promise<ResourceAclOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ grants }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchResourceAclOwnerCandidates(
  resourceType: string,
  resourceId: string
): Promise<OwnerCandidate[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/owner-candidates`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export const RESOURCE_TYPES = {
  documentChannel: 'document_channel',
  articleChannel: 'article_channel',
  wikiSpace: 'wiki_space',
  wikiPage: 'wiki_page',
  knowledgeBase: 'knowledge_base',
  evaluation: 'evaluation',
  dataset: 'dataset',
  objectType: 'object_type',
  linkType: 'link_type',
  glossary: 'glossary',
} as const;
