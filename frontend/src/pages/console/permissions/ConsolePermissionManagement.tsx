import { Navigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
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
import { useAuth } from '../../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_PERMISSIONS } from '../../../config/permissions';
import '../../ontology/ontology-admin.scss';
import {
  Pagination,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../../styles/design-system/index';
import { useConsolePermissionManagement } from './useConsolePermissionManagement';
import { ConsolePermissionManagementModals } from './ConsolePermissionManagement.modals.tsx';
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
  const { t } = useTranslation('console');
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
          <h1>{t('permissions.pageTitle')}</h1>
          <p className="page-subtitle">
            <Trans t={t} i18nKey="permissions.pageHint" components={{ code: <code /> }} />
          </p>
        </div>
      </div>
      {!managed ? (
        <div className="console-perm-notice" role="status">
          {t('permissions.notAvailable')}
        </div>
      ) : (
        <>
          {!onboardingDismissed ? (
            <section className="console-perm-onboarding" aria-label={t('permissions.onboardingTitle')}>
              <div className="console-perm-onboarding-head">
                <h2 className="console-perm-onboarding-title">{t('permissions.onboardingTitle')}</h2>
                <button type="button" className="console-perm-onboarding-dismiss" onClick={dismissOnboarding}>
                  {t('permissions.dismiss')}
                </button>
              </div>
              <ol className="console-perm-onboarding-steps">
                <li>
                  <Trans t={t} i18nKey="permissions.step1" components={{ bold: <strong /> }} />
                </li>
                <li>
                  <Trans t={t} i18nKey="permissions.step2" components={{ bold: <strong /> }} />
                </li>
                <li>
                  <Trans t={t} i18nKey="permissions.step3" components={{ bold: <strong /> }} />
                </li>
                <li>
                  <Trans t={t} i18nKey="permissions.step4" components={{ bold: <strong />, code: <code /> }} />
                </li>
              </ol>
              {missingOperationKeyHints.length > 0 ? (
                <div className="console-perm-onboarding-missing">
                  <p className="console-perm-onboarding-missing-intro">
                    {t('permissions.missingKeys', { count: missingOperationKeyHints.length })}
                  </p>
                  <div className="console-perm-onboarding-actions">
                    <button
                      type="button"
                      className="console-perm-onboarding-bulk"
                      disabled={bulkAddingHints}
                      onClick={() => void addAllMissingSuggestedKeys()}
                    >
                      {bulkAddingHints
                        ? t('permissions.adding')
                        : t('permissions.addAllSuggested', { count: missingOperationKeyHints.length })}
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
                          {addingHintKey === h.key ? '…' : t('permissions.add')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : operationKeyHints.length > 0 ? (
                <p className="console-perm-muted console-perm-onboarding-done">
                  {t('permissions.allKeysPresent')}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="console-perm-main">
            <div className="console-perm-categories" aria-label={t('permissions.rolesAria')}>
              <div className="console-perm-categories-header">
                <h3>{t('permissions.rolesTitle')}</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)}>
                  <Plus size={14} />
                  {t('permissions.add')}
                </button>
              </div>
              <div className="console-perm-category-list-scroll">
                <ul className="console-perm-category-list">
                  <li
                    className={`console-perm-category-item ${selectedRoleId === null ? 'active' : ''}`}
                    onClick={() => void trySetSelectedRoleId(null)}
                  >
                    <LayoutGrid size={16} />
                    <span>{t('permissions.all')}</span>
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
                            title={t('permissions.deleteRoleTitle')}
                            disabled={deletingId === r.id}
                            onClick={() => void confirmDeleteRole(r)}
                            aria-label={t('permissions.deleteRoleAria', { name: r.name })}
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
                <p className="console-perm-roles-sidebar-hint console-perm-muted">{t('permissions.noRoles')}</p>
              ) : null}
            </div>

            <div className="console-perm-content">
              <div className="console-perm-toolbar">
                <div className="console-perm-toolbar-row">
                  <div className="console-perm-search">
                    <Search size={18} />
                    <input
                      type="search"
                      aria-label={t('permissions.searchAria')}
                      placeholder={t('permissions.searchPlaceholder')}
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
                      {t('permissions.all')}
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
                      {t('permissions.reference')}
                    </button>
                    <button type="button" className="btn btn-primary console-perm-toolbar-add" onClick={() => setShowAddPermModal(true)}>
                      <Plus size={18} />
                      <span>{t('permissions.addPermission')}</span>
                    </button>
                  </div>
                </div>
                {selectedRole ? (
                  <p className="console-perm-assign-hint">
                    <Trans
                      t={t}
                      i18nKey="permissions.assignHint"
                      components={{ bold: <strong /> }}
                      values={{ role: selectedRole.name, save: t('permissions.saveRole') }}
                    />
                    {selectedRole.description ? (
                      <>
                        {' '}
                        <span className="console-perm-muted">— {selectedRole.description}</span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="console-perm-assign-hint console-perm-assign-hint--muted">
                    <Trans t={t} i18nKey="permissions.assignHintAll" components={{ bold: <strong /> }} />
                  </p>
                )}
                {selectedRole ? (
                  <div className="console-perm-draft-bar">
                    {isDraftDirty ? (
                      <span className="console-perm-draft-bar-status">{t('permissions.unsaved')}</span>
                    ) : (
                      <span className="console-perm-draft-bar-status console-perm-draft-bar-status--saved">
                        {t('permissions.inSync')}
                      </span>
                    )}
                    <div className="console-perm-draft-bar-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!isDraftDirty || savingRoleId === selectedRole.id}
                        onClick={resetRoleDraft}
                      >
                        {t('permissions.reset')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!isDraftDirty || savingRoleId === selectedRole.id}
                        onClick={() => void saveRoleDraft()}
                      >
                        {savingRoleId === selectedRole.id ? t('permissions.saving') : t('permissions.saveRole')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="ds-table-wrap">
                {loading ? (
                  <div className="console-perm-loading">
                    <Loader2 size={32} className="console-perm-loading-spinner" />
                    <p>{t('permissions.loading')}</p>
                  </div>
                ) : permTotal === 0 && !permSearch.trim() && !activeCategory ? (
                  <p className="console-perm-table-empty">{t('permissions.emptyCatalog')}</p>
                ) : (
                  <table className="console-perm-table">
                    <thead>
                      <tr>
                        <th
                          className="console-perm-table-assign-col"
                          title={t('permissions.selectAllTitle')}
                        >
                          <label className="console-perm-select-all-label">
                            <span className="sr-only">{t('permissions.selectAllAria')}</span>
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
                        <th>{t('permissions.colPermission')}</th>
                        <th>{t('permissions.colCategory')}</th>
                        <th>{t('permissions.colPatterns')}</th>
                        <TableRowActionCell as="th">{t('permissions.colActions')}</TableRowActionCell>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="console-perm-table-empty-cell">
                            {t('permissions.noMatch')}
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
                          if (nFe) patternParts.push(t('permissions.routeCount', { count: nFe }));
                          if (nBe) patternParts.push(t('permissions.apiCount', { count: nBe }));
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
                                        ? t(on ? 'permissions.unassignAria' : 'permissions.assignAria', {
                                            key: row.key,
                                            role: selectedRole.name,
                                          })
                                        : t('permissions.assignAriaNoRole', { key: row.key })
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
                              <TableRowActionCell>
                                <TableRowActions>
                                  <TableRowActionButton
                                    title={t('permissions.details')}
                                    aria-label={t('permissions.detailsAria', { key: row.key })}
                                    icon={<FileText size={16} aria-hidden />}
                                    onClick={() => setDetailEntry(row)}
                                  />
                                  {catalogEditable && row.key !== PERM_ALL ? (
                                    <TableRowActionButton
                                      title={t('shared.edit')}
                                      aria-label={t('permissions.editAria', { key: row.key })}
                                      icon={<Pencil size={16} aria-hidden />}
                                      onClick={() => openEditPermission(row)}
                                    />
                                  ) : null}
                                  {catalogEditable && row.key !== PERM_ALL ? (
                                    <TableRowActionButton
                                      title={t('shared.delete')}
                                      aria-label={t('permissions.deleteAria', { key: row.key })}
                                      icon={<Trash2 size={16} aria-hidden />}
                                      variant="danger"
                                      onClick={() => void confirmDeletePermission(row)}
                                    />
                                  ) : null}
                                </TableRowActions>
                              </TableRowActionCell>
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
