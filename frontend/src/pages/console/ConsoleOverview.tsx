import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, KeyRound, Database, Box, Settings, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_GROUPS, PERM_CONSOLE_PERMISSIONS } from '../../config/permissions';
import { fetchSecurityPermissions } from '../../data/securityAdminApi';
import './ConsoleOverview.css';

const PERMS_ONBOARDING_KEY = 'openkms_permissions_onboarding_dismissed';

type FeatureItem = {
  title: string;
  description: string;
  path?: string;
};

const CONSOLE_TOOL_FEATURES: FeatureItem[] = [
  {
    title: 'Permissions & roles',
    description:
      'Define operation keys in the catalog, assign them to roles, and map IdP realm roles (OIDC) or local users to those roles.',
    path: '/console/permission-management',
  },
  {
    title: 'Data security',
    description:
      'In local auth mode, create access groups and attach allow lists for channels, knowledge bases, evaluation datasets, datasets, and ontology types.',
    path: '/console/data-security/groups',
  },
  {
    title: 'Data sources',
    description:
      'Register databases and other connections (PostgreSQL, Neo4j, etc.) used by datasets and pipelines.',
    path: '/console/data-sources',
  },
  {
    title: 'Users & feature toggles',
    description:
      'Manage local users (when not using a central IdP) and turn product areas such as articles, knowledge bases, or ontology UI on or off.',
    path: '/console/users',
  },
  {
    title: 'System settings',
    description: 'Reserved for deployment-specific options; extend here as new console settings are added.',
    path: '/console/settings',
  },
];

function iconFor(title: string) {
  switch (title) {
    case 'Permissions & roles':
      return KeyRound;
    case 'Data security':
      return Shield;
    case 'Data sources':
      return Database;
    case 'Users & feature toggles':
      return Users;
    case 'System settings':
      return Settings;
    default:
      return Box;
  }
}

export function ConsoleOverview() {
  const { hasPermission, canAccessPath } = useAuth();
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

  const renderFeatureCards = (items: FeatureItem[]) => (
    <ul className="console-overview-feature-grid">
      {items.map((f) => {
        const Icon = iconFor(f.title);
        const open = f.path && canAccessPath(f.path);
        const inner = (
          <div className="console-overview-feature-card-inner">
            <div className="console-overview-feature-icon" aria-hidden>
              <Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="console-overview-feature-body">
              <h3 className="console-overview-feature-title">{f.title}</h3>
              <p className="console-overview-feature-text">{f.description}</p>
            </div>
          </div>
        );
        return (
          <li key={f.title} className="console-overview-feature-card">
            {open && f.path ? (
              <Link to={f.path} className="console-overview-feature-card-hit">
                {inner}
              </Link>
            ) : (
              <div className="console-overview-feature-card-static">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="console-overview">
      <div className="page-header">
        <h1>Console Overview</h1>
        <p className="page-subtitle">
          Security, access, database connections, local users, feature toggles, and console settings—everything available
          from the console sidebar.
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
      <section className="console-overview-intro" aria-labelledby="console-intro-heading">
        <h2 id="console-intro-heading">What you can do</h2>
        <p className="console-overview-intro-lead">
          Each card links to a console page when your role allows it; paths are under <code>/console/…</code>.
        </p>
        {renderFeatureCards(CONSOLE_TOOL_FEATURES)}
      </section>
    </div>
  );
}
