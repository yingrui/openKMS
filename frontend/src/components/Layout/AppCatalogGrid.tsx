import { useTranslation } from 'react-i18next';
import type { AppModule } from '../../config/appModules';

export type AppCatalogGridProps = {
  variant: 'launcher' | 'home';
  modules: AppModule[];
  onSelect: (mod: AppModule) => void;
};

export function AppCatalogGrid({ variant, modules, onSelect }: AppCatalogGridProps) {
  const { t } = useTranslation('layout');

  if (modules.length === 0) return null;

  return (
    <div className={`app-catalog app-catalog--${variant}`}>
      <div className={`app-catalog-grid app-catalog-grid--${variant}`}>
        {modules.map((mod) => {
          const Icon = mod.icon;
          const label = t(mod.labelKey);
          const tagline = t(mod.taglineKey);
          return (
            <button
              key={mod.id}
              type="button"
              className={`app-catalog-item app-catalog-item--${variant}`}
              onClick={() => onSelect(mod)}
              title={variant === 'launcher' ? label : undefined}
            >
              <span className="app-catalog-item-icon-wrap" aria-hidden>
                <Icon size={variant === 'launcher' ? 24 : 22} strokeWidth={1.75} />
              </span>
              <span className="app-catalog-item-label">{label}</span>
              {variant === 'home' && (
                <span className="app-catalog-item-tagline">{tagline}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
