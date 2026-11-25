import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import type { ActionApplicability } from '../../data/ontologyActionsApi';

/**
 * Actions, on the objects this exploration selected.
 *
 * Palantir puts three categories in the corner of the perspective — Actions, Open In, Export — and passes the
 * current selection (or all objects) to the action form as prefill. Ours does the same for Actions and refuses to
 * guess the selection: an action over 180 objects because none were ticked is not a mistake you can undo.
 */
export function ObjectSetActionMenu({
  actions,
  count,
  onPick,
  onPickSet,
}: {
  actions: ActionApplicability[];
  count: number;
  onPick: (action: ActionApplicability) => void;
  /** Run over the whole set — offered only where the action is applicable to at least one object in it. */
  onPickSet: (action: ActionApplicability) => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* An action whose submission criteria exclude this set cannot be offered: the menu is the promise, the executor
     keeps it. */
  const offered = actions.filter((action) => action.eligible > 0);
  if (offered.length === 0 && actions.length === 0) return null;

  return (
    <div className="object-set-action-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Zap size={14} aria-hidden />
        {count > 0 ? t('objectSet.actionTitleCount', { count }) : t('objectSet.actionTitle')}
      </button>
      {open ? (
        <div className="object-set-action-menu__panel" role="menu">
          {count === 0 ? (
            /* A disabled button explains nothing. Opening the menu and saying what is missing is the same refusal,
               with the instruction attached. */
            <p className="object-set-action-menu__label">{t('objectSet.actionNeedsSelection')}</p>
          ) : null}
          {count > 0 ? (
            <p className="object-set-action-menu__label">{t('objectSet.actionCategory')}</p>
          ) : null}
          {offered.length === 0 ? (
            <p className="object-set-action-menu__label">{t('objectSet.actionNoEligible')}</p>
          ) : null}
          {count === 0
            ? offered.map((action) => (
                <button
                  key={`set-${action.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onPickSet(action);
                  }}
                >
                  <span className="object-set-action-menu__name">
                    {t('objectSet.actionOnSet', { name: action.display_name, count: action.eligible })}
                  </span>
                  <span className="object-set-action-menu__desc">
                    {action.submission_criteria.length > 0
                      ? t('objectSet.actionCriteria', {
                          criteria: action.submission_criteria.join(', '),
                        })
                      : action.description ?? ''}
                  </span>
                </button>
              ))
            : null}
          {count > 0
            ? offered.map((action) => {
                const blocked = action.selected_eligible === 0;
                return (
            <button
              key={action.id}
                  type="button"
                  role="menuitem"
                  disabled={blocked}
                  title={blocked ? t('objectSet.actionSelectionIneligible') : undefined}
                  onClick={() => {
                    setOpen(false);
                    onPick(action);
                  }}
                >
                  <span className="object-set-action-menu__name">{action.display_name}</span>
                  <span className="object-set-action-menu__desc">
                    {blocked
                      ? t('objectSet.actionSelectionIneligible')
                      : action.submission_criteria.length > 0
                        ? t('objectSet.actionCriteria', {
                            criteria: action.submission_criteria.join(', '),
                          })
                        : action.description ?? ''}
                  </span>
                </button>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}
