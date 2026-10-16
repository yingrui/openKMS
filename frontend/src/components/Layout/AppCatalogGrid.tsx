import { useTranslation } from 'react-i18next';
import { groupModulesByLayer, type AppModule } from '../../config/appModules';

export type AppCatalogGridProps = {
  variant: 'launcher' | 'home';
  modules: AppModule[];
  onSelect: (mod: AppModule) => void;
};

export function AppCatalogGrid({ variant, modules, onSelect }: AppCatalogGridProps) {
  const { t } = useTranslation('layout');

  if (modules.length === 0) return null;

  const renderItem = (mod: AppModule) => {
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
  };

  if (variant === 'launcher') {
    const groups = groupModulesByLayer(modules);
    return (
      <div className="app-catalog--launcher">
        {groups.map((group) => (
          <div key={group.layer} className="app-catalog-section--launcher">
            <div className="app-catalog-section-label">{t(`layer_${group.layer}`)}</div>
            <div className="app-catalog-grid--launcher">
              {group.modules.map(renderItem)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app-catalog--home">
      <div className="app-catalog-grid--home">
        {modules.map(renderItem)}
      </div>
    </div>
  );
}
