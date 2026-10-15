import { PERM_ALL } from '../../config/permissions';
import { Dialog, FormField } from '../../styles/design-system';
import type {
  OperationKeyHintRef,
  PermissionReferenceResponse,
  SecurityPermissionRowOut,
} from '../../data/securityAdminApi';

export interface ConsolePermissionManagementModalsProps {
  catalog: SecurityPermissionRowOut[];
  catalogEditable: boolean;

  detailEntry: SecurityPermissionRowOut | null;
  onCloseDetail: () => void;
  onEditPermission: (row: SecurityPermissionRowOut) => void;
  onDeletePermission: (row: SecurityPermissionRowOut) => void;

  showEditPermModal: boolean;
  editingPermissionId: string | null;
  editPermLabel: string;
  editPermDesc: string;
  editPermFe: string;
  editPermBe: string;
  editPermSubmitting: boolean;
  onEditPermLabelChange: (value: string) => void;
  onEditPermDescChange: (value: string) => void;
  onEditPermFeChange: (value: string) => void;
  onEditPermBeChange: (value: string) => void;
  onCloseEditPerm: () => void;
  onSubmitEditPerm: () => void;

  showRefModal: boolean;
  refLoading: boolean;
  refData: PermissionReferenceResponse | null;
  refTab: 'frontend' | 'api' | 'keys';
  refSearch: string;
  operationKeyHints: OperationKeyHintRef[];
  filteredFrontendRef: PermissionReferenceResponse['frontend_features'];
  filteredApiRef: PermissionReferenceResponse['api_operations'];
  filteredOperationKeyHints: OperationKeyHintRef[];
  onRefTabChange: (tab: 'frontend' | 'api' | 'keys') => void;
  onRefSearchChange: (value: string) => void;
  onCloseRef: () => void;
  onCopyText: (text: string) => void;

  showAddPermModal: boolean;
  permKey: string;
  permLabel: string;
  permDesc: string;
  permFe: string;
  permBe: string;
  permSubmitting: boolean;
  onPermKeyChange: (value: string) => void;
  onPermLabelChange: (value: string) => void;
  onPermDescChange: (value: string) => void;
  onPermFeChange: (value: string) => void;
  onPermBeChange: (value: string) => void;
  onCloseAddPerm: () => void;
  onSubmitAddPerm: () => void;

  showAddModal: boolean;
  addName: string;
  addDescription: string;
  addSubmitting: boolean;
  onAddNameChange: (value: string) => void;
  onAddDescriptionChange: (value: string) => void;
  onCloseAddRole: () => void;
  onSubmitAddRole: () => void;
}

export function ConsolePermissionManagementModals({
  catalog,
  catalogEditable,
  detailEntry,
  onCloseDetail,
  onEditPermission,
  onDeletePermission,
  showEditPermModal,
  editingPermissionId,
  editPermLabel,
  editPermDesc,
  editPermFe,
  editPermBe,
  editPermSubmitting,
  onEditPermLabelChange,
  onEditPermDescChange,
  onEditPermFeChange,
  onEditPermBeChange,
  onCloseEditPerm,
  onSubmitEditPerm,
  showRefModal,
  refLoading,
  refData,
  refTab,
  refSearch,
  operationKeyHints,
  filteredFrontendRef,
  filteredApiRef,
  filteredOperationKeyHints,
  onRefTabChange,
  onRefSearchChange,
  onCloseRef,
  onCopyText,
  showAddPermModal,
  permKey,
  permLabel,
  permDesc,
  permFe,
  permBe,
  permSubmitting,
  onPermKeyChange,
  onPermLabelChange,
  onPermDescChange,
  onPermFeChange,
  onPermBeChange,
  onCloseAddPerm,
  onSubmitAddPerm,
  showAddModal,
  addName,
  addDescription,
  addSubmitting,
  onAddNameChange,
  onAddDescriptionChange,
  onCloseAddRole,
  onSubmitAddRole,
}: ConsolePermissionManagementModalsProps) {
  return (
    <>
      {detailEntry ? (
        <Dialog
          open
          onClose={onCloseDetail}
          title={detailEntry.label}
          closeAriaLabel="Close"
          size="md"
          className="console-perm-detail-modal"
          footer={
            <>
              {catalogEditable && detailEntry.key !== PERM_ALL ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onEditPermission(detailEntry)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onDeletePermission(detailEntry)}
                  >
                    Delete
                  </button>
                </>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={onCloseDetail}>
                Close
              </button>
            </>
          }
        >
          <div className="console-perm-detail-body">
            <p className="console-perm-detail-key">
              <code>{detailEntry.key}</code>
            </p>
            {detailEntry.key === PERM_ALL ? (
              <p className="console-perm-detail-system-note">
                This built-in permission cannot be edited or deleted.
              </p>
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
        </Dialog>
      ) : null}

      {showEditPermModal && editingPermissionId ? (
        <Dialog
          open
          onClose={onCloseEditPerm}
          closeDisabled={editPermSubmitting}
          title="Edit permission"
          closeAriaLabel="Close"
          size="lg"
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={editPermSubmitting}
                onClick={onCloseEditPerm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={editPermSubmitting}
                onClick={onSubmitEditPerm}
              >
                {editPermSubmitting ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <p className="console-perm-edit-key">
            Key <code>{catalog.find((c) => c.id === editingPermissionId)?.key ?? ''}</code>{' '}
            (read-only)
          </p>
          <FormField label="Label">
            <input
              type="text"
              value={editPermLabel}
              onChange={(e) => onEditPermLabelChange(e.target.value)}
              maxLength={512}
              autoFocus
            />
          </FormField>
          <FormField label="Description (optional)">
            <textarea
              value={editPermDesc}
              onChange={(e) => onEditPermDescChange(e.target.value)}
              rows={2}
              className="console-perm-modal-textarea"
            />
          </FormField>
          <FormField label="Frontend route patterns (one per line)">
            <textarea
              value={editPermFe}
              onChange={(e) => onEditPermFeChange(e.target.value)}
              rows={4}
              className="console-perm-modal-textarea"
            />
          </FormField>
          <FormField label="Backend API patterns (one per line)">
            <textarea
              value={editPermBe}
              onChange={(e) => onEditPermBeChange(e.target.value)}
              rows={4}
              className="console-perm-modal-textarea"
            />
          </FormField>
        </Dialog>
      ) : null}

      <Dialog
        open={showRefModal}
        onClose={onCloseRef}
        closeDisabled={refLoading}
        title="Route & API reference"
        closeAriaLabel="Close"
        size="lg"
        className="console-perm-ref-modal"
        bodyClassName="console-perm-ref-body"
        footer={
          <button type="button" className="btn btn-secondary" onClick={onCloseRef}>
            Close
          </button>
        }
      >
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
                className={`console-perm-ref-tab${refTab === 'frontend' ? ' console-perm-ref-tab--active' : ''}`}
                onClick={() => onRefTabChange('frontend')}
              >
                Frontend features ({refData.frontend_features.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={refTab === 'api'}
                className={`console-perm-ref-tab${refTab === 'api' ? ' console-perm-ref-tab--active' : ''}`}
                onClick={() => onRefTabChange('api')}
              >
                API operations ({refData.api_operations.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={refTab === 'keys'}
                className={`console-perm-ref-tab${refTab === 'keys' ? ' console-perm-ref-tab--active' : ''}`}
                onClick={() => onRefTabChange('keys')}
              >
                Operation keys ({(refData.operation_key_hints ?? operationKeyHints).length})
              </button>
            </div>
            {/* ds-control-exempt: `.console-perm-ref-search` styles this input */}
            <label className="console-perm-ref-search">
              <span className="sr-only">Filter</span>
              <input
                type="search"
                value={refSearch}
                onChange={(e) => onRefSearchChange(e.target.value)}
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
                        onClick={() => onCopyText(h.key)}
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
                        onClick={() => onCopyText(r.path_pattern)}
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
                        onClick={() => onCopyText(`${r.method} ${r.path}`)}
                        title="Click to copy method + path"
                      >
                        <span className="console-perm-ref-path">
                          <code>
                            {r.method} {r.path}
                          </code>
                        </span>
                        <span className="console-perm-ref-meta">
                          {r.summary ? (
                            <span className="console-perm-ref-label">{r.summary}</span>
                          ) : null}
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
      </Dialog>

      <Dialog
        open={showAddPermModal}
        onClose={onCloseAddPerm}
        closeDisabled={permSubmitting}
        title="Add permission"
        closeAriaLabel="Close"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={permSubmitting}
              onClick={onCloseAddPerm}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={permSubmitting}
              onClick={onSubmitAddPerm}
            >
              {permSubmitting ? 'Saving…' : 'Create permission'}
            </button>
          </>
        }
      >
        <FormField label="Key">
          <input
            type="text"
            value={permKey}
            onChange={(e) => onPermKeyChange(e.target.value)}
            maxLength={128}
            autoFocus
            placeholder="e.g. console:users"
          />
        </FormField>
        <FormField label="Label">
          <input
            type="text"
            value={permLabel}
            onChange={(e) => onPermLabelChange(e.target.value)}
            maxLength={512}
            placeholder="Short display name"
          />
        </FormField>
        <FormField label="Description (optional)">
          <textarea
            value={permDesc}
            onChange={(e) => onPermDescChange(e.target.value)}
            rows={2}
            className="console-perm-modal-textarea"
            placeholder="What this permission covers"
          />
        </FormField>
        <FormField label="Frontend route patterns (one per line)">
          <textarea
            value={permFe}
            onChange={(e) => onPermFeChange(e.target.value)}
            rows={4}
            className="console-perm-modal-textarea"
            placeholder={'/console/users\n/console/*'}
          />
        </FormField>
        <FormField label="Backend API patterns (one per line)">
          <textarea
            value={permBe}
            onChange={(e) => onPermBeChange(e.target.value)}
            rows={4}
            className="console-perm-modal-textarea"
            placeholder={'/api/admin/users\n/api/admin/users/*'}
          />
        </FormField>
      </Dialog>

      <Dialog
        open={showAddModal}
        onClose={onCloseAddRole}
        closeDisabled={addSubmitting}
        title="Add role"
        closeAriaLabel="Close"
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={addSubmitting}
              onClick={onCloseAddRole}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={addSubmitting}
              onClick={onSubmitAddRole}
            >
              {addSubmitting ? 'Creating…' : 'Create role'}
            </button>
          </>
        }
      >
        <FormField label="Name">
          <input
            type="text"
            value={addName}
            onChange={(e) => onAddNameChange(e.target.value)}
            maxLength={128}
            autoFocus
            placeholder="e.g. content-editor"
          />
        </FormField>
        <FormField label="Description (optional)">
          <textarea
            value={addDescription}
            onChange={(e) => onAddDescriptionChange(e.target.value)}
            rows={2}
            placeholder="Short note for administrators"
            className="console-perm-modal-textarea"
          />
        </FormField>
      </Dialog>
    </>
  );
}
