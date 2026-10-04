import { Link } from 'react-router-dom';
import { Folder, type LucideIcon } from 'lucide-react';
import { flattenChannels, getFirstLeafChannelId, type ChannelNode } from '../../data/channelUtils';
import '../../styles/list-index.scss';

export interface ChannelIndexPageProps {
  /** Section root, e.g. `/articles`. */
  basePath: string;
  channels: ChannelNode[];
  loading: boolean;
  error: string | null;
  itemCount: number | null;
  ItemIcon: LucideIcon;
  BrowseIcon?: LucideIcon;
  labels: {
    loading: string;
    title: string;
    subtitle: string;
    statChannels: string;
    statItems: string;
    quickActions: string;
    manageChannels: string;
    browse: string;
  };
}

/** Landing page for a channel-organized section: channel / item counts and quick links. */
export function ChannelIndexPage({
  basePath,
  channels,
  loading,
  error,
  itemCount,
  ItemIcon,
  BrowseIcon = ItemIcon,
  labels,
}: ChannelIndexPageProps) {
  const channelsPath = `${basePath}/channels`;
  const firstLeafId = getFirstLeafChannelId(channels);
  const browsePath = firstLeafId ? `${channelsPath}/${firstLeafId}` : channelsPath;

  if (loading || error) {
    return (
      <div className="list-index">
        <div className="page-header">
          <p className={error ? 'page-subtitle page-subtitle--error' : 'page-subtitle'}>{error || labels.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="list-index">
      <div className="page-header">
        <h1>{labels.title}</h1>
        <p className="page-subtitle">{labels.subtitle}</p>
      </div>

      <section className="list-index-stats">
        <Link to={channelsPath} className="list-index-stat list-index-stat--channels">
          <div className="list-index-stat-icon">
            <Folder size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{flattenChannels(channels).length}</span>
            <span className="list-index-stat-label">{labels.statChannels}</span>
          </div>
        </Link>
        <Link to={browsePath} className="list-index-stat list-index-stat--items">
          <div className="list-index-stat-icon">
            <ItemIcon size={24} strokeWidth={1.75} />
          </div>
          <div className="list-index-stat-content">
            <span className="list-index-stat-value">{itemCount ?? '–'}</span>
            <span className="list-index-stat-label">{labels.statItems}</span>
          </div>
        </Link>
      </section>

      <div className="list-index-grid">
        <section className="list-index-card">
          <h2>{labels.quickActions}</h2>
          <div className="list-index-quick-actions">
            <Link to={channelsPath} className="list-index-quick-action">
              <Folder size={20} />
              <span>{labels.manageChannels}</span>
            </Link>
            <Link to={browsePath} className="list-index-quick-action">
              <BrowseIcon size={20} />
              <span>{labels.browse}</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
