import { useTranslation } from 'react-i18next';
import type { ExplorationLayoutChoice } from '../../data/explorationsApi';

/**
 * The layout menu: which chart order this type opens with, and where that choice is stored.
 *
 * Three separate ideas share one menu because they answer the same question — "what should this type look like next
 * time" — and because the alternative is a settings page for a list of charts. Choosing an existing layout is
 * instant; saving is the choice being written down, for this caller or (with permission) for everyone.
 */
export function ExplorationLayoutMenu({
  open,
  choices,
  saving,
  isAdmin,
  onToggle,
  onUse,
  onSave,
  onReset,
}: {
  open: boolean;
  choices: ExplorationLayoutChoice[];
  saving: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onUse: (choice: ExplorationLayoutChoice) => void;
  onSave: (scope?: 'personal' | 'global') => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <div className="object-set-layout-menu">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        onClick={onToggle}
        title={t('objectSet.layoutSavedHint')}
      >
        {t('objectSet.layoutTitle')}
      </button>
      {open ? (
        <div className="object-set-layout-menu__panel" role="menu">
          {choices.length > 0 ? (
            <p className="object-set-layout-menu__label">{t('objectSet.layoutAvailable')}</p>
          ) : null}
          {choices.map((choice) => (
            <button
              key={choice.scope}
              type="button"
              role="menuitem"
              onClick={() => onUse(choice)}
            >
              {choice.scope === 'global'
                ? t('objectSet.layoutUseGlobal')
                : t('objectSet.layoutUseMine')}
            </button>
          ))}
          <button type="button" role="menuitem" disabled={saving} onClick={() => onSave()}>
            {t('objectSet.layoutSave')}
          </button>
          {isAdmin ? (
            <button
              type="button"
              role="menuitem"
              disabled={saving}
              onClick={() => onSave('global')}
            >
              {t('objectSet.layoutSaveGlobal')}
            </button>
          ) : null}
          <button type="button" role="menuitem" disabled={saving} onClick={onReset}>
            {t('objectSet.layoutResetButton')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
