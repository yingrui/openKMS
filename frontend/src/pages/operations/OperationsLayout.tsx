import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EntityViewShell } from '../shared/EntityViewShell';

/**
 * Operations, laid out like an agent: identity and sections on the left, one view on the right.
 *
 * The area has two views of the same running system, so it uses the shell the rest of the product uses for "one thing
 * with sections" rather than inventing a second navigation for a page with two tabs.
 */
export function OperationsLayout() {
  const { t } = useTranslation('operations');

  return (
    <EntityViewShell
      backTo="/workforce"
      backLabel={t('area.backToAgents')}
      title={t('area.title')}
      meta={t('area.meta')}
      navItems={[
        { to: '/workforce/operations', label: t('nav.issues'), end: true },
        { to: '/workforce/operations/usage', label: t('nav.usage') },
      ]}
    >
      <Outlet />
    </EntityViewShell>
  );
}
