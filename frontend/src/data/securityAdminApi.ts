import { request } from './apiClient';
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
  return request<PermissionReferenceResponse>('/api/admin/permission-reference');
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
  return request<SecurityPermissionRowOut>('/api/admin/security-permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: body.key,
      label: body.label,
      description: body.description ?? null,
      frontend_route_patterns: body.frontend_route_patterns ?? [],
      backend_api_patterns: body.backend_api_patterns ?? [],
    }),
  });
}

export type SecurityPermissionsPageOut = {
  items: SecurityPermissionRowOut[];
  total: number;
  limit: number;
  offset: number;
};

export type ListPageParams = {
  limit?: number;
  offset?: number;
  search?: string;
};

export async function fetchSecurityPermissionsPage(
  params: ListPageParams & { category?: string | null } = {}
): Promise<SecurityPermissionsPageOut> {
  return request<SecurityPermissionsPageOut>('/api/admin/security-permissions', {
    query: {
      limit: params.limit,
      offset: params.offset,
      search: params.search?.trim(),
      category: params.category,
    },
  });
}

/** All catalog keys (for onboarding / hint diff). */
export async function fetchSecurityPermissionKeys(): Promise<string[]> {
  return request<string[]>('/api/admin/security-permissions/keys');
}

/** @deprecated Prefer fetchSecurityPermissionsPage */
export async function fetchSecurityPermissions(): Promise<SecurityPermissionRowOut[]> {
  const items: SecurityPermissionRowOut[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await fetchSecurityPermissionsPage({ limit: 200, offset });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return items;
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
  return request<SecurityPermissionRowOut>(`/api/admin/security-permissions/${permissionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteSecurityPermission(permissionId: string): Promise<void> {
  return request<void>(`/api/admin/security-permissions/${permissionId}`, { method: 'DELETE' });
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  return request<PermissionCatalogEntry[]>('/api/auth/permission-catalog');
}

export async function fetchSecurityRolesPage(): Promise<SecurityRolesPageResponse> {
  return request<SecurityRolesPageResponse>('/api/admin/security-roles');
}

export async function createSecurityRole(body: {
  name: string;
  description?: string | null;
}): Promise<SecurityRoleOut> {
  return request<SecurityRoleOut>('/api/admin/security-roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteSecurityRole(roleId: string): Promise<void> {
  return request<void>(`/api/admin/security-roles/${roleId}`, { method: 'DELETE' });
}

export async function putRolePermissions(roleId: string, permissionKeys: string[]): Promise<SecurityRoleOut> {
  return request<SecurityRoleOut>(`/api/admin/security-roles/${roleId}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission_keys: permissionKeys }),
  });
}

export type AccessGroupOut = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  shared_resource_count: number;
};

export async function fetchAccessGroup(groupId: string): Promise<AccessGroupOut> {
  return request<AccessGroupOut>(`/api/admin/groups/${groupId}`);
}

export type AccessGroupsPageOut = {
  items: AccessGroupOut[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchAccessGroupsPage(
  params: ListPageParams = {}
): Promise<AccessGroupsPageOut> {
  return request<AccessGroupsPageOut>('/api/admin/groups', {
    query: { limit: params.limit, offset: params.offset, search: params.search?.trim() },
  });
}

/** All groups (sidebar, share panel). Paginates at API max page size (200). */
export async function fetchAccessGroups(): Promise<AccessGroupOut[]> {
  const items: AccessGroupOut[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await fetchAccessGroupsPage({ limit: 200, offset });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);
  return items;
}

export async function createAccessGroup(body: {
  name: string;
  description?: string | null;
}): Promise<AccessGroupOut> {
  return request<AccessGroupOut>('/api/admin/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchAccessGroup(
  id: string,
  body: { name?: string; description?: string | null }
): Promise<AccessGroupOut> {
  return request<AccessGroupOut>(`/api/admin/groups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteAccessGroup(id: string): Promise<void> {
  return request<void>(`/api/admin/groups/${id}`, { method: 'DELETE' });
}

export type LocalUserBrief = { id: string; email: string; username: string };

export type MemberBrief = { subject: string; email?: string | null; username?: string | null };

export type GroupMembersPageOut = {
  members: MemberBrief[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchGroupMemberSubjects(groupId: string): Promise<string[]> {
  const data = await request<{ subjects: string[] }>(`/api/admin/groups/${groupId}/member-subjects`);
  return data.subjects;
}

export async function fetchGroupMembersPage(
  groupId: string,
  params: ListPageParams = {}
): Promise<GroupMembersPageOut> {
  return request<GroupMembersPageOut>(`/api/admin/groups/${groupId}/members`, {
    query: { limit: params.limit, offset: params.offset },
  });
}

export async function putGroupMembers(groupId: string, subjects: string[]) {
  return request<{ members: MemberBrief[] }>(`/api/admin/groups/${groupId}/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjects }),
  });
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
};

export async function fetchGroupScopes(groupId: string): Promise<GroupScopesOut> {
  return request<GroupScopesOut>(`/api/admin/groups/${groupId}/scopes`);
}

export type GroupSharedResourceOut = {
  resource_type: string;
  resource_type_label: string;
  resource_id: string;
  resource_label: string;
  permissions: string;
  share_path: string | null;
};

export type GroupSharedResourcesPageOut = {
  items: GroupSharedResourceOut[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchGroupSharedResourcesPage(
  groupId: string,
  params: ListPageParams = {}
): Promise<GroupSharedResourcesPageOut> {
  return request<GroupSharedResourcesPageOut>(`/api/admin/groups/${groupId}/shared-resources`, {
    query: { limit: params.limit, offset: params.offset },
  });
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
  return request<ResourceAclIssuesSummaryOut>('/api/admin/resource-acl/issues');
}

export async function fetchResourceAclIssuesPage(
  issue: ResourceAclIssueCode,
  limit: number,
  offset: number
): Promise<ResourceAclIssuesPageOut> {
  return request<ResourceAclIssuesPageOut>('/api/admin/resource-acl/issues', {
    query: { issue, limit, offset },
  });
}

export async function fetchAdminResourceAcl(
  resourceType: string,
  resourceId: string
): Promise<ResourceAclOut> {
  return request<ResourceAclOut>(
    `/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`
  );
}

export async function putAdminResourceAcl(
  resourceType: string,
  resourceId: string,
  grants: { grantee_type: string; grantee_id?: string | null; permissions: string }[]
): Promise<ResourceAclOut> {
  return request<ResourceAclOut>(
    `/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants }),
    }
  );
}

export async function fetchAdminResourceAclOwnerCandidates(
  resourceType: string,
  resourceId: string
): Promise<OwnerCandidate[]> {
  return request<OwnerCandidate[]>(
    `/api/admin/resource-acl/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/owner-candidates`
  );
}

export async function putGroupScopes(groupId: string, body: Partial<GroupScopesOut>) {
  return request<GroupScopesOut>(`/api/admin/groups/${groupId}/scopes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
