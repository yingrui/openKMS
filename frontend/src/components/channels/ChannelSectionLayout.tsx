import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMobileShell } from '../../contexts/MobileShellContext';
import { ContentChannelRail } from './ContentChannelRail';
import './ChannelSectionLayout.scss';

function ChannelSection({ variant }: { variant: 'documents' | 'articles' | 'media' }) {
  const { t } = useTranslation('layout');
  const { channelRailOpen, setChannelRailAvailable, closeRails } = useMobileShell();

  useEffect(() => {
    setChannelRailAvailable(true);
    return () => setChannelRailAvailable(false);
  }, [setChannelRailAvailable]);

  return (
    <div className="channel-section-layout">
      {channelRailOpen ? (
        <button
          type="button"
          className="mobile-rail-backdrop"
          aria-label={t('closeNavRail')}
          onClick={closeRails}
        />
      ) : null}
      <div
        className={`channel-section-layout__rail${channelRailOpen ? ' is-open' : ''}`}
        id="channel-nav-rail-drawer"
      >
        <ContentChannelRail variant={variant} />
      </div>
      <div className="channel-section-layout__main app-page-pane">
        <Outlet />
      </div>
    </div>
  );
}

export function DocumentsSectionLayout() {
  return <ChannelSection variant="documents" />;
}

export function ArticlesSectionLayout() {
  return <ChannelSection variant="articles" />;
}

export function MediaSectionLayout() {
  return <ChannelSection variant="media" />;
}
