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
  const v = useConsolePermissionManagement();

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
      {!v.managed ? (
        <div className="console-perm-notice" role="status">
          Role permissions are not available for this auth mode.
        </div>
      ) : (
        <>
          {!v.onboardingDismissed ? (
            <section className="console-perm-onboarding" aria-label="Getting started">
              <div className="console-perm-onboarding-head">
                <h2 className="console-perm-onboarding-title">Getting started</h2>
                <button type="button" className="console-perm-onboarding-dismiss" onClick={v.dismissOnboarding}>
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
              {v.missingOperationKeyHints.length > 0 ? (
                <div className="console-perm-onboarding-missing">
                  <p className="console-perm-onboarding-missing-intro">
                    <strong>{v.missingOperationKeyHints.length}</strong> built-in operation key
                    {v.missingOperationKeyHints.length === 1 ? '' : 's'} not in the catalog yet.
                  </p>
                  <div className="console-perm-onboarding-actions">
                    <button
                      type="button"
                      className="console-perm-onboarding-bulk"
                      disabled={v.bulkAddingHints}
                      onClick={() => void v.addAllMissingSuggestedKeys()}
                    >
                      {v.bulkAddingHints ? 'Adding…' : `Add all ${v.missingOperationKeyHints.length} suggested keys`}
                    </button>
                  </div>
                  <ul className="console-perm-onboarding-hint-list">
                    {v.missingOperationKeyHints.map((h) => (
                      <li key={h.key}>
                        <code>{h.key}</code>
                        <span className="console-perm-onboarding-hint-label">{h.label}</span>
                        <button
                          type="button"
                          className="console-perm-onboarding-add-one"
                          disabled={v.addingHintKey === h.key || v.bulkAddingHints}
                          onClick={() => void v.addSuggestedPermission(h)}
                        >
                          {v.addingHintKey === h.key ? '…' : 'Add'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : v.operationKeyHints.length > 0 ? (
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => v.setShowAddModal(true)}>
                  <Plus size={14} />
                  Add
                </button>
              </div>
              <div className="console-perm-category-list-scroll">
                <ul className="console-perm-category-list">
                  <li
                    className={`console-perm-category-item ${v.selectedRoleId === null ? 'active' : ''}`}
                    onClick={() => void v.trySetSelectedRoleId(null)}
                  >
                    <LayoutGrid size={16} />
                    <span>All</span>
                  </li>
                  {v.roles.map((r) => (
                    <li
                      key={r.id}
                      className={`console-perm-category-item console-perm-role-sidebar-item ${
                        v.selectedRoleId === r.id ? 'active' : ''
                      }`}
                      onClick={() => void v.trySetSelectedRoleId(r.id)}
                    >
                      <Shield size={16} />
                      <span className="console-perm-role-sidebar-name">{r.name}</span>
                      <span className="console-perm-role-sidebar-count">({r.permission_keys.length})</span>
                      {!r.is_system_role ? (
                        <div className="console-perm-role-sidebar-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Delete role"
                            disabled={v.deletingId === r.id}
                            onClick={() => void v.confirmDeleteRole(r)}
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
              {v.roles.length === 0 ? (
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
                      value={v.permSearch}
                      onChange={(e) => v.setPermSearch(e.target.value)}
                    />
                  </div>
                  <div className="console-perm-category-filters">
                    <button
                      type="button"
                      className={`console-perm-filter-btn ${v.activeCategory === null ? 'active' : ''}`}
                      onClick={() => v.setActiveCategory(null)}
                    >
                      All
                    </button>
                    {v.permissionCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`console-perm-filter-btn ${v.activeCategory === cat ? 'active' : ''}`}
                        onClick={() => v.setActiveCategory(cat)}
                      >
                        {formatCategoryLabel(cat)}
                      </button>
                    ))}
                  </div>
                  <div className="console-perm-toolbar-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => void v.openReference()}>
                      Route &amp; API reference
                    </button>
                    <button type="button" className="btn btn-primary console-perm-toolbar-add" onClick={() => v.setShowAddPermModal(true)}>
                      <Plus size={18} />
                      <span>Add permission</span>
                    </button>
                  </div>
                </div>
                {v.selectedRole ? (
                  <p className="console-perm-assign-hint">
                    Editing assignments for <strong>{v.selectedRole.name}</strong>
                    {v.selectedRole.description ? (
                      <>
                        {' '}
                        <span className="console-perm-muted">— {v.selectedRole.description}</span>
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
                {v.selectedRole ? (
                  <div className="console-perm-draft-bar">
                    {v.isDraftDirty ? (
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
                        disabled={!v.isDraftDirty || v.savingRoleId === v.selectedRole.id}
                        onClick={v.resetRoleDraft}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!v.isDraftDirty || v.savingRoleId === v.selectedRole.id}
                        onClick={() => void v.saveRoleDraft()}
                      >
                        {v.savingRoleId === v.selectedRole.id ? 'Saving…' : 'Save role permissions'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="ds-table-wrap">
                {v.loading ? (
                  <div className="console-perm-loading">
                    <Loader2 size={32} className="console-perm-loading-spinner" />
                    <p>Loading permissions…</p>
                  </div>
                ) : v.permTotal === 0 && !v.permSearch.trim() && !v.activeCategory ? (
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
                              ref={v.selectAllCheckboxRef}
                              type="checkbox"
                              disabled={
                                !v.selectedRole ||
                                (v.selectedRole ? v.savingRoleId === v.selectedRole.id : false) ||
                                v.catalog.length === 0
                              }
                              checked={v.visibleAssignState.checked}
                              onChange={() => v.toggleAllVisibleInDraft()}
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
                      {v.catalog.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="console-perm-table-empty-cell">
                            No permissions match your search or filter.
                          </td>
                        </tr>
                      ) : (
                        v.catalog.map((row) => {
                          const cat = v.hintCategoryByKey.get(row.key) ?? inferPermissionCategory(row.key);
                          const canAssign = !!v.selectedRole;
                          const on = v.selectedRole ? v.roleDraftKeys.includes(row.key) : false;
                          const busy = v.selectedRole ? v.savingRoleId === v.selectedRole.id : false;
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
                                    onChange={() => v.toggleDraftPerm(row.key)}
                                    aria-label={
                                      v.selectedRole
                                        ? `${on ? 'Remove' : 'Assign'} ${row.key} for role ${v.selectedRole.name}`
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
                                    onClick={() => v.setDetailEntry(row)}
                                    aria-label={`Details for ${row.key}`}
                                  >
                                    <FileText size={15} />
                                  </button>
                                  {v.catalogEditable && row.key !== PERM_ALL ? (
                                    <button
                                      type="button"
                                      title="Edit"
                                      onClick={() => v.openEditPermission(row)}
                                      aria-label={`Edit ${row.key}`}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                  ) : null}
                                  {v.catalogEditable && row.key !== PERM_ALL ? (
                                    <button
                                      type="button"
                                      title="Delete"
                                      onClick={() => void v.confirmDeletePermission(row)}
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
                  total={v.permTotal}
                  page={v.permPage}
                  pageSize={v.permPageSize}
                  loading={v.loading}
                  onPageChange={v.setPermPage}
                  onPageSizeChange={(size) => {
                    v.setPermPageSize(size);
                    v.setPermPage(0);
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <ConsolePermissionManagementModals
        catalog={v.catalog}
        catalogEditable={v.catalogEditable}
        detailEntry={v.detailEntry}
        onCloseDetail={() => v.setDetailEntry(null)}
        onEditPermission={v.openEditPermission}
        onDeletePermission={(row) => void v.confirmDeletePermission(row)}
        showEditPermModal={v.showEditPermModal}
        editingPermissionId={v.editingPermissionId}
        editPermLabel={v.editPermLabel}
        editPermDesc={v.editPermDesc}
        editPermFe={v.editPermFe}
        editPermBe={v.editPermBe}
        editPermSubmitting={v.editPermSubmitting}
        onEditPermLabelChange={v.setEditPermLabel}
        onEditPermDescChange={v.setEditPermDesc}
        onEditPermFeChange={v.setEditPermFe}
        onEditPermBeChange={v.setEditPermBe}
        onCloseEditPerm={() => {
          v.setShowEditPermModal(false);
          v.setEditingPermissionId(null);
        }}
        onSubmitEditPerm={() => void v.submitEditPermission()}
        showRefModal={v.showRefModal}
        refLoading={v.refLoading}
        refData={v.refData}
        refTab={v.refTab}
        refSearch={v.refSearch}
        operationKeyHints={v.operationKeyHints}
        filteredFrontendRef={v.filteredFrontendRef}
        filteredApiRef={v.filteredApiRef}
        filteredOperationKeyHints={v.filteredOperationKeyHints}
        onRefTabChange={v.setRefTab}
        onRefSearchChange={v.setRefSearch}
        onCloseRef={() => v.setShowRefModal(false)}
        onCopyText={(text) => void v.copyText(text)}
        showAddPermModal={v.showAddPermModal}
        permKey={v.permKey}
        permLabel={v.permLabel}
        permDesc={v.permDesc}
        permFe={v.permFe}
        permBe={v.permBe}
        permSubmitting={v.permSubmitting}
        onPermKeyChange={v.setPermKey}
        onPermLabelChange={v.setPermLabel}
        onPermDescChange={v.setPermDesc}
        onPermFeChange={v.setPermFe}
        onPermBeChange={v.setPermBe}
        onCloseAddPerm={() => v.setShowAddPermModal(false)}
        onSubmitAddPerm={() => void v.submitAddPermission()}
        showAddModal={v.showAddModal}
        addName={v.addName}
        addDescription={v.addDescription}
        addSubmitting={v.addSubmitting}
        onAddNameChange={v.setAddName}
        onAddDescriptionChange={v.setAddDescription}
        onCloseAddRole={() => v.setShowAddModal(false)}
        onSubmitAddRole={() => void v.submitAddRole()}
      />
    </div>
  );
}
