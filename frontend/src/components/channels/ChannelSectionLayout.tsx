import { Outlet, useLocation } from 'react-router-dom';
import { ContentChannelRail } from './ContentChannelRail';
import { useIsMobile } from '../../hooks/useIsMobile';
import './ChannelSectionLayout.scss';

function ChannelSection({ variant }: { variant: 'documents' | 'articles' | 'media' }) {
  const location = useLocation();
  const isMobile = useIsMobile();

  const basePath = `/${variant}`;
  const isSectionIndex =
    location.pathname === basePath || location.pathname === `${basePath}/`;
  /** Mobile index: full-page channel tree. No drawer on any mobile channel route. */
  const mobileLanding = isMobile && isSectionIndex;
  const showDesktopRail = !isMobile;

  return (
    <div
      className={`channel-section-layout${mobileLanding ? ' channel-section-layout--mobile-landing' : ''}`}
    >
      {showDesktopRail ? (
        <div className="channel-section-layout__rail">
          <ContentChannelRail variant={variant} />
        </div>
      ) : null}
      <div className="channel-section-layout__main app-page-pane">
        {mobileLanding ? <ContentChannelRail variant={variant} /> : <Outlet />}
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
