import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Circle, Loader2, X } from 'lucide-react';

export type AgentTodoItem = {
  content: string;
  status: string;
};

function normalizeTodos(raw: unknown[]): AgentTodoItem[] {
  return raw.map((item, i) => {
    if (typeof item === 'string') {
      return { content: item, status: 'pending' };
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const content = String(o.content ?? o.title ?? o.text ?? o.description ?? `Step ${i + 1}`);
      const status = String(o.status ?? 'pending').toLowerCase();
      return { content, status };
    }
    return { content: String(item), status: 'pending' };
  });
}

function isDone(status: string): boolean {
  return status === 'completed' || status === 'done' || status === 'complete';
}

function isActive(status: string): boolean {
  return status === 'in_progress' || status === 'in-progress' || status === 'active' || status === 'running';
}

function statusLabel(t: (key: string) => string, status: string): string {
  if (isDone(status)) return t('chat.planStatusCompleted');
  if (isActive(status)) return t('chat.planStatusInProgress');
  return t('chat.planStatusPending');
}

interface Props {
  todos: unknown[];
  loading?: boolean;
  revision?: number;
  onDismiss?: () => void;
}

export function AgentPlanPanel({ todos, loading = false, revision = 1, onDismiss }: Props) {
  const { t } = useTranslation('agents');
  const items = useMemo(() => normalizeTodos(todos), [todos]);
  const doneCount = items.filter((item) => isDone(item.status)).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const hasActive = items.some((item) => isActive(item.status));
  const staleSnapshot =
    loading && revision <= 1 && hasActive && doneCount === 0 && items.length > 1;
  const [open, setOpen] = useState(() => hasActive || !allDone);

  useEffect(() => {
    if (allDone && !loading) {
      setOpen(false);
    }
  }, [allDone, loading]);

  if (!items.length) return null;

  return (
    <section className="agents-plan-panel" aria-label={t('chat.todos')}>
      <div className="agents-plan-panel__header">
        <button
          type="button"
          className="agents-plan-panel__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="agents-plan-panel-body"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={`agents-plan-panel__chevron${open ? ' agents-plan-panel__chevron--open' : ''}`}
            aria-hidden
          />
          <span className="agents-plan-panel__title">{t('chat.todos')}</span>
          <span className="agents-plan-panel__progress">
            {loading && !allDone
              ? t('chat.planWorking', { done: doneCount, total: items.length })
              : t('chat.planProgress', { done: doneCount, total: items.length })}
          </span>
        </button>
        {onDismiss ? (
          <button
            type="button"
            className="agents-plan-panel__close"
            onClick={onDismiss}
            aria-label={t('chat.planCloseAria')}
            title={t('chat.planClose')}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <ol id="agents-plan-panel-body" className="agents-plan-panel__list">
          {items.map((item, i) => {
            const done = isDone(item.status);
            const active = isActive(item.status) && !staleSnapshot;
            const statusClass = done
              ? 'agents-plan-panel__item--done'
              : active
                ? 'agents-plan-panel__item--active'
                : 'agents-plan-panel__item--pending';
            return (
              <li
                key={`${i}-${item.content.slice(0, 24)}`}
                className={`agents-plan-panel__item ${statusClass}`}
              >
                <span className="agents-plan-panel__status" aria-hidden>
                  {done ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : active ? (
                    <Loader2 size={14} strokeWidth={2.5} className="agents-plan-panel__spinner" />
                  ) : (
                    <Circle size={14} strokeWidth={2} />
                  )}
                </span>
                <span className="agents-plan-panel__text">{item.content}</span>
                <span className="sr-only">{statusLabel(t, item.status)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
