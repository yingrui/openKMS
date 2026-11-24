import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './ExplorerSectionSwitch.scss';

/**
 * The explorer's two sections: the explorations themselves, and the Cypher workspace.
 *
 * They used to be a 220px rail with two items, which cost a fifth of the width to say "there are two pages".
 * A two-item strip above the content says the same and keeps the space for the content.
 */
export function ExplorerSectionSwitch() {
  const { t } = useTranslation('explore');
  const items = [
    { to: '/object-explorer/explorations', label: t('explorerSections.explorations') },
    { to: '/object-explorer/explore', label: t('explorerSections.query') },
  ];
  return (
    <nav className="explorer-switch" aria-label={t('explorerSections.aria')}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `explorer-switch__item${isActive ? ' is-active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
