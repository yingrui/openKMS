import { Outlet } from 'react-router-dom';
import { ContentChannelRail } from './ContentChannelRail';
import './ChannelSectionLayout.scss';

export function DocumentsSectionLayout() {
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="documents" />
      <div className="channel-section-layout__main app-page-pane">
        <Outlet />
      </div>
    </div>
  );
}

export function ArticlesSectionLayout() {
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="articles" />
      <div className="channel-section-layout__main app-page-pane">
        <Outlet />
      </div>
    </div>
  );
}

export function MediaSectionLayout() {
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="media" />
      <div className="channel-section-layout__main app-page-pane">
        <Outlet />
      </div>
    </div>
  );
}
