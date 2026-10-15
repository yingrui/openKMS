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
import { useAuth } from '../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_PERMISSIONS } from '../../config/permissions';
import '../ontology/ontology-admin.scss';
import { Pagination } from '../../styles/design-system';
import { useConsolePermissionManagement } from './useConsolePermissionManagement';
import { ConsolePermissionManagementModals } from './ConsolePermissionManagement.modals';
import './ConsolePermissionManagement.scss';

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
  const {
    catalog, permTotal, permPage, setPermPage, permPageSize, setPermPageSize, operationKeyHints,
    onboardingDismissed, bulkAddingHints, addingHintKey, roles, managed, loading, selectedRoleId,
    savingRoleId, showAddModal, setShowAddModal, addName, setAddName, addDescription, setAddDescription,
    addSubmitting, deletingId, detailEntry, setDetailEntry, showEditPermModal, setShowEditPermModal,
    editPermLabel, setEditPermLabel, editPermDesc, setEditPermDesc, editPermFe, setEditPermFe,
    editPermBe, setEditPermBe, editPermSubmitting, editingPermissionId, setEditingPermissionId,
    showRefModal, setShowRefModal, refLoading, refData, refTab, setRefTab, refSearch, setRefSearch,
    showAddPermModal, setShowAddPermModal, permKey, setPermKey, permLabel, setPermLabel, permDesc,
    setPermDesc, permFe, setPermFe, permBe, setPermBe, permSubmitting, permSearch, setPermSearch,
    activeCategory, setActiveCategory, roleDraftKeys, selectedRole, catalogEditable, isDraftDirty,
    trySetSelectedRoleId, openReference, dismissOnboarding, missingOperationKeyHints, hintCategoryByKey,
    permissionCategories, addSuggestedPermission, addAllMissingSuggestedKeys, openEditPermission,
    submitEditPermission, confirmDeletePermission, copyText, submitAddPermission, filteredFrontendRef,
    filteredApiRef, filteredOperationKeyHints, toggleDraftPerm, toggleAllVisibleInDraft, resetRoleDraft,
    saveRoleDraft, selectAllCheckboxRef, visibleAssignState, submitAddRole, confirmDeleteRole,
  } = useConsolePermissionManagement();

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
              <div className="console-perm-category-list-scroll">
                <ul className="console-perm-category-list">
                  <li
                    className={`console-perm-category-item ${selectedRoleId === null ? 'active' : ''}`}
                    onClick={() => void trySetSelectedRoleId(null)}
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
                      onClick={() => void trySetSelectedRoleId(r.id)}
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
              </div>
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

              <div className="ds-table-wrap">
                {loading ? (
                  <div className="console-perm-loading">
                    <Loader2 size={32} className="console-perm-loading-spinner" />
                    <p>Loading permissions…</p>
                  </div>
                ) : permTotal === 0 && !permSearch.trim() && !activeCategory ? (
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
                                catalog.length === 0
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
                      {catalog.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="console-perm-table-empty-cell">
                            No permissions match your search or filter.
                          </td>
                        </tr>
                      ) : (
                        catalog.map((row) => {
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
                <Pagination
                  total={permTotal}
                  page={permPage}
                  pageSize={permPageSize}
                  loading={loading}
                  onPageChange={setPermPage}
                  onPageSizeChange={(size) => {
                    setPermPageSize(size);
                    setPermPage(0);
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <ConsolePermissionManagementModals
        catalog={catalog}
        catalogEditable={catalogEditable}
        detailEntry={detailEntry}
        onCloseDetail={() => setDetailEntry(null)}
        onEditPermission={openEditPermission}
        onDeletePermission={(row) => void confirmDeletePermission(row)}
        showEditPermModal={showEditPermModal}
        editingPermissionId={editingPermissionId}
        editPermLabel={editPermLabel}
        editPermDesc={editPermDesc}
        editPermFe={editPermFe}
        editPermBe={editPermBe}
        editPermSubmitting={editPermSubmitting}
        onEditPermLabelChange={setEditPermLabel}
        onEditPermDescChange={setEditPermDesc}
        onEditPermFeChange={setEditPermFe}
        onEditPermBeChange={setEditPermBe}
        onCloseEditPerm={() => {
          setShowEditPermModal(false);
          setEditingPermissionId(null);
        }}
        onSubmitEditPerm={() => void submitEditPermission()}
        showRefModal={showRefModal}
        refLoading={refLoading}
        refData={refData}
        refTab={refTab}
        refSearch={refSearch}
        operationKeyHints={operationKeyHints}
        filteredFrontendRef={filteredFrontendRef}
        filteredApiRef={filteredApiRef}
        filteredOperationKeyHints={filteredOperationKeyHints}
        onRefTabChange={setRefTab}
        onRefSearchChange={setRefSearch}
        onCloseRef={() => setShowRefModal(false)}
        onCopyText={(text) => void copyText(text)}
        showAddPermModal={showAddPermModal}
        permKey={permKey}
        permLabel={permLabel}
        permDesc={permDesc}
        permFe={permFe}
        permBe={permBe}
        permSubmitting={permSubmitting}
        onPermKeyChange={setPermKey}
        onPermLabelChange={setPermLabel}
        onPermDescChange={setPermDesc}
        onPermFeChange={setPermFe}
        onPermBeChange={setPermBe}
        onCloseAddPerm={() => setShowAddPermModal(false)}
        onSubmitAddPerm={() => void submitAddPermission()}
        showAddModal={showAddModal}
        addName={addName}
        addDescription={addDescription}
        addSubmitting={addSubmitting}
        onAddNameChange={setAddName}
        onAddDescriptionChange={setAddDescription}
        onCloseAddRole={() => setShowAddModal(false)}
        onSubmitAddRole={() => void submitAddRole()}
      />
    </div>
  );
}
