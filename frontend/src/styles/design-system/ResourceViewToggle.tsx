import { LayoutGrid, List, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ResourceViewToggleMode = 'card' | 'list' | 'graph';

const ICONS = {
  card: LayoutGrid,
  list: List,
  graph: Network,
} as const;

export type ResourceViewToggleProps<M extends ResourceViewToggleMode = ResourceViewToggleMode> = {
  modes: readonly M[];
  value: M;
  onChange: (mode: M) => void;
  className?: string;
  /**
   * Override a mode's word when the page has a better one (`依赖图` instead of `图谱`). The title and the
   * aria label follow `viewMode.*` unless overridden here too — a page-local word still ships one label.
   */
  labels?: Partial<Record<M, string>>;
};

export function ResourceViewToggle<const M extends ResourceViewToggleMode>({
  modes,
  value,
  onChange,
  className,
  labels,
}: ResourceViewToggleProps<M>) {
  const { t } = useTranslation('common');
  return (
    <div
      className={['ds-view-toggle', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={t('viewMode.aria')}
    >
      {modes.map((mode) => {
        const Icon = ICONS[mode as ResourceViewToggleMode];
        return (
          <button
            key={mode}
            type="button"
            className={`ds-view-toggle__btn${value === mode ? ' active' : ''}`}
            onClick={() => onChange(mode)}
            title={labels?.[mode] ?? t(`viewMode.${mode}Title`)}
            aria-pressed={value === mode}
          >
            <Icon size={16} aria-hidden />
            <span>{labels?.[mode] ?? t(`viewMode.${mode}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
