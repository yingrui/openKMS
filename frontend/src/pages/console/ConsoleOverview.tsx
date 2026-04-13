import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, GitBranch, ListTodo, Cpu, Users, Shield, KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_GROUPS, PERM_CONSOLE_PERMISSIONS } from '../../config/permissions';
import { fetchSecurityPermissions } from '../../data/securityAdminApi';
import './ConsoleOverview.css';

const PERMS_ONBOARDING_KEY = 'openkms_permissions_onboarding_dismissed';

const stats = [
  { label: 'Active Jobs', value: '3', icon: ListTodo },
  { label: 'Pipelines', value: '2', icon: GitBranch },
  { label: 'Models', value: '7', icon: Cpu },
  { label: 'Users', value: '12', icon: Users },
];

export function ConsoleOverview() {
  const { hasPermission } = useAuth();
  const [showPermSetupNudge, setShowPermSetupNudge] = useState(false);

  useEffect(() => {
    if (!hasPermission(PERM_CONSOLE_PERMISSIONS)) return;
    try {
      if (localStorage.getItem(PERMS_ONBOARDING_KEY) === '1') return;
    } catch {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchSecurityPermissions();
        if (cancelled) return;
        if (rows.length === 1 && rows[0]?.key === PERM_ALL) {
          setShowPermSetupNudge(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  return (
    <div className="console-overview">
      <div className="page-header">
        <h1>Console Overview</h1>
        <p className="page-subtitle">
          System administration dashboard. Use the sidebar for permission management, data security, and console tools.
        </p>
      </div>
      {showPermSetupNudge ? (
        <section className="console-overview-nudge" role="status">
          <p>
            Your permission catalog only defines <code>all</code>.{' '}
            <Link to="/console/permission-management">Set up operation keys and roles</Link> before delegating access.
          </p>
        </section>
      ) : null}
      {(hasPermission(PERM_CONSOLE_PERMISSIONS) || hasPermission(PERM_CONSOLE_GROUPS)) && (
        <section className="console-overview-quick">
          {hasPermission(PERM_CONSOLE_PERMISSIONS) && (
            <Link to="/console/permission-management" className="console-overview-quick-card">
              <KeyRound size={22} />
              <span>Permissions</span>
            </Link>
          )}
          {hasPermission(PERM_CONSOLE_GROUPS) && (
            <Link to="/console/data-security/groups" className="console-overview-quick-card">
              <Shield size={22} />
              <span>Access groups</span>
            </Link>
          )}
        </section>
      )}
      <section className="console-overview-stats">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="console-overview-stat">
            <div className="console-overview-stat-icon">
              <Icon size={24} strokeWidth={1.75} />
            </div>
            <div>
              <span className="console-overview-stat-value">{value}</span>
              <span className="console-overview-stat-label">{label}</span>
            </div>
          </div>
        ))}
      </section>
      <section className="console-overview-card">
        <h2>Recent Activity</h2>
        <div className="console-overview-activity">
          <Activity size={20} />
          <p>No recent activity. Use the sidebar to manage pipelines, jobs, models, and users.</p>
        </div>
      </section>
    </div>
  );
}
