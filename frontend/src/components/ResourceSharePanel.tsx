import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchAccessGroups,
  fetchAdminResourceAcl,
  fetchAdminResourceAclOwnerCandidates,
  putAdminResourceAcl,
  type AccessGroupOut,
} from '../data/securityAdminApi';
import {
  fetchResourceAcl,
  fetchResourceAclOwnerCandidates,
  putResourceAcl,
  type AclGrant,
  type OwnerCandidate,
  type ResourceAclOut,
} from '../data/resourceAclApi';
import './ResourceSharePanel.scss';

type GroupRow = {
  grantee_id: string;
  permissions: string;
  label?: string;
  /** Unsaved row from "Add group" — shows a picker until saved. */
  isNew?: boolean;
};

type OwnerGrant = {
  grantee_id: string;
  permissions: string;
  label?: string;
};

type Props = {
  resourceType: string;
  resourceId: string;
  title?: string;
  /** Console audit: load/save via admin API (no resource-level read/manage required). */
  consoleAudit?: boolean;
  onSaved?: () => void;
};

function apiPermToRow(perm: string | undefined): string {
  if (!perm || perm === '-') return '';
  return perm;
}

function permToggle(current: string, bit: 'r' | 'w' | 'm'): string {
  const has = current.includes(bit);
  const next = has ? current.replace(bit, '') : current + bit;
  return [...new Set(next.split(''))].filter((c) => 'rwm'.includes(c)).join('');
}

function splitGrants(grants: AclGrant[], ownerSubject?: string | null, ownerLabel?: string | null) {
  const auth = grants.find((g) => g.grantee_type === 'authenticated');
  const ownerGrant =
    grants.find((g) => g.grantee_type === 'user' && g.is_owner) ??
    grants.find((g) => g.grantee_type === 'user');
  const groups = grants.filter((g) => g.grantee_type === 'group');
  const ownerId = ownerGrant?.grantee_id ?? ownerSubject ?? null;
  return {
    others: apiPermToRow(auth?.permissions),
    owner: ownerId
      ? {
          grantee_id: ownerId,
          permissions: apiPermToRow(ownerGrant?.permissions),
          label: ownerGrant?.grantee_label ?? ownerLabel ?? '',
        }
      : null,
    groups: groups.map((g) => ({
      grantee_id: g.grantee_id ?? '',
      permissions: apiPermToRow(g.permissions),
      label: g.grantee_label ?? '',
    })),
  };
}

function mergedOwnerCandidates(
  catalog: OwnerCandidate[],
  ownerGrant: OwnerGrant | null,
  createdBy?: string | null,
  createdByLabel?: string | null
): OwnerCandidate[] {
  const bySubject = new Map(catalog.map((c) => [c.subject, c]));
  if (ownerGrant?.grantee_id && !bySubject.has(ownerGrant.grantee_id)) {
    bySubject.set(ownerGrant.grantee_id, {
      subject: ownerGrant.grantee_id,
      label: ownerGrant.label?.trim() || ownerGrant.grantee_id,
    });
  }
  if (createdBy && !bySubject.has(createdBy)) {
    bySubject.set(createdBy, {
      subject: createdBy,
      label: createdByLabel?.trim() || createdBy,
    });
  }
  return [...bySubject.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function mergedGroupOptions(catalog: AccessGroupOut[], rows: GroupRow[]): AccessGroupOut[] {
  const byId = new Map(catalog.map((g) => [g.id, g]));
  for (const row of rows) {
    if (row.grantee_id && !byId.has(row.grantee_id)) {
      byId.set(row.grantee_id, {
        id: row.grantee_id,
        name: row.label?.trim() || row.grantee_id,
        description: null,
        member_count: 0,
        shared_resource_count: 0,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ownerDisplayName(
  row: OwnerGrant,
  ownerOptions: OwnerCandidate[],
  aclOwnerLabel?: string | null
): string {
  const label = row.label?.trim();
  if (label && label !== row.grantee_id) return label;
  const fromAcl = aclOwnerLabel?.trim();
  if (fromAcl && fromAcl !== row.grantee_id) return fromAcl;
  const fromCatalog = ownerOptions.find((c) => c.subject === row.grantee_id)?.label?.trim();
  if (fromCatalog && fromCatalog !== row.grantee_id) return fromCatalog;
  return label || fromAcl || fromCatalog || row.grantee_id;
}

function groupDisplayName(row: GroupRow, options: AccessGroupOut[]): string {
  if (row.label?.trim()) return row.label.trim();
  return options.find((g) => g.id === row.grantee_id)?.name ?? row.grantee_id;
}

function addableGroupsForRow(options: AccessGroupOut[], rows: GroupRow[], rowIndex: number): AccessGroupOut[] {
  const assignedElsewhere = new Set(
    rows.filter((_, i) => i !== rowIndex).map((r) => r.grantee_id)
  );
  return options.filter((g) => !assignedElsewhere.has(g.id));
}

function buildGrantPayload(
  ownerGrant: OwnerGrant | null,
  groupRows: GroupRow[],
  othersPermissions: string
) {
  const grants: {
    grantee_type: string;
    grantee_id?: string | null;
    permissions: string;
  }[] = [];

  if (ownerGrant && apiPermToRow(ownerGrant.permissions)) {
    grants.push({
      grantee_type: 'user',
      grantee_id: ownerGrant.grantee_id,
      permissions: ownerGrant.permissions,
    });
  }

  for (const row of groupRows) {
    if (row.grantee_id.trim() && row.permissions.length > 0) {
      grants.push({
        grantee_type: 'group',
        grantee_id: row.grantee_id.trim(),
        permissions: row.permissions,
      });
    }
  }

  // Always persist Others: empty string stores explicit deny (blocks parent inheritance).
  grants.push({
    grantee_type: 'authenticated',
    grantee_id: null,
    permissions: othersPermissions,
  });

  return grants;
}

function applyAclToState(
  a: ResourceAclOut,
  setOthers: (v: string) => void,
  setOwnerGrant: (v: OwnerGrant | null) => void,
  setGroupRows: (v: GroupRow[]) => void
) {
  const { others, owner, groups } = splitGrants(a.grants, a.owner_subject, a.owner_label);
  setOthers(others);
  setOwnerGrant(owner);
  setGroupRows(groups);
}

function canManageFromAcl(a: ResourceAclOut, consoleAudit: boolean): boolean {
  return consoleAudit || (a.effective_permissions ?? '').includes('m');
}

export function ResourceSharePanel({ resourceType, resourceId, title, consoleAudit = false, onSaved }: Props) {
  const { t } = useTranslation('common');
  const [acl, setAcl] = useState<ResourceAclOut | null>(null);
  const [groups, setGroups] = useState<AccessGroupOut[]>([]);
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerCandidate[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [othersPermissions, setOthersPermissions] = useState('');
  const [ownerGrant, setOwnerGrant] = useState<OwnerGrant | null>(null);
  const [ownerEditing, setOwnerEditing] = useState(false);
  const [ownerPickQuery, setOwnerPickQuery] = useState('');
  const [ownerPickOpen, setOwnerPickOpen] = useState(false);
  const ownerPickRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canManage = consoleAudit || (acl?.effective_permissions ?? '').includes('m');
  const groupOptions = mergedGroupOptions(groups, groupRows);
  const ownerOptions = mergedOwnerCandidates(
    ownerCandidates,
    ownerGrant,
    acl?.created_by,
    acl?.created_by === acl?.owner_subject ? acl?.owner_label : null
  );
  const assignedGroupIds = new Set(groupRows.map((r) => r.grantee_id));
  const addableGroups = groupOptions.filter((g) => !assignedGroupIds.has(g.id));
  const pickerOptions = (idx: number) => addableGroupsForRow(groupOptions, groupRows, idx);
  const filteredOwnerOptions = useMemo(() => {
    const q = ownerPickQuery.trim().toLowerCase();
    if (!q) return ownerOptions;
    return ownerOptions.filter(
      (c) => c.label.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)
    );
  }, [ownerOptions, ownerPickQuery]);

  useEffect(() => {
    if (!ownerPickOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (ownerPickRef.current && !ownerPickRef.current.contains(ev.target as Node)) {
        setOwnerPickOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ownerPickOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchAcl = consoleAudit ? fetchAdminResourceAcl : fetchResourceAcl;
      const [a, g] = await Promise.all([
        fetchAcl(resourceType, resourceId),
        fetchAccessGroups().catch(() => [] as AccessGroupOut[]),
      ]);
      setAcl(a);
      setGroups(g);
      applyAclToState(a, setOthersPermissions, setOwnerGrant, setGroupRows);
      setOwnerEditing(false);
      setOwnerPickQuery('');
      setOwnerPickOpen(false);
      if (canManageFromAcl(a, consoleAudit)) {
        const fetchCandidates = consoleAudit
          ? fetchAdminResourceAclOwnerCandidates
          : fetchResourceAclOwnerCandidates;
        const candidates = await fetchCandidates(resourceType, resourceId).catch(
          () => [] as OwnerCandidate[]
        );
        setOwnerCandidates(candidates);
      } else {
        setOwnerCandidates([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('resourceShare.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [consoleAudit, resourceId, resourceType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!canManage) return;
    if (ownerGrant && !apiPermToRow(ownerGrant.permissions)) {
      toast.error(t('resourceShare.ownerPermissionsRequired'));
      return;
    }
    setSaving(true);
    try {
      const grants = buildGrantPayload(ownerGrant, groupRows, othersPermissions);
      const putAcl = consoleAudit ? putAdminResourceAcl : putResourceAcl;
      const updated = await putAcl(resourceType, resourceId, grants);
      setAcl(updated);
      applyAclToState(updated, setOthersPermissions, setOwnerGrant, setGroupRows);
      toast.success(t('resourceShare.saved'));
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('resourceShare.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addGroupRow = () => {
    if (!addableGroups.length) {
      toast.error(t('resourceShare.noGroupsToAdd'));
      return;
    }
    const pick = addableGroups[0];
    setGroupRows((prev) => [
      ...prev,
      { grantee_id: pick.id, permissions: 'r', label: pick.name, isNew: true },
    ]);
  };

  const assignOwner = (subject: string, label: string) => {
    setOwnerGrant((prev) => ({
      grantee_id: subject,
      label,
      permissions: prev?.permissions && apiPermToRow(prev.permissions) ? prev.permissions : 'rwm',
    }));
    setOwnerEditing(false);
    setOwnerPickQuery('');
    setOwnerPickOpen(false);
  };

  const confirmOwnerPick = () => {
    const raw = ownerPickQuery.trim();
    if (!raw) return;
    const exact = ownerOptions.find(
      (c) =>
        c.subject.toLowerCase() === raw.toLowerCase() || c.label.toLowerCase() === raw.toLowerCase()
    );
    if (exact) {
      assignOwner(exact.subject, exact.label);
      return;
    }
    if (filteredOwnerOptions.length === 1) {
      const only = filteredOwnerOptions[0];
      assignOwner(only.subject, only.label);
      return;
    }
    assignOwner(raw, raw);
  };

  const startOwnerAssign = () => {
    setOwnerPickQuery(ownerGrant?.label?.trim() || ownerGrant?.grantee_id || '');
    setOwnerEditing(true);
  };

  const cancelOwnerAssign = () => {
    setOwnerEditing(false);
    setOwnerPickQuery('');
    setOwnerPickOpen(false);
  };

  const renderPermCells = (
    permissions: string,
    onChange: (next: string) => void,
    disabled: boolean
  ) =>
    (['r', 'w', 'm'] as const).map((bit) => (
      <td key={bit}>
        <input
          type="checkbox"
          checked={permissions.includes(bit)}
          disabled={disabled}
          onChange={() => onChange(permToggle(permissions, bit))}
        />
      </td>
    ));

  if (loading) {
    return <p className="resource-share-loading">{t('resourceShare.loading')}</p>;
  }

  return (
    <section className="resource-share-panel">
      <header className="resource-share-header">
        <h2>{title ?? t('resourceShare.title')}</h2>
        {consoleAudit ? (
          <span className="resource-share-effective">{t('resourceShare.consoleAuditHint')}</span>
        ) : (
          acl?.effective_permissions && (
            <span className="resource-share-effective">
              {t('resourceShare.yourAccess')}: <code>{acl.effective_permissions || '—'}</code>
            </span>
          )
        )}
      </header>

      {acl?.inherits_from && acl.inherits_from.length > 0 && (
        <p className="resource-share-inherit">
          {t('resourceShare.inheritsFrom')}{' '}
          {acl.inherits_from.map((x) => `${x.resource_type}:${x.resource_id}`).join(', ')}
        </p>
      )}

      <p className="resource-share-hint">{t('resourceShare.hint')}</p>

      {!canManage && (
        <p className="resource-share-inherit">{t('resourceShare.readOnlyHint')}</p>
      )}

      <div className="resource-share-table-wrap">
        <table className="resource-share-table">
          <thead>
            <tr>
              <th>{t('resourceShare.grantee')}</th>
              <th>{t('resourceShare.read')}</th>
              <th>{t('resourceShare.write')}</th>
              <th>{t('resourceShare.manage')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
          <tr className="resource-share-owner-row">
            <td>
              <strong>{t('resourceShare.owner')}</strong>
              {ownerEditing && canManage ? (
                <div className="resource-share-owner-pick" ref={ownerPickRef}>
                  <div className="resource-share-owner-pick-field">
                    <Search size={16} aria-hidden />
                    <input
                      type="search"
                      value={ownerPickQuery}
                      onChange={(e) => {
                        setOwnerPickQuery(e.target.value);
                        setOwnerPickOpen(true);
                      }}
                      onFocus={() => setOwnerPickOpen(true)}
                      placeholder={t('resourceShare.ownerSearchPlaceholder')}
                      aria-autocomplete="list"
                      aria-expanded={ownerPickOpen && filteredOwnerOptions.length > 0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmOwnerPick();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelOwnerAssign();
                        }
                      }}
                    />
                    {ownerPickOpen && filteredOwnerOptions.length > 0 && (
                      <ul className="resource-share-owner-menu" role="listbox">
                        {filteredOwnerOptions.slice(0, 12).map((c) => (
                          <li key={c.subject} role="option">
                            <button
                              type="button"
                              onClick={() => assignOwner(c.subject, c.label)}
                            >
                              <span>{c.label}</span>
                              {c.label !== c.subject && (
                                <span className="resource-share-owner-menu-sub">{c.subject}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={confirmOwnerPick}
                  >
                    {t('resourceShare.assignOwner')}
                  </button>
                </div>
              ) : ownerGrant ? (
                <>
                  <span className="resource-share-grantee-primary">
                    {ownerDisplayName(ownerGrant, ownerOptions, acl?.owner_label)}
                  </span>
                  {acl?.created_by === ownerGrant.grantee_id && (
                    <span className="resource-share-grantee-note">{t('resourceShare.ownerIsCreator')}</span>
                  )}
                </>
              ) : (
                <span className="resource-share-grantee-note">{t('resourceShare.ownerNotSet')}</span>
              )}
            </td>
            {ownerGrant ? (
              renderPermCells(
                ownerGrant.permissions,
                (next) => setOwnerGrant((prev) => (prev ? { ...prev, permissions: next } : prev)),
                !canManage
              )
            ) : (
              <>
                <td />
                <td />
                <td />
              </>
            )}
            <td>
              {canManage && !ownerEditing && (
                <button type="button" className="btn-link" onClick={startOwnerAssign}>
                  {ownerGrant ? t('resourceShare.changeOwner') : t('resourceShare.assignOwner')}
                </button>
              )}
              {canManage && ownerEditing && (
                <button type="button" className="btn-link" onClick={cancelOwnerAssign}>
                  {t('resourceShare.cancel')}
                </button>
              )}
            </td>
          </tr>
          {groupRows.map((row, idx) => (
            <tr key={`group-${row.grantee_id}-${idx}`} className="resource-share-group-row">
              <td>
                {row.isNew && canManage ? (
                  <select
                    value={row.grantee_id}
                    onChange={(e) => {
                      const g = groupOptions.find((x) => x.id === e.target.value);
                      setGroupRows((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                grantee_id: e.target.value,
                                label: g?.name ?? e.target.value,
                              }
                            : r
                        )
                      );
                    }}
                  >
                    {pickerOptions(idx).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong>{groupDisplayName(row, groupOptions)}</strong>
                )}
              </td>
              {renderPermCells(row.permissions, (next) => {
                setGroupRows((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, permissions: next } : r))
                );
              }, !canManage)}
              <td>
                {canManage && (
                  <button
                    type="button"
                    className="btn-link danger"
                    onClick={() => setGroupRows((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    {t('resourceShare.remove')}
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className="resource-share-others-row">
            <td>
              <strong>{t('resourceShare.others')}</strong>
              <span className="resource-share-grantee-note">{t('resourceShare.othersNote')}</span>
            </td>
            {renderPermCells(othersPermissions, setOthersPermissions, !canManage)}
            <td />
          </tr>
          </tbody>
        </table>
      </div>

      <div className="resource-share-actions">
        {canManage && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addGroupRow}
            disabled={!addableGroups.length}
          >
            {t('resourceShare.addGroup')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void onSave()}
          disabled={saving || !canManage}
        >
          {saving ? t('resourceShare.saving') : t('resourceShare.save')}
        </button>
      </div>
    </section>
  );
}
