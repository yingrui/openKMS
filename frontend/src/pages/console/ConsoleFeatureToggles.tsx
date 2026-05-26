import { useTranslation } from 'react-i18next';
import { useFeatureToggles } from '../../contexts/FeatureTogglesContext';
import type { FeatureToggleKey } from '../../data/featureTogglesApi';
import './ConsoleFeatureToggles.scss';

const FEATURE_IDS: FeatureToggleKey[] = ['evaluations', 'connectors'];

export function ConsoleFeatureToggles() {
  const { t } = useTranslation('console');
  const { toggles, setToggle } = useFeatureToggles();

  return (
    <div className="console-feature-toggles">
      <div className="page-header">
        <h1>{t('featureToggles.pageTitle')}</h1>
        <p className="page-subtitle">{t('featureToggles.subtitle')}</p>
      </div>
      <div className="console-feature-toggles-list">
        {FEATURE_IDS.map((id) => {
          const name = t(`featureToggles.features.${id}.name`);
          return (
            <div key={id} className="console-feature-toggle-item">
              <div className="console-feature-toggle-info">
                <h3>{name}</h3>
                <p>{t(`featureToggles.features.${id}.description`)}</p>
              </div>
              <label className="console-feature-toggle-switch">
                <input
                  type="checkbox"
                  checked={Boolean(toggles[id])}
                  onChange={(e) => setToggle(id, e.target.checked)}
                  aria-label={t('featureToggles.enableAria', { feature: name })}
                />
                <span className="console-feature-toggle-slider" />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
