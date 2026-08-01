import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PERM_ALL } from '../../config/permissions';
import {
  createSecurityPermission,
  createSecurityRole,
  deleteSecurityPermission,
  deleteSecurityRole,
  fetchPermissionReference,
  fetchSecurityPermissionKeys,
  fetchSecurityPermissionsPage,
  fetchSecurityRolesPage,
  patchSecurityPermission,
  putRolePermissions,
  type OperationKeyHintRef,
  type PermissionReferenceResponse,
  type SecurityPermissionRowOut,
  type SecurityRoleOut,
} from '../../data/securityAdminApi';
import { useConfirm } from '../../contexts/ConfirmContext';

const PERMS_PAGE_SIZE_DEFAULT = 25;

const ONBOARDING_DISMISSED_KEY = 'openkms_permissions_onboarding_dismissed';

function linesToPatterns(s: string) {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function useConsolePermissionManagement() {
  const confirm = useConfirm();
  const [catalog, setCatalog] = useState<SecurityPermissionRowOut[]>([]);
  const [catalogKeys, setCatalogKeys] = useState<string[]>([]);
  const [permTotal, setPermTotal] = useState(0);
  const [permPage, setPermPage] = useState(0);
  const [permPageSize, setPermPageSize] = useState(PERMS_PAGE_SIZE_DEFAULT);
  const [operationKeyHints, setOperationKeyHints] = useState<OperationKeyHintRef[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [bulkAddingHints, setBulkAddingHints] = useState(false);
  const [addingHintKey, setAddingHintKey] = useState<string | null>(null);
  const [roles, setRoles] = useState<SecurityRoleOut[]>([]);
  const [managed, setManaged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<SecurityPermissionRowOut | null>(null);
  const [showEditPermModal, setShowEditPermModal] = useState(false);
  const [editPermLabel, setEditPermLabel] = useState('');
  const [editPermDesc, setEditPermDesc] = useState('');
  const [editPermFe, setEditPermFe] = useState('');
  const [editPermBe, setEditPermBe] = useState('');
  const [editPermSubmitting, setEditPermSubmitting] = useState(false);
  const [editingPermissionId, setEditingPermissionId] = useState<string | null>(null);
  const [showRefModal, setShowRefModal] = useState(false);
  const [refLoading, setRefLoading] = useState(false);
  const [refData, setRefData] = useState<PermissionReferenceResponse | null>(null);
  const [refTab, setRefTab] = useState<'frontend' | 'api' | 'keys'>('frontend');
  const [refSearch, setRefSearch] = useState('');
  const [showAddPermModal, setShowAddPermModal] = useState(false);
  const [permKey, setPermKey] = useState('');
  const [permLabel, setPermLabel] = useState('');
  const [permDesc, setPermDesc] = useState('');
  const [permFe, setPermFe] = useState('');
  const [permBe, setPermBe] = useState('');
  const [permSubmitting, setPermSubmitting] = useState(false);
  const [permSearch, setPermSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  /** Keys assigned to the selected role in the UI; only persisted when the user clicks Save. */
  const [roleDraftKeys, setRoleDraftKeys] = useState<string[]>([]);

  const loadMeta = useCallback(async () => {
    try {
      const [rolesPage, ref, keys] = await Promise.all([
        fetchSecurityRolesPage(),
        fetchPermissionReference(),
        fetchSecurityPermissionKeys(),
      ]);
      setRoles(rolesPage.roles);
      setManaged(rolesPage.managed_in_console);
      setOperationKeyHints(Array.isArray(ref.operation_key_hints) ? ref.operation_key_hints : []);
      setCatalogKeys(keys);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchSecurityPermissionsPage({
        limit: permPageSize,
        offset: permPage * permPageSize,
        search: permSearch.trim() || undefined,
        category: activeCategory ?? undefined,
      });
      setCatalog(page.items);
      setPermTotal(page.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, permPage, permPageSize, permSearch]);

  const reloadAll = useCallback(async () => {
    await loadMeta();
    await loadCatalog();
  }, [loadMeta, loadCatalog]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setPermPage(0);
  }, [permSearch, activeCategory]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  const catalogEditable = selectedRoleId === null;

  const isDraftDirty = useMemo(() => {
    if (!selectedRole) return false;
    const a = [...selectedRole.permission_keys].sort().join('\0');
    const b = [...roleDraftKeys].sort().join('\0');
    return a !== b;
  }, [selectedRole, roleDraftKeys]);

  const canLeaveRoleSelection = useCallback(async () => {
    if (!selectedRoleId || !selectedRole) return true;
    const a = [...selectedRole.permission_keys].sort().join('\0');
    const b = [...roleDraftKeys].sort().join('\0');
    if (a === b) return true;
    return confirm({
      title: 'Discard changes?',
      message: 'Discard unsaved permission changes for this role?',
      confirmLabel: 'Discard',
      danger: true,
    });
  }, [selectedRoleId, selectedRole, roleDraftKeys, confirm]);

  const trySetSelectedRoleId = useCallback(
    async (nextId: string | null) => {
      if (nextId === selectedRoleId) return;
      if (!(await canLeaveRoleSelection())) return;
      setSelectedRoleId(nextId);
      if (nextId) {
        const r = roles.find((x) => x.id === nextId);
        setRoleDraftKeys(r ? [...r.permission_keys] : []);
      } else {
        setRoleDraftKeys([]);
      }
    },
    [selectedRoleId, canLeaveRoleSelection, roles]
  );

  useEffect(() => {
    if (!roles.length) {
      setSelectedRoleId(null);
      setRoleDraftKeys([]);
      return;
    }
    if (selectedRoleId && !roles.some((r) => r.id === selectedRoleId)) {
      setSelectedRoleId(null);
      setRoleDraftKeys([]);
    }
  }, [roles, selectedRoleId]);

  const openReference = useCallback(async () => {
    setShowRefModal(true);
    setRefSearch('');
    setRefTab('frontend');
    setRefLoading(true);
    try {
      const data = await fetchPermissionReference();
      setRefData(data);
      if (data.operation_key_hints?.length) {
        setOperationKeyHints(data.operation_key_hints);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load reference');
    } finally {
      setRefLoading(false);
    }
  }, []);

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setOnboardingDismissed(true);
  }, []);

  const missingOperationKeyHints = useMemo(() => {
    const keys = new Set(catalogKeys);
    return operationKeyHints.filter((h) => !keys.has(h.key));
  }, [catalogKeys, operationKeyHints]);

  const hintCategoryByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of operationKeyHints) {
      m.set(h.key, h.category);
    }
    return m;
  }, [operationKeyHints]);

  const permissionCategories = useMemo(() => {
    const s = new Set<string>();
    for (const h of operationKeyHints) {
      s.add(h.category);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [operationKeyHints]);

  const addSuggestedPermission = useCallback(
    async (h: OperationKeyHintRef) => {
      setAddingHintKey(h.key);
      try {
        await createSecurityPermission({
          key: h.key,
          label: h.label,
          description: h.description,
          frontend_route_patterns: [],
          backend_api_patterns: [],
        });
        toast.success(`Added ${h.key}`);
        await reloadAll();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add');
      } finally {
        setAddingHintKey(null);
      }
    },
    [reloadAll]
  );

  const addAllMissingSuggestedKeys = useCallback(async () => {
    if (missingOperationKeyHints.length === 0) return;
    setBulkAddingHints(true);
    try {
      for (const h of missingOperationKeyHints) {
        await createSecurityPermission({
          key: h.key,
          label: h.label,
          description: h.description,
          frontend_route_patterns: [],
          backend_api_patterns: [],
        });
      }
      toast.success(`Added ${missingOperationKeyHints.length} permissions`);
      await reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk add failed');
    } finally {
      setBulkAddingHints(false);
    }
  }, [missingOperationKeyHints, reloadAll]);

  const openEditPermission = useCallback((row: SecurityPermissionRowOut) => {
    if (row.key === PERM_ALL) {
      toast.error('The built-in “all” permission cannot be modified.');
      return;
    }
    setEditingPermissionId(row.id);
    setEditPermLabel(row.label);
    setEditPermDesc(row.description ?? '');
    setEditPermFe(row.frontend_route_patterns.join('\n'));
    setEditPermBe(row.backend_api_patterns.join('\n'));
    setShowEditPermModal(true);
    setDetailEntry(null);
  }, []);

  const submitEditPermission = useCallback(async () => {
    if (!editingPermissionId) return;
    if (catalog.some((c) => c.id === editingPermissionId && c.key === PERM_ALL)) {
      toast.error('The built-in “all” permission cannot be modified.');
      return;
    }
    const label = editPermLabel.trim();
    if (!label) {
      toast.error('Label is required');
      return;
    }
    setEditPermSubmitting(true);
    try {
      await patchSecurityPermission(editingPermissionId, {
        label,
        description: editPermDesc.trim() || null,
        frontend_route_patterns: linesToPatterns(editPermFe),
        backend_api_patterns: linesToPatterns(editPermBe),
      });
      toast.success('Permission updated');
      setShowEditPermModal(false);
      setEditingPermissionId(null);
      await reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setEditPermSubmitting(false);
    }
  }, [editingPermissionId, catalog, editPermLabel, editPermDesc, editPermFe, editPermBe, reloadAll]);

  const confirmDeletePermission = useCallback(async (row: SecurityPermissionRowOut) => {
    if (row.key === PERM_ALL) return;
    if (
      !(await confirm({
        title: 'Delete permission',
        message: `Delete permission "${row.key}"? Roles must not reference it; any assignment will block deletion.`,
        confirmLabel: 'Delete',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await deleteSecurityPermission(row.id);
      setDetailEntry(null);
      toast.success('Permission deleted');
      await reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [confirm, reloadAll]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  }, []);

  const submitAddPermission = useCallback(async () => {
    const key = permKey.trim();
    const label = permLabel.trim();
    if (!key || !label) {
      toast.error('Permission key and label are required');
      return;
    }
    setPermSubmitting(true);
    try {
      await createSecurityPermission({
        key,
        label,
        description: permDesc.trim() || null,
        frontend_route_patterns: linesToPatterns(permFe),
        backend_api_patterns: linesToPatterns(permBe),
      });
      toast.success('Permission created');
      setShowAddPermModal(false);
      setPermKey('');
      setPermLabel('');
      setPermDesc('');
      setPermFe('');
      setPermBe('');
      await reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setPermSubmitting(false);
    }
  }, [permKey, permLabel, permDesc, permFe, permBe, reloadAll]);

  const filteredFrontendRef = useMemo(() => {
    if (!refData) return [];
    const q = refSearch.trim().toLowerCase();
    if (!q) return refData.frontend_features;
    return refData.frontend_features.filter(
      (r) =>
        r.path_pattern.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q) ||
        (r.note && r.note.toLowerCase().includes(q))
    );
  }, [refData, refSearch]);

  const filteredApiRef = useMemo(() => {
    if (!refData) return [];
    const q = refSearch.trim().toLowerCase();
    if (!q) return refData.api_operations;
    return refData.api_operations.filter(
      (r) =>
        r.path.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [refData, refSearch]);

  const filteredOperationKeyHints = useMemo(() => {
    const list = refData?.operation_key_hints ?? operationKeyHints;
    const q = refSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (h) =>
        h.key.toLowerCase().includes(q) ||
        h.label.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q) ||
        h.category.toLowerCase().includes(q)
    );
  }, [refData, refSearch, operationKeyHints]);

  const toggleDraftPerm = useCallback((key: string) => {
    setRoleDraftKeys((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set];
    });
  }, []);

  const toggleAllVisibleInDraft = useCallback(() => {
    if (!selectedRole || catalog.length === 0) return;
    const visibleKeys = catalog.map((r) => r.key);
    setRoleDraftKeys((prev) => {
      const set = new Set(prev);
      const allAssigned = visibleKeys.every((k) => set.has(k));
      if (allAssigned) {
        visibleKeys.forEach((k) => set.delete(k));
      } else {
        visibleKeys.forEach((k) => set.add(k));
      }
      return [...set];
    });
  }, [selectedRole, catalog]);

  const resetRoleDraft = useCallback(() => {
    if (!selectedRole) return;
    setRoleDraftKeys([...selectedRole.permission_keys]);
  }, [selectedRole]);

  const saveRoleDraft = useCallback(async () => {
    if (!selectedRole || !managed) return;
    setSavingRoleId(selectedRole.id);
    try {
      const updated = await putRolePermissions(selectedRole.id, roleDraftKeys);
      setRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? updated : r)));
      setRoleDraftKeys([...updated.permission_keys]);
      toast.success('Role permissions saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingRoleId(null);
    }
  }, [selectedRole, managed, roleDraftKeys]);

  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const visibleAssignState = useMemo(() => {
    if (!selectedRole || catalog.length === 0) {
      return { checked: false, indeterminate: false };
    }
    const keys = catalog.map((r) => r.key);
    const n = keys.filter((k) => roleDraftKeys.includes(k)).length;
    return {
      checked: n === keys.length && keys.length > 0,
      indeterminate: n > 0 && n < keys.length,
    };
  }, [selectedRole, catalog, roleDraftKeys]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) {
      el.indeterminate = visibleAssignState.indeterminate;
    }
  }, [visibleAssignState]);

  const submitAddRole = useCallback(async () => {
    const name = addName.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    if (!(await canLeaveRoleSelection())) return;
    setAddSubmitting(true);
    try {
      const created = await createSecurityRole({
        name,
        description: addDescription.trim() || null,
      });
      setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedRoleId(created.id);
      setRoleDraftKeys([...created.permission_keys]);
      setShowAddModal(false);
      setAddName('');
      setAddDescription('');
      toast.success('Role created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setAddSubmitting(false);
    }
  }, [addName, addDescription, canLeaveRoleSelection]);

  const confirmDeleteRole = useCallback(async (role: SecurityRoleOut) => {
    if (role.is_system_role) return;
    if (
      !(await confirm({
        title: 'Delete role',
        message: `Delete role "${role.name}"? This removes its permissions. Users linked only to this role may lose access.`,
        confirmLabel: 'Delete',
        danger: true,
      }))
    ) {
      return;
    }
    setDeletingId(role.id);
    try {
      await deleteSecurityRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (selectedRoleId === role.id) {
        setSelectedRoleId(null);
        setRoleDraftKeys([]);
      }
      toast.success('Role deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }, [confirm, selectedRoleId]);

  return {
    catalog,
    catalogKeys,
    permTotal,
    permPage,
    setPermPage,
    permPageSize,
    setPermPageSize,
    operationKeyHints,
    onboardingDismissed,
    bulkAddingHints,
    addingHintKey,
    roles,
    managed,
    loading,
    selectedRoleId,
    savingRoleId,
    showAddModal,
    setShowAddModal,
    addName,
    setAddName,
    addDescription,
    setAddDescription,
    addSubmitting,
    deletingId,
    detailEntry,
    setDetailEntry,
    showEditPermModal,
    setShowEditPermModal,
    editPermLabel,
    setEditPermLabel,
    editPermDesc,
    setEditPermDesc,
    editPermFe,
    setEditPermFe,
    editPermBe,
    setEditPermBe,
    editPermSubmitting,
    editingPermissionId,
    setEditingPermissionId,
    showRefModal,
    setShowRefModal,
    refLoading,
    refData,
    refTab,
    setRefTab,
    refSearch,
    setRefSearch,
    showAddPermModal,
    setShowAddPermModal,
    permKey,
    setPermKey,
    permLabel,
    setPermLabel,
    permDesc,
    setPermDesc,
    permFe,
    setPermFe,
    permBe,
    setPermBe,
    permSubmitting,
    permSearch,
    setPermSearch,
    activeCategory,
    setActiveCategory,
    roleDraftKeys,
    selectedRole,
    catalogEditable,
    isDraftDirty,
    trySetSelectedRoleId,
    openReference,
    dismissOnboarding,
    missingOperationKeyHints,
    hintCategoryByKey,
    permissionCategories,
    addSuggestedPermission,
    addAllMissingSuggestedKeys,
    openEditPermission,
    submitEditPermission,
    confirmDeletePermission,
    copyText,
    submitAddPermission,
    filteredFrontendRef,
    filteredApiRef,
    filteredOperationKeyHints,
    toggleDraftPerm,
    toggleAllVisibleInDraft,
    resetRoleDraft,
    saveRoleDraft,
    selectAllCheckboxRef,
    visibleAssignState,
    submitAddRole,
    confirmDeleteRole,
  };
}
