import { LayoutGrid, List, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ResourceViewToggleMode = 'card' | 'list' | 'graph';

const ICONS = {
  card: LayoutGrid,
  list: List,
  graph: Network,
} as const;

export type ResourceViewToggleProps = {
  modes: ResourceViewToggleMode[];
  value: ResourceViewToggleMode;
  onChange: (mode: ResourceViewToggleMode) => void;
  className?: string;
};

export function ResourceViewToggle({ modes, value, onChange, className }: ResourceViewToggleProps) {
  const { t } = useTranslation('common');
  return (
    <div
      className={['ds-view-toggle', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={t('viewMode.aria')}
    >
      {modes.map((mode) => {
        const Icon = ICONS[mode];
        return (
          <button
            key={mode}
            type="button"
            className={`ds-view-toggle__btn${value === mode ? ' active' : ''}`}
            onClick={() => onChange(mode)}
            title={t(`viewMode.${mode}Title`)}
            aria-pressed={value === mode}
          >
            <Icon size={16} aria-hidden />
            <span>{t(`viewMode.${mode}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
