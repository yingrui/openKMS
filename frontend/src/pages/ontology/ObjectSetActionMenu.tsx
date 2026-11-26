import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import type { ActionApplicability } from '../../data/ontologyActionsApi';

/**
 * Actions, on the objects this exploration selected — or, when the action allows it, on the whole set.
 *
 * Palantir puts three categories in the corner of the perspective — Actions, Open In, Export — and passes the
 * current selection (or all objects) to the action form as prefill. Ours does the same for Actions and refuses to
 * guess: an action over 180 objects because none were ticked is not a mistake you can undo.
 *
 * Every active action is listed, including the ones that cannot apply right now — a vanished action is a capability
 * nobody discovers. What differs is the reason written under it.
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
  /** Run over the whole set — offered only for an action that declares `batch`. */
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

  if (actions.length === 0) return null;

  /** Why this action cannot run on what is currently chosen, or null when it can. */
  const blockedBy = (action: ActionApplicability): string | null => {
    if (action.eligible <= 0) return t('objectSet.actionNoEligible');
    if (action.exclusive && count !== 1) return t('objectSet.actionNeedsOne');
    if (count > 0 && action.per_object && action.selected_eligible === 0) {
      return t('objectSet.actionSelectionIneligible');
    }
    return null;
  };

  const describe = (action: ActionApplicability): string =>
    action.submission_criteria.length > 0
      ? t('objectSet.actionCriteria', { criteria: action.submission_criteria.join(', ') })
      : action.description ?? '';

  const pick = (action: ActionApplicability, onSet: boolean) => {
    setOpen(false);
    if (onSet) onPickSet(action);
    else onPick(action);
  };

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
          ) : (
            <p className="object-set-action-menu__label">{t('objectSet.actionCategory')}</p>
          )}
          {actions.map((action) => {
            const blocked = blockedBy(action);
            /* With nothing selected, an action is offered over the set **only** if its author said it may be. */
            if (count === 0) {
              if (!action.batch || !action.per_object) return null;
              return (
                <button
                  key={`set-${action.id}`}
                  type="button"
                  role="menuitem"
                  disabled={blocked !== null}
                  title={blocked ?? undefined}
                  onClick={() => pick(action, true)}
                >
                  <span className="object-set-action-menu__name">
                    {t('objectSet.actionOnSet', {
                      name: action.display_name,
                      count: action.eligible,
                    })}
                  </span>
                  <span className="object-set-action-menu__desc">{blocked ?? describe(action)}</span>
                </button>
              );
            }
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                disabled={blocked !== null}
                title={blocked ?? undefined}
                onClick={() => pick(action, false)}
              >
                <span className="object-set-action-menu__name">{action.display_name}</span>
                <span className="object-set-action-menu__desc">{blocked ?? describe(action)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
