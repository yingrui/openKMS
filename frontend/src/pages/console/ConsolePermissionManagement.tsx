import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  FileText,
  KeyRound,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_PERMISSIONS } from '../../config/permissions';
import {
  createSecurityPermission,
  createSecurityRole,
  deleteSecurityPermission,
  deleteSecurityRole,
  fetchPermissionReference,
  fetchSecurityPermissions,
  fetchSecurityRolesPage,
  patchSecurityPermission,
  putRolePermissions,
  type OperationKeyHintRef,
  type PermissionReferenceResponse,
  type SecurityPermissionRowOut,
  type SecurityRoleOut,
} from '../../data/securityAdminApi';
import './ConsoleObjectTypes.css';
import './ConsolePermissionManagement.css';

const ONBOARDING_DISMISSED_KEY = 'openkms_permissions_onboarding_dismissed';

function inferPermissionCategory(key: string): string {
  if (key === PERM_ALL) return 'admin';
  const i = key.indexOf(':');
  return i > 0 ? key.slice(0, i) : 'other';
}

function formatCategoryLabel(id: string): string {
  if (!id) return id;
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function ConsolePermissionManagement() {
  const { hasPermission } = useAuth();
  const [catalog, setCatalog] = useState<SecurityPermissionRowOut[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [perms, page, ref] = await Promise.all([
        fetchSecurityPermissions(),
        fetchSecurityRolesPage(),
        fetchPermissionReference(),
      ]);
      setCatalog(perms);
      setRoles(page.roles);
      setManaged(page.managed_in_console);
      setOperationKeyHints(Array.isArray(ref.operation_key_hints) ? ref.operation_key_hints : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const canLeaveRoleSelection = useCallback(() => {
    if (!selectedRoleId || !selectedRole) return true;
    const a = [...selectedRole.permission_keys].sort().join('\0');
    const b = [...roleDraftKeys].sort().join('\0');
    if (a === b) return true;
    return window.confirm('Discard unsaved permission changes for this role?');
  }, [selectedRoleId, selectedRole, roleDraftKeys]);

  const trySetSelectedRoleId = useCallback(
    (nextId: string | null) => {
      if (nextId === selectedRoleId) return;
      if (!canLeaveRoleSelection()) return;
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

  const linesToPatterns = (s: string) =>
    s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

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
    const keys = new Set(catalog.map((c) => c.key));
    return operationKeyHints.filter((h) => !keys.has(h.key));
  }, [catalog, operationKeyHints]);

  const hintCategoryByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of operationKeyHints) {
      m.set(h.key, h.category);
    }
    return m;
  }, [operationKeyHints]);

  const permissionCategories = useMemo(() => {
    const s = new Set<string>();
    for (const row of catalog) {
      s.add(hintCategoryByKey.get(row.key) ?? inferPermissionCategory(row.key));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [catalog, hintCategoryByKey]);

  const filteredCatalog = useMemo(() => {
    let rows = catalog;
    if (activeCategory) {
      rows = rows.filter(
        (r) => (hintCategoryByKey.get(r.key) ?? inferPermissionCategory(r.key)) === activeCategory
      );
    }
    const q = permSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.key.toLowerCase().includes(q) ||
          r.label.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [catalog, activeCategory, permSearch, hintCategoryByKey]);

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
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to add');
      } finally {
        setAddingHintKey(null);
      }
    },
    [load]
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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk add failed');
    } finally {
      setBulkAddingHints(false);
    }
  }, [missingOperationKeyHints, load]);

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

  const submitEditPermission = async () => {
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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setEditPermSubmitting(false);
    }
  };

  const confirmDeletePermission = async (row: SecurityPermissionRowOut) => {
    if (row.key === PERM_ALL) return;
    if (
      !window.confirm(
        `Delete permission "${row.key}"? Roles must not reference it; any assignment will block deletion.`
      )
    ) {
      return;
    }
    try {
      await deleteSecurityPermission(row.id);
      setDetailEntry(null);
      toast.success('Permission deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const submitAddPermission = async () => {
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
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setPermSubmitting(false);
    }
  };

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
    if (!selectedRole || filteredCatalog.length === 0) return;
    const visibleKeys = filteredCatalog.map((r) => r.key);
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
  }, [selectedRole, filteredCatalog]);

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
    if (!selectedRole || filteredCatalog.length === 0) {
      return { checked: false, indeterminate: false };
    }
    const keys = filteredCatalog.map((r) => r.key);
    const n = keys.filter((k) => roleDraftKeys.includes(k)).length;
    return {
      checked: n === keys.length && keys.length > 0,
      indeterminate: n > 0 && n < keys.length,
    };
  }, [selectedRole, filteredCatalog, roleDraftKeys]);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) {
      el.indeterminate = visibleAssignState.indeterminate;
    }
  }, [visibleAssignState]);

  const submitAddRole = async () => {
    const name = addName.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    if (!canLeaveRoleSelection()) return;
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
  };

  const confirmDeleteRole = async (role: SecurityRoleOut) => {
    if (role.is_system_role) return;
    if (
      !window.confirm(
        `Delete role "${role.name}"? This removes its permissions. Users linked only to this role may lose access.`
      )
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
  };

  if (!hasPermission(PERM_CONSOLE_PERMISSIONS)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <div className="console-perm-page">
      <div className="page-header console-perm-header">
        <div>
          <h1>Permissions</h1>
          <p className="page-subtitle">
            Manage the operation-key catalog and assign keys per role. With OIDC, IdP realm role names must match{' '}
            <code>security_roles.name</code>. The database seeds only <code>all</code>; use Route &amp; API reference for
            path patterns.
          </p>
        </div>
      </div>
      {!managed ? (
        <div className="console-perm-notice" role="status">
          Role permissions are not available for this auth mode.
        </div>
      ) : (
        <>
          {!onboardingDismissed ? (
            <section className="console-perm-onboarding" aria-label="Getting started">
              <div className="console-perm-onboarding-head">
                <h2 className="console-perm-onboarding-title">Getting started</h2>
                <button type="button" className="console-perm-onboarding-dismiss" onClick={dismissOnboarding}>
                  Dismiss
                </button>
              </div>
              <ol className="console-perm-onboarding-steps">
                <li>
                  Review <strong>operation keys</strong> the app understands (see suggested keys below or the{' '}
                  <strong>Operation keys</strong> tab in Route &amp; API reference).
                </li>
                <li>
                  <strong>Add catalog rows</strong> for each key you need (or use &quot;Add all suggested keys&quot;),
                  then fill route/API patterns using <strong>Route &amp; API reference</strong>.
                </li>
                <li>
                  <strong>Create roles</strong>, select one under <strong>Roles</strong>, adjust checkboxes, then{' '}
                  <strong>Save role permissions</strong> to persist assignments. Use <strong>All</strong> to edit the
                  catalog (add/edit/delete rows).
                </li>
                <li>
                  <strong>OIDC:</strong> each IdP realm role name must match a <code>security_roles.name</code> row
                  exactly.
                </li>
              </ol>
              {missingOperationKeyHints.length > 0 ? (
                <div className="console-perm-onboarding-missing">
                  <p className="console-perm-onboarding-missing-intro">
                    <strong>{missingOperationKeyHints.length}</strong> built-in operation key
                    {missingOperationKeyHints.length === 1 ? '' : 's'} not in the catalog yet.
                  </p>
                  <div className="console-perm-onboarding-actions">
                    <button
                      type="button"
                      className="console-perm-onboarding-bulk"
                      disabled={bulkAddingHints}
                      onClick={() => void addAllMissingSuggestedKeys()}
                    >
                      {bulkAddingHints ? 'Adding…' : `Add all ${missingOperationKeyHints.length} suggested keys`}
                    </button>
                  </div>
                  <ul className="console-perm-onboarding-hint-list">
                    {missingOperationKeyHints.map((h) => (
                      <li key={h.key}>
                        <code>{h.key}</code>
                        <span className="console-perm-onboarding-hint-label">{h.label}</span>
                        <button
                          type="button"
                          className="console-perm-onboarding-add-one"
                          disabled={addingHintKey === h.key || bulkAddingHints}
                          onClick={() => void addSuggestedPermission(h)}
                        >
                          {addingHintKey === h.key ? '…' : 'Add'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : operationKeyHints.length > 0 ? (
                <p className="console-perm-muted console-perm-onboarding-done">
                  All suggested operation keys are already in the catalog.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="console-perm-main">
            <div className="console-perm-categories" aria-label="Security roles">
              <div className="console-perm-categories-header">
                <h3>Roles</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)}>
                  <Plus size={14} />
                  Add
                </button>
              </div>
              <ul className="console-perm-category-list">
                <li
                  className={`console-perm-category-item ${selectedRoleId === null ? 'active' : ''}`}
                  onClick={() => trySetSelectedRoleId(null)}
                >
                  <LayoutGrid size={16} />
                  <span>All</span>
                </li>
                {roles.map((r) => (
                  <li
                    key={r.id}
                    className={`console-perm-category-item console-perm-role-sidebar-item ${
                      selectedRoleId === r.id ? 'active' : ''
                    }`}
                    onClick={() => trySetSelectedRoleId(r.id)}
                  >
                    <Shield size={16} />
                    <span className="console-perm-role-sidebar-name">{r.name}</span>
                    <span className="console-perm-role-sidebar-count">({r.permission_keys.length})</span>
                    {!r.is_system_role ? (
                      <div className="console-perm-role-sidebar-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Delete role"
                          disabled={deletingId === r.id}
                          onClick={() => void confirmDeleteRole(r)}
                          aria-label={`Delete role ${r.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {roles.length === 0 ? (
                <p className="console-perm-roles-sidebar-hint console-perm-muted">No roles yet. Use Add to create one.</p>
              ) : null}
            </div>

            <div className="console-perm-content">
              <div className="console-perm-toolbar">
                <div className="console-perm-toolbar-row">
                  <div className="console-perm-search">
                    <Search size={18} />
                    <input
                      type="search"
                      aria-label="Search permissions"
                      placeholder="Search permissions..."
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                    />
                  </div>
                  <div className="console-perm-category-filters">
                    <button
                      type="button"
                      className={`console-perm-filter-btn ${activeCategory === null ? 'active' : ''}`}
                      onClick={() => setActiveCategory(null)}
                    >
                      All
                    </button>
                    {permissionCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`console-perm-filter-btn ${activeCategory === cat ? 'active' : ''}`}
                        onClick={() => setActiveCategory(cat)}
                      >
                        {formatCategoryLabel(cat)}
                      </button>
                    ))}
                  </div>
                  <div className="console-perm-toolbar-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => void openReference()}>
                      Route &amp; API reference
                    </button>
                    <button type="button" className="btn btn-primary console-perm-toolbar-add" onClick={() => setShowAddPermModal(true)}>
                      <Plus size={18} />
                      <span>Add permission</span>
                    </button>
                  </div>
                </div>
                {selectedRole ? (
                  <p className="console-perm-assign-hint">
                    Editing assignments for <strong>{selectedRole.name}</strong>
                    {selectedRole.description ? (
                      <>
                        {' '}
                        <span className="console-perm-muted">— {selectedRole.description}</span>
                      </>
                    ) : null}
                    . Changes are saved when you click <strong>Save role permissions</strong>.
                  </p>
                ) : (
                  <p className="console-perm-assign-hint console-perm-assign-hint--muted">
                    Choose <strong>All</strong> to manage the permission catalog (edit/delete rows). Select a role to
                    assign keys—use Save when done.
                  </p>
                )}
                {selectedRole ? (
                  <div className="console-perm-draft-bar">
                    {isDraftDirty ? (
                      <span className="console-perm-draft-bar-status">Unsaved changes</span>
                    ) : (
                      <span className="console-perm-draft-bar-status console-perm-draft-bar-status--saved">
                        In sync with server
                      </span>
                    )}
                    <div className="console-perm-draft-bar-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!isDraftDirty || savingRoleId === selectedRole.id}
                        onClick={resetRoleDraft}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!isDraftDirty || savingRoleId === selectedRole.id}
                        onClick={() => void saveRoleDraft()}
                      >
                        {savingRoleId === selectedRole.id ? 'Saving…' : 'Save role permissions'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="console-perm-table-wrap">
                {loading ? (
                  <div className="console-perm-loading">
                    <Loader2 size={32} className="console-perm-loading-spinner" />
                    <p>Loading permissions…</p>
                  </div>
                ) : catalog.length === 0 ? (
                  <p className="console-perm-table-empty">No permission rows yet. Click &quot;Add permission&quot; to create catalog entries.</p>
                ) : (
                  <table className="console-perm-table">
                    <thead>
                      <tr>
                        <th
                          className="console-perm-table-assign-col"
                          title="Select or clear all permissions in the current list for the selected role"
                        >
                          <label className="console-perm-select-all-label">
                            <span className="sr-only">Select or clear all visible permissions for this role</span>
                            <input
                              ref={selectAllCheckboxRef}
                              type="checkbox"
                              disabled={
                                !selectedRole ||
                                (selectedRole ? savingRoleId === selectedRole.id : false) ||
                                filteredCatalog.length === 0
                              }
                              checked={visibleAssignState.checked}
                              onChange={() => toggleAllVisibleInDraft()}
                            />
                          </label>
                        </th>
                        <th>Permission</th>
                        <th>Category</th>
                        <th>Patterns</th>
                        <th className="console-perm-table-actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCatalog.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="console-perm-table-empty-cell">
                            No permissions match your search or filter.
                          </td>
                        </tr>
                      ) : (
                        filteredCatalog.map((row) => {
                          const cat = hintCategoryByKey.get(row.key) ?? inferPermissionCategory(row.key);
                          const canAssign = !!selectedRole;
                          const on = selectedRole ? roleDraftKeys.includes(row.key) : false;
                          const busy = selectedRole ? savingRoleId === selectedRole.id : false;
                          const nFe = row.frontend_route_patterns.length;
                          const nBe = row.backend_api_patterns.length;
                          const patternParts: string[] = [];
                          if (nFe) patternParts.push(`${nFe} route${nFe === 1 ? '' : 's'}`);
                          if (nBe) patternParts.push(`${nBe} API${nBe === 1 ? '' : 's'}`);
                          return (
                            <tr key={row.id}>
                              <td className="console-perm-table-assign-col">
                                {canAssign ? (
                                  <input
                                    type="checkbox"
                                    className="console-perm-row-checkbox"
                                    checked={on}
                                    disabled={busy}
                                    onChange={() => toggleDraftPerm(row.key)}
                                    aria-label={
                                      selectedRole
                                        ? `${on ? 'Remove' : 'Assign'} ${row.key} for role ${selectedRole.name}`
                                        : `Assign ${row.key}`
                                    }
                                  />
                                ) : (
                                  <span className="console-perm-muted">—</span>
                                )}
                              </td>
                              <td>
                                <div className="console-perm-table-name">
                                  <KeyRound size={16} strokeWidth={1.5} />
                                  <div>
                                    <span>{row.label}</span>
                                    <span className="console-perm-table-key">{row.key}</span>
                                  </div>
                                </div>
                              </td>
                              <td>{formatCategoryLabel(cat)}</td>
                              <td className="console-perm-table-patterns">
                                {patternParts.length ? patternParts.join(' · ') : '—'}
                              </td>
                              <td className="console-perm-table-actions-col">
                                <div className="console-perm-table-btns">
                                  <button
                                    type="button"
                                    title="Details"
                                    onClick={() => setDetailEntry(row)}
                                    aria-label={`Details for ${row.key}`}
                                  >
                                    <FileText size={15} />
                                  </button>
                                  {catalogEditable && row.key !== PERM_ALL ? (
                                    <button
                                      type="button"
                                      title="Edit"
                                      onClick={() => openEditPermission(row)}
                                      aria-label={`Edit ${row.key}`}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                  ) : null}
                                  {catalogEditable && row.key !== PERM_ALL ? (
                                    <button
                                      type="button"
                                      title="Delete"
                                      onClick={() => void confirmDeletePermission(row)}
                                      aria-label={`Delete ${row.key}`}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {detailEntry ? (
        <div
          className="console-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setDetailEntry(null)}
        >
          <div
            className="console-modal console-perm-detail-modal"
            role="dialog"
            aria-labelledby="perm-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="console-modal-header">
              <h2 id="perm-detail-title">{detailEntry.label}</h2>
              <button type="button" onClick={() => setDetailEntry(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="console-modal-body console-perm-detail-body">
              <p className="console-perm-detail-key">
                <code>{detailEntry.key}</code>
              </p>
              {detailEntry.key === PERM_ALL ? (
                <p className="console-perm-detail-system-note">This built-in permission cannot be edited or deleted.</p>
              ) : !catalogEditable ? (
                <p className="console-perm-detail-system-note">
                  Select <strong>All</strong> under Roles to edit or delete catalog entries.
                </p>
              ) : null}
              {detailEntry.description ? (
                <p className="console-perm-detail-desc-text">{detailEntry.description}</p>
              ) : (
                <p className="console-perm-muted">No description.</p>
              )}
              <section className="console-perm-detail-section">
                <h3 className="console-perm-detail-section-title">Frontend route patterns</h3>
                {detailEntry.frontend_route_patterns.length ? (
                  <ul className="console-perm-pattern-list">
                    {detailEntry.frontend_route_patterns.map((p, i) => (
                      <li key={`fe-${detailEntry.key}-${i}`}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="console-perm-muted">None listed (see description).</p>
                )}
              </section>
              <section className="console-perm-detail-section">
                <h3 className="console-perm-detail-section-title">Backend API path patterns</h3>
                {detailEntry.backend_api_patterns.length ? (
                  <ul className="console-perm-pattern-list">
                    {detailEntry.backend_api_patterns.map((p, i) => (
                      <li key={`be-${detailEntry.key}-${i}`}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="console-perm-muted">None listed (see description).</p>
                )}
              </section>
            </div>
            <div className="console-modal-actions">
              {catalogEditable && detailEntry.key !== PERM_ALL ? (
                <>
                  <button type="button" onClick={() => openEditPermission(detailEntry)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="console-perm-delete-catalog-btn"
                    onClick={() => void confirmDeletePermission(detailEntry)}
                  >
                    Delete
                  </button>
                </>
              ) : null}
              <button type="button" onClick={() => setDetailEntry(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditPermModal && editingPermissionId ? (
        <div
          className="console-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !editPermSubmitting && setShowEditPermModal(false)}
        >
          <div className="console-modal console-modal--wide" role="dialog" aria-labelledby="edit-perm-title" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2 id="edit-perm-title">Edit permission</h2>
              <button
                type="button"
                disabled={editPermSubmitting}
                onClick={() => {
                  setShowEditPermModal(false);
                  setEditingPermissionId(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-perm-edit-key">
                Key <code>{catalog.find((c) => c.id === editingPermissionId)?.key ?? ''}</code> (read-only)
              </p>
              <label>
                <span>Label</span>
                <input
                  type="text"
                  value={editPermLabel}
                  onChange={(e) => setEditPermLabel(e.target.value)}
                  maxLength={512}
                  autoFocus
                />
              </label>
              <label>
                <span>Description (optional)</span>
                <textarea
                  value={editPermDesc}
                  onChange={(e) => setEditPermDesc(e.target.value)}
                  rows={2}
                  className="console-perm-modal-textarea"
                />
              </label>
              <label>
                <span>Frontend route patterns (one per line)</span>
                <textarea
                  value={editPermFe}
                  onChange={(e) => setEditPermFe(e.target.value)}
                  rows={4}
                  className="console-perm-modal-textarea"
                />
              </label>
              <label>
                <span>Backend API patterns (one per line)</span>
                <textarea
                  value={editPermBe}
                  onChange={(e) => setEditPermBe(e.target.value)}
                  rows={4}
                  className="console-perm-modal-textarea"
                />
              </label>
            </div>
            <div className="console-modal-actions">
              <button
                type="button"
                disabled={editPermSubmitting}
                onClick={() => {
                  setShowEditPermModal(false);
                  setEditingPermissionId(null);
                }}
              >
                Cancel
              </button>
              <button type="button" disabled={editPermSubmitting} onClick={() => void submitEditPermission()}>
                {editPermSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRefModal ? (
        <div
          className="console-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !refLoading && setShowRefModal(false)}
        >
          <div
            className="console-modal console-modal--wide console-perm-ref-modal"
            role="dialog"
            aria-labelledby="perm-ref-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="console-modal-header">
              <h2 id="perm-ref-title">Route &amp; API reference</h2>
              <button
                type="button"
                disabled={refLoading}
                onClick={() => setShowRefModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="console-modal-body console-perm-ref-body">
              {refLoading ? (
                <p className="console-perm-muted">Loading…</p>
              ) : refData ? (
                <>
                  <p className="console-perm-ref-hint">{refData.hint}</p>
                  <div className="console-perm-ref-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={refTab === 'frontend'}
                      className={refTab === 'frontend' ? 'console-perm-ref-tab console-perm-ref-tab--active' : 'console-perm-ref-tab'}
                      onClick={() => setRefTab('frontend')}
                    >
                      Frontend features ({refData.frontend_features.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={refTab === 'api'}
                      className={refTab === 'api' ? 'console-perm-ref-tab console-perm-ref-tab--active' : 'console-perm-ref-tab'}
                      onClick={() => setRefTab('api')}
                    >
                      API operations ({refData.api_operations.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={refTab === 'keys'}
                      className={refTab === 'keys' ? 'console-perm-ref-tab console-perm-ref-tab--active' : 'console-perm-ref-tab'}
                      onClick={() => setRefTab('keys')}
                    >
                      Operation keys ({(refData.operation_key_hints ?? operationKeyHints).length})
                    </button>
                  </div>
                  <label className="console-perm-ref-search">
                    <span className="sr-only">Filter</span>
                    <input
                      type="search"
                      value={refSearch}
                      onChange={(e) => setRefSearch(e.target.value)}
                      placeholder="Filter by path, label, tag…"
                    />
                  </label>
                  <div className="console-perm-ref-scroll" role="tabpanel">
                    {refTab === 'keys' ? (
                      <ul className="console-perm-ref-list">
                        {filteredOperationKeyHints.map((h) => (
                          <li key={h.key}>
                            <button
                              type="button"
                              className="console-perm-ref-row"
                              onClick={() => void copyText(h.key)}
                              title="Click to copy key"
                            >
                              <span className="console-perm-ref-path">
                                <code>{h.key}</code>
                              </span>
                              <span className="console-perm-ref-meta">
                                <span className="console-perm-ref-label">{h.label}</span>
                                <span className="console-perm-ref-section">{h.category}</span>
                                <span className="console-perm-ref-note">{h.description}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : refTab === 'frontend' ? (
                      <ul className="console-perm-ref-list">
                        {filteredFrontendRef.map((r) => (
                          <li key={`${r.section}-${r.path_pattern}-${r.label}`}>
                            <button
                              type="button"
                              className="console-perm-ref-row"
                              onClick={() => void copyText(r.path_pattern)}
                              title="Click to copy path pattern"
                            >
                              <span className="console-perm-ref-path">
                                <code>{r.path_pattern}</code>
                              </span>
                              <span className="console-perm-ref-meta">
                                <span className="console-perm-ref-label">{r.label}</span>
                                <span className="console-perm-ref-section">{r.section}</span>
                                {r.note ? <span className="console-perm-ref-note">{r.note}</span> : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="console-perm-ref-list">
                        {filteredApiRef.map((r, i) => (
                          <li key={`${r.method}-${r.path}-${i}`}>
                            <button
                              type="button"
                              className="console-perm-ref-row"
                              onClick={() => void copyText(`${r.method} ${r.path}`)}
                              title="Click to copy method + path"
                            >
                              <span className="console-perm-ref-path">
                                <code>
                                  {r.method} {r.path}
                                </code>
                              </span>
                              <span className="console-perm-ref-meta">
                                {r.summary ? <span className="console-perm-ref-label">{r.summary}</span> : null}
                                {r.tags.length ? (
                                  <span className="console-perm-ref-tags">{r.tags.join(' · ')}</span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="console-perm-muted">No data.</p>
              )}
            </div>
            <div className="console-modal-actions">
              <button type="button" onClick={() => setShowRefModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddPermModal ? (
        <div
          className="console-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !permSubmitting && setShowAddPermModal(false)}
        >
          <div className="console-modal console-modal--wide" role="dialog" aria-labelledby="add-perm-title" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2 id="add-perm-title">Add permission</h2>
              <button
                type="button"
                disabled={permSubmitting}
                onClick={() => setShowAddPermModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>Key</span>
                <input
                  type="text"
                  value={permKey}
                  onChange={(e) => setPermKey(e.target.value)}
                  maxLength={128}
                  autoFocus
                  placeholder="e.g. console:users"
                />
              </label>
              <label>
                <span>Label</span>
                <input
                  type="text"
                  value={permLabel}
                  onChange={(e) => setPermLabel(e.target.value)}
                  maxLength={512}
                  placeholder="Short display name"
                />
              </label>
              <label>
                <span>Description (optional)</span>
                <textarea
                  value={permDesc}
                  onChange={(e) => setPermDesc(e.target.value)}
                  rows={2}
                  className="console-perm-modal-textarea"
                  placeholder="What this permission covers"
                />
              </label>
              <label>
                <span>Frontend route patterns (one per line)</span>
                <textarea
                  value={permFe}
                  onChange={(e) => setPermFe(e.target.value)}
                  rows={4}
                  className="console-perm-modal-textarea"
                  placeholder={'/console/users\n/console/*'}
                />
              </label>
              <label>
                <span>Backend API patterns (one per line)</span>
                <textarea
                  value={permBe}
                  onChange={(e) => setPermBe(e.target.value)}
                  rows={4}
                  className="console-perm-modal-textarea"
                  placeholder={'/api/admin/users\n/api/admin/users/*'}
                />
              </label>
            </div>
            <div className="console-modal-actions">
              <button type="button" disabled={permSubmitting} onClick={() => setShowAddPermModal(false)}>
                Cancel
              </button>
              <button type="button" disabled={permSubmitting} onClick={() => void submitAddPermission()}>
                {permSubmitting ? 'Saving…' : 'Create permission'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddModal ? (
        <div
          className="console-modal-overlay"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && !addSubmitting && setShowAddModal(false)}
        >
          <div className="console-modal" role="dialog" aria-labelledby="add-role-title" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2 id="add-role-title">Add role</h2>
              <button
                type="button"
                disabled={addSubmitting}
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="console-modal-body">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  maxLength={128}
                  autoFocus
                  placeholder="e.g. content-editor"
                />
              </label>
              <label>
                <span>Description (optional)</span>
                <textarea
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  rows={2}
                  placeholder="Short note for administrators"
                  className="console-perm-modal-textarea"
                />
              </label>
            </div>
            <div className="console-modal-actions">
              <button type="button" disabled={addSubmitting} onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="button" disabled={addSubmitting} onClick={() => void submitAddRole()}>
                {addSubmitting ? 'Creating…' : 'Create role'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
