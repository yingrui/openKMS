import { Outlet } from 'react-router-dom';
import { useSidebarLayout } from '../../contexts/SidebarLayoutContext';
import { ContentChannelRail } from './ContentChannelRail';
import './ChannelSectionLayout.scss';

export function DocumentsSectionLayout() {
  const { sidebarCollapsed } = useSidebarLayout();
  if (!sidebarCollapsed) {
    return <Outlet />;
  }
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="documents" />
      <div className="channel-section-layout__main">
        <Outlet />
      </div>
    </div>
  );
}

export function ArticlesSectionLayout() {
  const { sidebarCollapsed } = useSidebarLayout();
  if (!sidebarCollapsed) {
    return <Outlet />;
  }
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="articles" />
      <div className="channel-section-layout__main">
        <Outlet />
      </div>
    </div>
  );
}

export function MediaSectionLayout() {
  const { sidebarCollapsed } = useSidebarLayout();
  if (!sidebarCollapsed) {
    return <Outlet />;
  }
  return (
    <div className="channel-section-layout">
      <ContentChannelRail variant="media" />
      <div className="channel-section-layout__main">
        <Outlet />
      </div>
    </div>
  );
}
