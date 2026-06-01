import { config } from '../config';
import { getAuthHeaders, authAwareFetch } from './apiClient';
import type { OwnerCandidate, ResourceAclOut } from './resourceAclApi';

export type PermissionCatalogEntry = {
  key: string;
  label: string;
  description: string;
  frontend_route_patterns: string[];
  backend_api_patterns: string[];
};

export type SecurityRoleOut = {
  id: string;
  name: string;
  description: string | null;
  permission_keys: string[];
  is_system_role?: boolean;
};

export type SecurityRolesPageResponse = {
  auth_mode: string;
  managed_in_console: boolean;
  idp_notice: string | null;
  roles: SecurityRoleOut[];
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

export type FrontendFeatureRef = {
  path_pattern: string;
  label: string;
  section: string;
  note?: string | null;
};

export type ApiOperationRef = {
  method: string;
  path: string;
  summary: string;
  tags: string[];
};

export type OperationKeyHintRef = {
  key: string;
  label: string;
  description: string;
  category: string;
};

export type PermissionReferenceResponse = {
  frontend_features: FrontendFeatureRef[];
  api_operations: ApiOperationRef[];
  operation_key_hints: OperationKeyHintRef[];
  hint: string;
};

export async function fetchPermissionReference(): Promise<PermissionReferenceResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/permission-reference`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type SecurityPermissionRowOut = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  frontend_route_patterns: string[];
  backend_api_patterns: string[];
  sort_order: number;
  created_at: string | null;
};

export async function createSecurityPermission(body: {
  key: string;
  label: string;
  description?: string | null;
  frontend_route_patterns?: string[];
  backend_api_patterns?: string[];
}): Promise<SecurityPermissionRowOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-permissions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      key: body.key,
      label: body.label,
      description: body.description ?? null,
      frontend_route_patterns: body.frontend_route_patterns ?? [],
      backend_api_patterns: body.backend_api_patterns ?? [],
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchSecurityPermissions(): Promise<SecurityPermissionRowOut[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-permissions`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchSecurityPermission(
  permissionId: string,
  body: {
    label?: string;
    description?: string | null;
    frontend_route_patterns?: string[];
    backend_api_patterns?: string[];
    sort_order?: number;
  }
): Promise<SecurityPermissionRowOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-permissions/${permissionId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteSecurityPermission(permissionId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-permissions/${permissionId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/auth/permission-catalog`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchSecurityRolesPage(): Promise<SecurityRolesPageResponse> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-roles`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createSecurityRole(body: {
  name: string;
  description?: string | null;
}): Promise<SecurityRoleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-roles`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteSecurityRole(roleId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-roles/${roleId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function putRolePermissions(roleId: string, permissionKeys: string[]): Promise<SecurityRoleOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/security-roles/${roleId}/permissions`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ permission_keys: permissionKeys }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type AccessGroupOut = { id: string; name: string; description: string | null };

export async function fetchAccessGroups(): Promise<AccessGroupOut[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createAccessGroup(body: {
  name: string;
  description?: string | null;
}): Promise<AccessGroupOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchAccessGroup(
  id: string,
  body: { name?: string; description?: string | null }
): Promise<AccessGroupOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteAccessGroup(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${id}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type LocalUserBrief = { id: string; email: string; username: string };

export type MemberBrief = { subject: string; email?: string | null; username?: string | null };

export async function fetchGroupMembers(groupId: string): Promise<{ members: MemberBrief[] }> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${groupId}/members`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function putGroupMembers(groupId: string, subjects: string[]) {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${groupId}/members`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subjects }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ members: MemberBrief[] }>;
}

export type GroupScopesOut = {
  channel_ids: string[];
  article_channel_ids: string[];
  knowledge_base_ids: string[];
  wiki_space_ids: string[];
  evaluation_ids: string[];
  dataset_ids: string[];
  object_type_ids: string[];
  link_type_ids: string[];
  data_resource_ids: string[];
};

export async function fetchGroupScopes(groupId: string): Promise<GroupScopesOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${groupId}/scopes`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type GroupSharedResourceOut = {
  resource_type: string;
  resource_type_label: string;
  resource_id: string;
  resource_label: string;
  permissions: string;
  share_path: string | null;
};

export async function fetchGroupSharedResources(groupId: string): Promise<GroupSharedResourceOut[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${groupId}/shared-resources`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type ResourceAclIssueCode =
  | 'others_manage'
  | 'others_write'
  | 'unknown_group'
  | 'empty_group'
  | 'unknown_owner'
  | 'missing_owner'
  | 'owner_no_permissions'
  | 'owner_no_manage'
  | 'implicit_others'
  | 'others_read';

export const RESOURCE_ACL_ISSUE_ORDER: ResourceAclIssueCode[] = [
  'others_manage',
  'others_write',
  'unknown_group',
  'empty_group',
  'unknown_owner',
  'missing_owner',
  'owner_no_permissions',
  'owner_no_manage',
  'implicit_others',
  'others_read',
];

/** May be intentional — shown under “Review recommended”. */
export const RESOURCE_ACL_ISSUE_REVIEW: ResourceAclIssueCode[] = ['others_read'];

export const RESOURCE_ACL_ISSUE_CRITICAL_ORDER = RESOURCE_ACL_ISSUE_ORDER.filter(
  (code) => !RESOURCE_ACL_ISSUE_REVIEW.includes(code)
);

export type ResourceAclIssueItem = {
  resource_type: string;
  resource_type_label: string;
  resource_id: string;
  resource_label: string;
  share_path: string | null;
  issues: ResourceAclIssueCode[];
  owner_label: string | null;
  owner_permissions: string | null;
  others_permissions: string | null;
  inherited_others_permissions: string | null;
  broken_group_ids: string[];
  empty_group_ids: string[];
  grants: {
    grantee_type: string;
    grantee_id: string | null;
    permissions: string;
    grantee_label?: string | null;
    is_owner?: boolean;
  }[];
};

export type ResourceAclIssuesSummaryOut = {
  issue_count: number;
  by_issue: Partial<Record<ResourceAclIssueCode, number>>;
};

export type ResourceAclIssuesPageOut = ResourceAclIssuesSummaryOut & {
  issue: ResourceAclIssueCode;
  total: number;
  limit: number;
  offset: number;
  items: ResourceAclIssueItem[];
};

export async function fetchResourceAclIssuesSummary(): Promise<ResourceAclIssuesSummaryOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/resource-acl/issues`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchResourceAclIssuesPage(
  issue: ResourceAclIssueCode,
  limit: number,
  offset: number
): Promise<ResourceAclIssuesPageOut> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    issue,
    limit: String(limit),
    offset: String(offset),
  });
  const res = await authAwareFetch(
    `${config.apiUrl}/api/admin/resource-acl/issues?${params.toString()}`,
    { headers: { ...headers }, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchAdminResourceAcl(
  resourceType: string,
  resourceId: string
): Promise<ResourceAclOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function putAdminResourceAcl(
  resourceType: string,
  resourceId: string,
  grants: { grantee_type: string; grantee_id?: string | null; permissions: string }[]
): Promise<ResourceAclOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
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

export async function fetchAdminResourceAclOwnerCandidates(
  resourceType: string,
  resourceId: string
): Promise<OwnerCandidate[]> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(
    `${config.apiUrl}/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/owner-candidates`,
    { headers, credentials: 'include' }
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export type DataResourceMigrationReportOut = {
  deprecated: boolean;
  message: string;
  row_count: number;
  rows: {
    id: string;
    name: string;
    description: string | null;
    resource_kind: string;
    attributes: Record<string, unknown>;
    anchor_channel_id: string | null;
    anchor_knowledge_base_id: string | null;
  }[];
};

export async function fetchDataResourcesMigrationReport(): Promise<DataResourceMigrationReportOut> {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/data-resources/migration-report`, {
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function putGroupScopes(groupId: string, body: Partial<GroupScopesOut>) {
  const headers = await getAuthHeaders();
  const res = await authAwareFetch(`${config.apiUrl}/api/admin/groups/${groupId}/scopes`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GroupScopesOut>;
}
