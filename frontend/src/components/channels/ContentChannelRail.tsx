import { useEffect, useMemo, useState, startTransition } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { useArticleChannels } from '../../contexts/ArticleChannelsContext';
import { useDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { useMediaChannels } from '../../contexts/MediaChannelsContext';
import { getAllExpandableChannelIds, getFirstLeafChannelId } from '../../data/channelUtils';
import { ChannelTree } from './ChannelTree';
import './ContentChannelRail.scss';

type Variant = 'articles' | 'documents' | 'media';

const VARIANT_CONFIG: Record<
  Variant,
  { basePath: string; titleKey: string; manageKey: string; pathPattern: RegExp }
> = {
  documents: {
    basePath: '/documents',
    titleKey: 'channelRailDocuments',
    manageKey: 'manageChannels',
    pathPattern: /^\/documents\/channels\/([^/]+)/,
  },
  articles: {
    basePath: '/articles',
    titleKey: 'channelRailArticles',
    manageKey: 'manageChannels',
    pathPattern: /^\/articles\/channels\/([^/]+)/,
  },
  media: {
    basePath: '/media',
    titleKey: 'channelRailMedia',
    manageKey: 'manageMediaChannels',
    pathPattern: /^\/media\/channels\/([^/]+)/,
  },
};

export function ContentChannelRail({ variant }: { variant: Variant }) {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const { channels: documentChannels, ensureLoaded: ensureDocumentChannels } = useDocumentChannels();
  const { channels: articleChannels, ensureLoaded: ensureArticleChannels } = useArticleChannels();
  const { channels: mediaChannels, ensureLoaded: ensureMediaChannels } = useMediaChannels();

  const config = VARIANT_CONFIG[variant];
  const channels =
    variant === 'documents'
      ? documentChannels
      : variant === 'articles'
        ? articleChannels
        : mediaChannels;
  const title = t(config.titleKey);
  const manageLabel = t(config.manageKey);

  const channelMatch = location.pathname.match(config.pathPattern);
  const defaultChannel = getFirstLeafChannelId(channels);
  const selectedId = channelMatch?.[1] ?? defaultChannel;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (variant === 'documents') void ensureDocumentChannels();
    else if (variant === 'articles') void ensureArticleChannels();
    else void ensureMediaChannels();
  }, [variant, ensureDocumentChannels, ensureArticleChannels, ensureMediaChannels]);

  useEffect(() => {
    if (!channels.length) return;
    const expandableIds = getAllExpandableChannelIds(channels);
    startTransition(() => {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const id of expandableIds) {
          next[id] = true;
        }
        return next;
      });
    });
  }, [channels]);

  const manageHref = useMemo(() => `${config.basePath}/channels`, [config.basePath]);

  const onSelect = (id: string) => {
    navigate(`${config.basePath}/channels/${id}`);
  };

  return (
    <aside className="content-channel-rail" aria-label={title}>
      <div className="content-channel-rail-head">
        <div className="content-channel-rail-title-row">
          <h2 className="content-channel-rail-title">{title}</h2>
          <Link
            to={manageHref}
            className="content-channel-rail-settings"
            title={manageLabel}
            aria-label={manageLabel}
          >
            <Settings size={16} strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      <div className="content-channel-rail-scroll">
        {channels.length > 0 ? (
          <ChannelTree
            channels={channels}
            selectedId={selectedId}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={(id) => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
          />
        ) : (
          <p className="content-channel-rail-empty">{t('channelRailEmpty')}</p>
        )}
      </div>
    </aside>
  );
}
