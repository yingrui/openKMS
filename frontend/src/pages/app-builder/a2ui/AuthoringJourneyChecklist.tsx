import { useTranslation } from 'react-i18next';

export type JourneyStepId =
  | 'resources'
  | 'loaders'
  | 'layout'
  | 'preview'
  | 'publish';

export type JourneyStep = {
  id: JourneyStepId;
  done: boolean;
};

type Props = {
  steps: JourneyStep[];
  onGo: (id: JourneyStepId) => void;
};

export function AuthoringJourneyChecklist({ steps, onGo }: Props) {
  const { t } = useTranslation('appBuilder');
  return (
    <section className="app-builder-design__journey" aria-label={t('journeyTitle')}>
      <h3 className="app-builder-design__data-model-heading">{t('journeyTitle')}</h3>
      <p className="app-builder-page__muted">{t('journeyHint')}</p>
      <ol className="app-builder-design__journey-list">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={
              step.done
                ? 'app-builder-design__journey-item is-done'
                : 'app-builder-design__journey-item'
            }
          >
            <div className="app-builder-design__journey-item-main">
              <span className="app-builder-design__journey-status" aria-hidden>
                {step.done ? '✓' : String(i + 1)}
              </span>
              <div>
                <div className="app-builder-design__journey-label">{t(`journey.${step.id}`)}</div>
                <p className="app-builder-page__muted">{t(`journey.${step.id}Hint`)}</p>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => onGo(step.id)}>
              {t('journeyGo')}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
