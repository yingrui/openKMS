import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import { fetchAdminUsersPage, type LocalUserRow } from '../../data/adminUsersApi';
import {
  fetchGroupMembers,
  putGroupMembers,
  type MemberBrief,
} from '../../data/securityAdminApi';
import './ConsoleGroupDataAccess.scss';

export function ConsoleGroupDataAccess() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useTranslation('console');
  const { hasPermission, authMode } = useAuth();
  const membershipLocal = authMode === 'local';
  const [members, setMembers] = useState<MemberBrief[]>([]);
  const [memberSubjects, setMemberSubjects] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<LocalUserRow[]>([]);
  const [oidcSubjectInput, setOidcSubjectInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [mem, usersPage] = await Promise.all([
        fetchGroupMembers(groupId),
        membershipLocal
          ? fetchAdminUsersPage().catch(() => ({ users: [] as LocalUserRow[] }))
          : Promise.resolve({ users: [] as LocalUserRow[] }),
      ]);
      setMembers(mem.members);
      setMemberSubjects(mem.members.map((m) => m.subject));
      if (usersPage.users?.length) setAllUsers(usersPage.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('groupAccess.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [groupId, membershipLocal, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMember = (subject: string) => {
    setMemberSubjects((prev) =>
      prev.includes(subject) ? prev.filter((id) => id !== subject) : [...prev, subject]
    );
  };

  const addOidcSubject = () => {
    const s = oidcSubjectInput.trim();
    if (!s) return;
    setMemberSubjects((prev) => (prev.includes(s) ? prev : [...prev, s]));
    setOidcSubjectInput('');
  };

  const onSaveMembers = async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      const res = await putGroupMembers(groupId, memberSubjects);
      setMembers(res.members);
      toast.success(t('groupAccess.toastMembersSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('groupAccess.toastSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }
  if (!groupId) {
    return <Navigate to="/console/data-security/groups" replace />;
  }

  return (
    <div className="console-group-access">
      <div className="page-header">
        <Link to="/console/data-security/groups" className="console-group-access-back">
          ← {t('groupAccess.backToGroups')}
        </Link>
        <h1>{t('groupAccess.pageTitle')}</h1>
        <p className="page-subtitle">{t('groupAccess.subtitle')}</p>
      </div>

      {loading ? (
        <p className="console-group-access-muted">{t('groupAccess.loading')}</p>
      ) : (
        <section className="console-group-access-section">
          <h2>{t('groupAccess.membersHeading')}</h2>
          <p className="console-group-access-hint">{t('groupAccess.membersHint')}</p>

          {membershipLocal ? (
            <div className="console-group-access-checkgrid">
              {allUsers.map((u) => (
                <label key={u.id} className="console-group-access-check">
                  <input
                    type="checkbox"
                    checked={memberSubjects.includes(u.id)}
                    onChange={() => toggleMember(u.id)}
                  />
                  <span>
                    {u.username} <span className="muted">({u.email})</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <>
              <div className="console-group-access-oidc-add">
                <input
                  type="text"
                  value={oidcSubjectInput}
                  onChange={(e) => setOidcSubjectInput(e.target.value)}
                  placeholder={t('groupAccess.oidcSubjectPlaceholder')}
                />
                <button type="button" className="btn-secondary" onClick={addOidcSubject}>
                  {t('groupAccess.addSubject')}
                </button>
              </div>
              <ul className="console-group-access-subject-list">
                {memberSubjects.map((s) => (
                  <li key={s}>
                    <code>{s}</code>
                    <button type="button" className="btn-link danger" onClick={() => toggleMember(s)}>
                      {t('groupAccess.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {members.length > 0 && (
            <p className="console-group-access-muted">
              {t('groupAccess.currentCount', { count: members.length })}
            </p>
          )}

          <button type="button" className="btn-primary" disabled={saving} onClick={() => void onSaveMembers()}>
            {saving ? t('groupAccess.saving') : t('groupAccess.saveMembers')}
          </button>

          <p className="console-group-access-hint">{t('groupAccess.shareHint')}</p>
        </section>
      )}
    </div>
  );
}
