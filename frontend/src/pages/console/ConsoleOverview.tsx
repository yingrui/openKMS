import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Shield, KeyRound, Database, Box, Settings, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_ALL, PERM_CONSOLE_GROUPS, PERM_CONSOLE_PERMISSIONS } from '../../config/permissions';
import { fetchSecurityPermissions } from '../../data/securityAdminApi';
import './ConsoleOverview.css';

const PERMS_ONBOARDING_KEY = 'openkms_permissions_onboarding_dismissed';

type FeatureId = 'permissions' | 'dataSecurity' | 'dataSources' | 'usersToggles' | 'systemSettings';

type FeatureItem = {
  id: FeatureId;
  path?: string;
};

const CONSOLE_TOOL_FEATURES: FeatureItem[] = [
  { id: 'permissions', path: '/console/permission-management' },
  { id: 'dataSecurity', path: '/console/data-security/groups' },
  { id: 'dataSources', path: '/console/data-sources' },
  { id: 'usersToggles', path: '/console/users' },
  { id: 'systemSettings', path: '/console/settings' },
];

function iconFor(id: FeatureId) {
  switch (id) {
    case 'permissions':
      return KeyRound;
    case 'dataSecurity':
      return Shield;
    case 'dataSources':
      return Database;
    case 'usersToggles':
      return Users;
    case 'systemSettings':
      return Settings;
    default:
      return Box;
  }
}

export function ConsoleOverview() {
  const { t } = useTranslation('console');
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
        const Icon = iconFor(f.id);
        const open = f.path && canAccessPath(f.path);
        const title = t(`overview.features.${f.id}.title`);
        const inner = (
          <div className="console-overview-feature-card-inner">
            <div className="console-overview-feature-icon" aria-hidden>
              <Icon size={22} strokeWidth={1.75} />
            </div>
            <div className="console-overview-feature-body">
              <h3 className="console-overview-feature-title">{title}</h3>
              <p className="console-overview-feature-text">{t(`overview.features.${f.id}.description`)}</p>
            </div>
          </div>
        );
        return (
          <li key={f.id} className="console-overview-feature-card">
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
        <h1>{t('overview.pageTitle')}</h1>
        <p className="page-subtitle">{t('overview.subtitle')}</p>
      </div>
      {showPermSetupNudge ? (
        <section className="console-overview-nudge" role="status">
          <p>
            <Trans
              i18nKey="overview.nudge"
              ns="console"
              components={{
                codeTag: <code />,
                setupLink: <Link to="/console/permission-management" />,
              }}
            />
          </p>
        </section>
      ) : null}
      {(hasPermission(PERM_CONSOLE_PERMISSIONS) || hasPermission(PERM_CONSOLE_GROUPS)) && (
        <section className="console-overview-quick">
          {hasPermission(PERM_CONSOLE_PERMISSIONS) && (
            <Link to="/console/permission-management" className="console-overview-quick-card">
              <KeyRound size={22} />
              <span>{t('overview.quickPermissions')}</span>
            </Link>
          )}
          {hasPermission(PERM_CONSOLE_GROUPS) && (
            <Link to="/console/data-security/groups" className="console-overview-quick-card">
              <Shield size={22} />
              <span>{t('overview.quickAccessGroups')}</span>
            </Link>
          )}
        </section>
      )}
      <section className="console-overview-intro" aria-labelledby="console-intro-heading">
        <h2 id="console-intro-heading">{t('overview.introHeading')}</h2>
        <p className="console-overview-intro-lead">
          <Trans
            i18nKey="overview.introLead"
            ns="console"
            components={{
              codePath: <code />,
            }}
          />
        </p>
        {renderFeatureCards(CONSOLE_TOOL_FEATURES)}
      </section>
    </div>
  );
}
