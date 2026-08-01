import { request } from './apiClient';

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

export async function fetchResourceAcl(
  resourceType: string,
  resourceId: string
): Promise<ResourceAclOut> {
  return request<ResourceAclOut>(
    `/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`
  );
}

export async function putResourceAcl(
  resourceType: string,
  resourceId: string,
  grants: { grantee_type: string; grantee_id?: string | null; permissions: string }[]
): Promise<ResourceAclOut> {
  return request<ResourceAclOut>(
    `/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants }),
    }
  );
}

export async function fetchResourceAclOwnerCandidates(
  resourceType: string,
  resourceId: string
): Promise<OwnerCandidate[]> {
  return request<OwnerCandidate[]>(
    `/api/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/owner-candidates`
  );
}

export const RESOURCE_TYPES = {
  documentChannel: 'document_channel',
  articleChannel: 'article_channel',
  mediaChannel: 'media_channel',
  wikiSpace: 'wiki_space',
  knowledgeBase: 'knowledge_base',
  evaluation: 'evaluation',
  dataset: 'dataset',
  objectType: 'object_type',
  linkType: 'link_type',
  glossary: 'glossary',
  project: 'project',
} as const;
