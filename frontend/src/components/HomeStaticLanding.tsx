import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileStack, FileText, Database, Search, Layers, Zap, Shield, Network, LogIn } from 'lucide-react';

export function HomeStaticLanding({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation('landing');

  const painPoints = useMemo(
    () => [
      {
        icon: Search,
        title: t('pain1Title'),
        text: t('pain1Text'),
      },
      {
        icon: Layers,
        title: t('pain2Title'),
        text: t('pain2Text'),
      },
      {
        icon: Zap,
        title: t('pain3Title'),
        text: t('pain3Text'),
      },
    ],
    [t],
  );

  const benefits = useMemo(
    () => [
      {
        icon: FileStack,
        title: t('ben1Title'),
        text: t('ben1Text'),
      },
      {
        icon: Database,
        title: t('ben2Title'),
        text: t('ben2Text'),
      },
      {
        icon: Shield,
        title: t('ben3Title'),
        text: t('ben3Text'),
      },
    ],
    [t],
  );

  const functionalities = useMemo(
    () => [
      {
        icon: FileStack,
        title: t('funcDocTitle'),
        items: [t('funcDoc1'), t('funcDoc2'), t('funcDoc3'), t('funcDoc4'), t('funcDoc5')],
      },
      {
        icon: FileText,
        title: t('funcArtTitle'),
        items: [t('funcArt1'), t('funcArt2'), t('funcArt3')],
      },
      {
        icon: Database,
        title: t('funcKbTitle'),
        items: [t('funcKb1'), t('funcKb2'), t('funcKb3')],
      },
      {
        icon: Network,
        title: t('funcOntTitle'),
        items: [t('funcOnt1'), t('funcOnt2'), t('funcOnt3')],
      },
      {
        icon: Layers,
        title: t('funcPipeTitle'),
        items: [t('funcPipe1'), t('funcPipe2'), t('funcPipe3')],
      },
    ],
    [t],
  );

  return (
    <div className="home home--public">
      <div className="home-landing">
        <section className="home-hero">
          <h1 className="home-hero-title">{t('heroTitle')}</h1>
          <p className="home-hero-subtitle">{t('heroSubtitle')}</p>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">{t('painTitle')}</h2>
          <p className="home-section-desc">{t('painDesc')}</p>
          <div className="home-cards">
            {painPoints.map(({ icon: Icon, title, text }) => (
              <div key={title} className="home-card home-card-pain">
                <div className="home-card-icon">
                  <Icon size={24} strokeWidth={1.75} />
                </div>
                <h3 className="home-card-title">{title}</h3>
                <p className="home-card-text">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">{t('benefitsTitle')}</h2>
          <p className="home-section-desc">{t('benefitsDesc')}</p>
          <div className="home-cards">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div key={title} className="home-card home-card-benefit">
                <div className="home-card-icon">
                  <Icon size={24} strokeWidth={1.75} />
                </div>
                <h3 className="home-card-title">{title}</h3>
                <p className="home-card-text">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">{t('funcTitle')}</h2>
          <p className="home-section-desc">{t('funcDesc')}</p>
          <div className="home-func-grid">
            {functionalities.map(({ icon: Icon, title, items }) => (
              <div key={title} className="home-func-card">
                <div className="home-func-header">
                  <Icon size={22} strokeWidth={1.75} />
                  <h3 className="home-func-title">{title}</h3>
                </div>
                <ul className="home-func-list">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="home-cta">
          <p>{t('ctaReady')}</p>
          <p className="home-cta-hint">{t('ctaHint')}</p>
          <button type="button" className="btn btn-primary home-static-landing-signin" onClick={onSignIn}>
            <LogIn size={18} />
            <span>{t('signIn')}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
