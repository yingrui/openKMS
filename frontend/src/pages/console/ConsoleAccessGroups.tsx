import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Search, Trash2, UserPlus, UsersRound } from 'lucide-react';
import '../ontology/ontology-admin.scss';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import { fetchAdminUsersPage, type AdminUserRow } from '../../data/adminUsersApi';
import {
  createAccessGroup,
  deleteAccessGroup,
  fetchAccessGroup,
  fetchAccessGroups,
  fetchGroupMemberSubjects,
  fetchGroupMembersPage,
  fetchGroupSharedResourcesPage,
  patchAccessGroup,
  putGroupMembers,
  type AccessGroupOut,
  type GroupSharedResourceOut,
  type MemberBrief,
} from '../../data/securityAdminApi';
import { Pagination } from '../../styles/design-system';
import './ConsoleAccessGroups.scss';

const MEMBERS_PAGE_SIZE_DEFAULT = 25;
const SHARED_PAGE_SIZE_DEFAULT = 25;

type DetailTab = 'members' | 'sharing';

export function ConsoleAccessGroups() {
  const { groupId: routeGroupId } = useParams<{ groupId?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('console');
  const { hasPermission, authMode } = useAuth();
  const membershipLocal = authMode === 'local';

  const [groups, setGroups] = useState<AccessGroupOut[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AccessGroupOut | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('members');
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersPage, setMembersPage] = useState(0);
  const [membersPageSize, setMembersPageSize] = useState(MEMBERS_PAGE_SIZE_DEFAULT);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [sharedPage, setSharedPage] = useState(0);
  const [sharedPageSize, setSharedPageSize] = useState(SHARED_PAGE_SIZE_DEFAULT);

  const [members, setMembers] = useState<MemberBrief[]>([]);
  const [memberSubjects, setMemberSubjects] = useState<string[]>([]);
  const [sharedResources, setSharedResources] = useState<GroupSharedResourceOut[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUserRow[]>([]);
  const [userPickQuery, setUserPickQuery] = useState('');
  const [userPickOpen, setUserPickOpen] = useState(false);
  const [oidcSubjectInput, setOidcSubjectInput] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);
  const memberSaveVersion = useRef(0);
  const userPickRef = useRef<HTMLDivElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPending, setCreatePending] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPending, setEditPending] = useState(false);

  const loadGroups = useCallback(async () => {
    setListLoading(true);
    try {
      const items = await fetchAccessGroups();
      setGroups(items);
      return items;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('accessGroups.toastLoadFailed'));
      return [];
    } finally {
      setListLoading(false);
    }
  }, [t]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);

  const loadMembersPage = useCallback(
    async (id: string, page: number, pageSize: number) => {
      const mem = await fetchGroupMembersPage(id, {
        limit: pageSize,
        offset: page * pageSize,
      });
      setMembers(mem.members);
      setMembersTotal(mem.total);
    },
    []
  );

  const loadSharedPage = useCallback(async (id: string, page: number, pageSize: number) => {
    const shared = await fetchGroupSharedResourcesPage(id, {
      limit: pageSize,
      offset: page * pageSize,
    });
    setSharedResources(shared.items);
    setSharedTotal(shared.total);
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setMembersPage(0);
      setSharedPage(0);
      try {
        const [group, subjects, usersPage] = await Promise.all([
          fetchAccessGroup(id),
          fetchGroupMemberSubjects(id),
          membershipLocal
            ? fetchAdminUsersPage().catch(() => ({ users: [] as AdminUserRow[] }))
            : Promise.resolve({ users: [] as AdminUserRow[] }),
        ]);
        setSelectedGroup(group);
        setMemberSubjects(subjects);
        await Promise.all([
          loadMembersPage(id, 0, membersPageSize),
          loadSharedPage(id, 0, sharedPageSize),
        ]);
        if (usersPage.users?.length) setAllUsers(usersPage.users);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('accessGroups.toastDetailFailed'));
        setSelectedId(null);
        setSelectedGroup(null);
        navigate('/console/data-security/groups', { replace: true });
      } finally {
        setDetailLoading(false);
      }
    },
    [loadMembersPage, loadSharedPage, membersPageSize, membershipLocal, navigate, sharedPageSize, t]
  );

  const selectGroup = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setUserPickQuery('');
      setUserPickOpen(false);
      setOidcSubjectInput('');
      if (id) {
        navigate(`/console/data-security/groups/${id}`, { replace: true });
        void loadDetail(id);
      } else {
        setSelectedGroup(null);
        navigate('/console/data-security/groups', { replace: true });
      }
    },
    [loadDetail, navigate]
  );

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void (async () => {
      if (!routeGroupId) return;
      if (routeGroupId === selectedId) return;
      try {
        await fetchAccessGroup(routeGroupId);
        setSelectedId(routeGroupId);
        await loadDetail(routeGroupId);
      } catch {
        toast.error(t('accessGroups.groupNotFound'));
        navigate('/console/data-security/groups', { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route deep link
  }, [routeGroupId]);

  useEffect(() => {
    if (!selectedId || detailLoading) return;
    void loadMembersPage(selectedId, membersPage, membersPageSize);
  }, [selectedId, membersPage, membersPageSize, loadMembersPage, detailLoading]);

  useEffect(() => {
    if (!selectedId || detailLoading || activeTab !== 'sharing') return;
    void loadSharedPage(selectedId, sharedPage, sharedPageSize);
  }, [selectedId, sharedPage, sharedPageSize, loadSharedPage, detailLoading, activeTab]);

  const memberRows = useMemo(() => {
    return members.map((m) => {
      if (m.username != null || m.email != null || !membershipLocal) return m;
      const u = allUsers.find((x) => x.id === m.subject);
      return {
        ...m,
        username: u?.username ?? null,
        email: u?.email ?? null,
      };
    });
  }, [members, membershipLocal, allUsers]);

  const addableUsers = useMemo(() => {
    const q = userPickQuery.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (memberSubjects.includes(u.id)) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [allUsers, memberSubjects, userPickQuery]);

  useEffect(() => {
    if (!userPickOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (userPickRef.current && !userPickRef.current.contains(ev.target as Node)) {
        setUserPickOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [userPickOpen]);

  const persistMembers = useCallback(
    async (subjects: string[], previousSubjects: string[]) => {
      if (!selectedId) return;
      const version = ++memberSaveVersion.current;
      setSavingMembers(true);
      try {
      await putGroupMembers(selectedId, subjects);
      if (version !== memberSaveVersion.current) return;
      const saved = await fetchGroupMemberSubjects(selectedId);
      setMemberSubjects(saved);
      await loadMembersPage(selectedId, membersPage, membersPageSize);
      await loadGroups();
      const g = await fetchAccessGroup(selectedId);
      setSelectedGroup(g);
      } catch (e) {
        if (version === memberSaveVersion.current) {
          setMemberSubjects(previousSubjects);
        }
        toast.error(e instanceof Error ? e.message : t('accessGroups.toastSaveFailed'));
      } finally {
        if (version === memberSaveVersion.current) {
          setSavingMembers(false);
        }
      }
    },
    [selectedId, loadGroups, loadMembersPage, membersPage, membersPageSize, t]
  );

  const onCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!createName.trim()) return;
    setCreatePending(true);
    try {
      const g = await createAccessGroup({
        name: createName.trim(),
        description: createDesc.trim() || null,
      });
      toast.success(t('accessGroups.toastCreated'));
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      await loadGroups();
      selectGroup(g.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('accessGroups.toastCreateFailed'));
    } finally {
      setCreatePending(false);
    }
  };

  const onSaveEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!selectedId || !editName.trim()) return;
    setEditPending(true);
    try {
      await patchAccessGroup(selectedId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      toast.success(t('accessGroups.toastUpdated'));
      setEditOpen(false);
      await loadGroups();
      await loadDetail(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('accessGroups.toastUpdateFailed'));
    } finally {
      setEditPending(false);
    }
  };

  const onDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!window.confirm(t('accessGroups.deleteConfirm', { name: selectedGroup.name }))) return;
    try {
      await deleteAccessGroup(selectedGroup.id);
      toast.success(t('accessGroups.toastDeleted'));
      await loadGroups();
      selectGroup(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('accessGroups.toastDeleteFailed'));
    }
  };

  const addSubject = (subject: string) => {
    const s = subject.trim();
    if (!s || memberSubjects.includes(s) || savingMembers) return;
    const previous = memberSubjects;
    const next = [...memberSubjects, s];
    setMemberSubjects(next);
    void persistMembers(next, previous);
  };

  const removeSubject = (subject: string) => {
    if (savingMembers) return;
    const previous = memberSubjects;
    const next = memberSubjects.filter((id) => id !== subject);
    setMemberSubjects(next);
    void persistMembers(next, previous);
  };

  const openEditModal = () => {
    if (!selectedGroup) return;
    setEditName(selectedGroup.name);
    setEditDesc(selectedGroup.description ?? '');
    setEditOpen(true);
  };

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <div className="console-access-groups-page">
      <div className="page-header console-access-groups-header">
        <div>
          <h1>{t('accessGroups.pageTitle')}</h1>
          <p className="page-subtitle">{t('accessGroups.subtitle')}</p>
        </div>
      </div>

      <div className="console-access-groups-main">
        <aside className="console-access-groups-sidebar" aria-label={t('accessGroups.pageTitle')}>
          <div className="console-access-groups-sidebar-header">
            <h3>{t('accessGroups.sidebarTitle')}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              {t('accessGroups.add')}
            </button>
          </div>
          <div className="console-access-groups-search">
            <Search size={18} />
            <input
              type="search"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder={t('accessGroups.searchGroups')}
              aria-label={t('accessGroups.searchGroups')}
            />
          </div>
          {listLoading ? (
            <p className="console-access-groups-muted">{t('accessGroups.loading')}</p>
          ) : groups.length === 0 ? (
            <p className="console-access-groups-sidebar-hint console-access-groups-muted">
              {t('accessGroups.noGroups')}
            </p>
          ) : filteredGroups.length === 0 ? (
            <p className="console-access-groups-sidebar-hint console-access-groups-muted">
              {t('accessGroups.noSearchResults')}
            </p>
          ) : (
            <div className="console-access-groups-list-scroll">
              <ul className="console-access-groups-list">
                {filteredGroups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={`console-access-groups-list-item${selectedId === g.id ? ' active' : ''}`}
                      onClick={() => selectGroup(g.id)}
                    >
                      <UsersRound size={16} />
                      <span className="console-access-groups-list-name">{g.name}</span>
                      <span className="console-access-groups-list-count">
                        ({g.member_count})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="console-access-groups-content">
          {!selectedId ? (
            <p className="console-access-groups-placeholder">{t('accessGroups.emptyDetail')}</p>
          ) : detailLoading && !selectedGroup ? (
            <p className="console-access-groups-muted">{t('accessGroups.loading')}</p>
          ) : selectedGroup ? (
            <>
              <div className="console-access-groups-detail-toolbar">
                <p className="console-access-groups-context-hint">
                  {activeTab === 'members'
                    ? t('accessGroups.editingMembers', { name: selectedGroup.name })
                    : t('accessGroups.editingSharing', { name: selectedGroup.name })}
                  {selectedGroup.description ? (
                    <span className="console-access-groups-muted"> — {selectedGroup.description}</span>
                  ) : null}
                </p>
                <div className="console-access-groups-detail-toolbar-row">
                  <div className="console-access-groups-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'members'}
                      className={`console-access-groups-tab${activeTab === 'members' ? ' active' : ''}`}
                      onClick={() => setActiveTab('members')}
                    >
                      {t('accessGroups.tabMembers')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'sharing'}
                      className={`console-access-groups-tab${activeTab === 'sharing' ? ' active' : ''}`}
                      onClick={() => setActiveTab('sharing')}
                    >
                      {t('accessGroups.tabSharing')}
                    </button>
                  </div>
                  <div className="console-access-groups-detail-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={openEditModal}>
                      <Pencil size={14} />
                      {t('accessGroups.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void onDeleteGroup()}
                    >
                      <Trash2 size={14} />
                      {t('accessGroups.delete')}
                    </button>
                  </div>
                </div>
              </div>

              {activeTab === 'members' && (
                <>
                  <div className="console-access-groups-members-toolbar">
                    <p className="console-access-groups-panel-hint">
                      {membershipLocal
                        ? t('accessGroups.membersHintLocal')
                        : t('accessGroups.membersHintOidc')}
                    </p>
                    {savingMembers && (
                      <span className="console-access-groups-saving" role="status">
                        {t('accessGroups.saving')}
                      </span>
                    )}
                  </div>

                  {membershipLocal ? (
                    <div className="console-access-groups-user-pick" ref={userPickRef}>
                      <Search size={18} />
                      <input
                        type="search"
                        value={userPickQuery}
                        onChange={(e) => {
                          setUserPickQuery(e.target.value);
                          setUserPickOpen(true);
                        }}
                        onFocus={() => setUserPickOpen(true)}
                        placeholder={t('accessGroups.addMemberSearch')}
                      />
                      {userPickOpen && addableUsers.length > 0 && (
                        <ul className="console-access-groups-user-menu">
                          {addableUsers.slice(0, 12).map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  addSubject(u.id);
                                  setUserPickQuery('');
                                  setUserPickOpen(false);
                                }}
                              >
                                {u.username}{' '}
                                <span className="console-access-groups-muted">({u.email})</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="console-access-groups-add-row">
                      <input
                        type="text"
                        value={oidcSubjectInput}
                        onChange={(e) => setOidcSubjectInput(e.target.value)}
                        placeholder={t('accessGroups.oidcSubjectPlaceholder')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSubject(oidcSubjectInput);
                            setOidcSubjectInput('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={savingMembers}
                        onClick={() => {
                          addSubject(oidcSubjectInput);
                          setOidcSubjectInput('');
                        }}
                      >
                        <UserPlus size={16} />
                        <span>{t('accessGroups.addMember')}</span>
                      </button>
                    </div>
                  )}

                  <div className="console-access-groups-table-wrap">
                    {membersTotal === 0 ? (
                      <p className="console-access-groups-table-empty">{t('accessGroups.noMembers')}</p>
                    ) : (
                      <>
                        <table className="console-access-groups-table">
                          <thead>
                            <tr>
                              <th>{t('accessGroups.colMember')}</th>
                              {membershipLocal && <th>{t('accessGroups.colEmail')}</th>}
                              <th aria-label={t('accessGroups.colActions')} />
                            </tr>
                          </thead>
                          <tbody>
                            {memberRows.map((m) => (
                              <tr key={m.subject}>
                                <td>
                                  {m.username ?? (
                                    <code className="console-access-groups-muted">{m.subject}</code>
                                  )}
                                </td>
                                {membershipLocal && (
                                  <td className="console-access-groups-muted">{m.email ?? '—'}</td>
                                )}
                                <td>
                                  <button
                                    type="button"
                                    className="btn-link danger"
                                    disabled={savingMembers}
                                    onClick={() => removeSubject(m.subject)}
                                  >
                                    {t('accessGroups.removeMember')}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <Pagination
                          total={membersTotal}
                          page={membersPage}
                          pageSize={membersPageSize}
                          loading={detailLoading || savingMembers}
                          onPageChange={setMembersPage}
                          onPageSizeChange={(size) => {
                            setMembersPageSize(size);
                            setMembersPage(0);
                          }}
                        />
                      </>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'sharing' && (
                <>
                  <p className="console-access-groups-panel-hint" style={{ marginBottom: '12px' }}>
                    {t('accessGroups.sharingHint')}
                  </p>
                  <div className="console-access-groups-table-wrap">
                    {sharedTotal === 0 ? (
                      <p className="console-access-groups-table-empty">
                        {t('accessGroups.noSharedResources')}
                      </p>
                    ) : (
                      <>
                        <table className="console-access-groups-table">
                          <thead>
                            <tr>
                              <th>{t('accessGroups.colType')}</th>
                              <th>{t('accessGroups.colName')}</th>
                              <th>{t('accessGroups.colPermissions')}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {sharedResources.map((row) => (
                              <tr key={`${row.resource_type}:${row.resource_id}`}>
                                <td>{row.resource_type_label}</td>
                                <td>{row.resource_label}</td>
                                <td>
                                  <code>{row.permissions || '—'}</code>
                                </td>
                                <td>
                                  {row.share_path ? (
                                    <Link to={row.share_path} className="btn-link">
                                      {t('accessGroups.openSharing')}
                                    </Link>
                                  ) : (
                                    <span className="console-access-groups-muted">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <Pagination
                          total={sharedTotal}
                          page={sharedPage}
                          pageSize={sharedPageSize}
                          loading={detailLoading}
                          onPageChange={setSharedPage}
                          onPageSizeChange={(size) => {
                            setSharedPageSize(size);
                            setSharedPage(0);
                          }}
                        />
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      {createOpen && (
        <div
          className="console-access-groups-modal-backdrop"
          role="presentation"
          onClick={() => !createPending && setCreateOpen(false)}
        >
          <div
            className="console-access-groups-modal"
            role="dialog"
            aria-labelledby="create-group-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-group-title">{t('accessGroups.createModalTitle')}</h2>
            <p className="console-access-groups-modal-sub">{t('accessGroups.createModalSub')}</p>
            <form onSubmit={onCreate}>
              <label>
                {t('accessGroups.name')}
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  maxLength={256}
                  autoFocus
                />
              </label>
              <label>
                {t('accessGroups.description')}
                <input
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                />
              </label>
              <div className="console-access-groups-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={createPending}
                  onClick={() => setCreateOpen(false)}
                >
                  {t('accessGroups.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={createPending}>
                  {createPending ? t('accessGroups.creating') : t('accessGroups.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && selectedGroup && (
        <div
          className="console-access-groups-modal-backdrop"
          role="presentation"
          onClick={() => !editPending && setEditOpen(false)}
        >
          <div
            className="console-access-groups-modal"
            role="dialog"
            aria-labelledby="edit-group-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-group-title">{t('accessGroups.editModalTitle')}</h2>
            <form onSubmit={onSaveEdit}>
              <label>
                {t('accessGroups.name')}
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={256}
                />
              </label>
              <label>
                {t('accessGroups.description')}
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              </label>
              <div className="console-access-groups-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={editPending}
                  onClick={() => setEditOpen(false)}
                >
                  {t('accessGroups.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={editPending}>
                  {editPending ? t('accessGroups.saving') : t('accessGroups.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
