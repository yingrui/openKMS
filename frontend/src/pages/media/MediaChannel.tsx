import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Video, Upload, Trash2, Settings, Sparkles, Loader2, Search, X, Folder, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import {
  flattenChannels,
  getDocumentChannelDescription,
  getDocumentChannelName,
} from '../../data/channelUtils';
import {
  ACCEPTED_MEDIA,
  deleteMediaAsset,
  fetchMediaAssets,
  resolveMediaFileUrl,
  uploadMediaAsset,
  type MediaAssetOut,
  type MediaKind,
} from '../../data/mediaApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useListFetch } from '../../hooks/useListFetch';
import '../../styles/channel-page.scss';
import './Media.scss';

function MediaThumb({ asset }: { asset: MediaAssetOut }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const path =
      asset.media_kind === 'video'
        ? asset.poster_key || asset.thumbnail_key
        : asset.thumbnail_key || asset.storage_key;
    if (!path) return;
    void resolveMediaFileUrl(asset.id, path).then(setUrl).catch(() => setUrl(null));
  }, [asset]);
  if (!url) {
    return asset.media_kind === 'video' ? <Video size={32} strokeWidth={1.5} /> : <Image size={32} strokeWidth={1.5} />;
  }
  return <img src={url} alt="" loading="lazy" />;
}

export function MediaChannel() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const confirm = useConfirm();
  const { channels, loading: chLoading } = useEnsureMediaChannels();
  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelDescription = getDocumentChannelDescription(channels, channelId);

  const [kindFilter, setKindFilter] = useState<'all' | MediaKind>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const listFilters = useMemo(
    () => ({ channelId, channelReady: channelIds.has(channelId), kindFilter, search: debouncedSearch }),
    [channelId, channelIds, kindFilter, debouncedSearch],
  );

  const {
    items,
    loading: listLoading,
    error: listFetchError,
    reload: load,
  } = useListFetch({
    fetcher: async ({ channelId, channelReady, kindFilter, search }) => {
      if (!channelId || !channelReady) return { items: [], total: 0 };
      const res = await fetchMediaAssets({
        channel_id: channelId,
        media_kind: kindFilter === 'all' ? undefined : kindFilter,
        search: search || undefined,
        limit: 200,
      });
      return { items: res.items, total: res.items.length };
    },
    filters: listFilters,
    pageSize: 200,
  });

  useEffect(() => {
    if (listFetchError) toast.error(listFetchError.message || t('channel.loadFailed'));
  }, [listFetchError, t]);

  useEffect(() => {
    setSelected(new Set());
  }, [channelId, debouncedSearch, kindFilter]);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length || !channelId) return;
    for (const file of Array.from(files)) {
      try {
        await uploadMediaAsset(channelId, file);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('channel.uploadFailed'));
      }
    }
    await load();
  };

  const onBulkDelete = async () => {
    if (selected.size === 0) return;
    if (
      !(await confirm({
        title: t('channel.bulkDelete'),
        message: t('channel.deleteConfirm'),
        confirmLabel: t('channel.bulkDelete'),
        danger: true,
      }))
    )
      return;
    for (const id of selected) {
      try {
        await deleteMediaAsset(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('channel.deleteFailed'));
      }
    }
    setSelected(new Set());
    await load();
  };

  const selectedCount = selected.size;

  if (chLoading) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="channel-page">
        <div className="channel-page-empty-state">
          <Folder size={64} />
          <h2>{t('channels.emptyTitle')}</h2>
          <p>{t('channels.emptyHint')}</p>
          <Link to="/media/channels" className="btn btn-primary">
            <Folder size={18} />
            <span>{t('index.manageChannels')}</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!channelId || !channelIds.has(channelId)) {
    return (
      <div className="channel-page">
        <div className="page-header">
          <h1>{t('channel.notFoundTitle')}</h1>
          <p className="page-subtitle">{t('channel.notFoundSubtitle')}</p>
          <Link to="/media/channels" className="btn btn-secondary openkms-link-spaced">
            {t('channel.backToChannels')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="channel-page">
      <Link to="/media" className="channel-browse-back">
        <ArrowLeft size={16} strokeWidth={1.75} />
        <span>{t('channel.backToTree')}</span>
      </Link>
      <div className="page-header channel-page-header">
        <div>
          <div className="channel-page-header-title">
            <h1>{channelName}</h1>
          </div>
          <p className="page-subtitle">
            {channelDescription?.trim() ? channelDescription : t('channel.defaultDescription')}
          </p>
        </div>
        <div className="channel-page-header-actions">
          <Link to={`/media/channels/${channelId}/settings`} className="btn btn-secondary">
            <Settings size={18} />
            <span className="ds-compact-label">{t('channel.settings')}</span>
          </Link>
          <Link to={`/media/channels/${channelId}/generate`} className="btn btn-secondary">
            <Sparkles size={18} />
            <span className="ds-compact-label">{t('channel.generateWithAI')}</span>
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={18} />
            <span className="ds-compact-label">{t('channel.upload')}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_MEDIA}
            multiple
            hidden
            onChange={(e) => void onUpload(e.target.files)}
          />
        </div>
      </div>

      <div className="channel-page-main">
        <div className="channel-page-toolbar">
          <div className="channel-page-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={t('channel.searchAria')}
              placeholder={t('channel.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label={t('channel.filterKindAria')}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | MediaKind)}
          >
            <option value="all">{t('channel.filterAll')}</option>
            <option value="image">{t('channel.filterImages')}</option>
            <option value="video">{t('channel.filterVideos')}</option>
          </select>
        </div>

        {selectedCount > 0 && (
          <div className="channel-page-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: selectedCount })}>
            <span className="channel-page-bulk-count">{t('channel.selectedCount', { count: selectedCount })}</span>
            <div className="channel-page-bulk-actions">
              <button type="button" className="btn btn-secondary btn-sm channel-page-bulk-delete" onClick={() => void onBulkDelete()}>
                <Trash2 size={16} />
                <span>{t('channel.bulkDelete')}</span>
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
                <X size={16} />
                <span>{t('channel.clearSelection')}</span>
              </button>
            </div>
          </div>
        )}

        {listLoading ? (
          <div className="media-loading-wrap">
            <Loader2 size={24} className="channel-page-spinner" />
            <span>{t('channel.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="media-empty-wrap channel-page-empty">
            <Image size={48} strokeWidth={1.25} />
            <p className="channel-page-empty-hint">{t('channel.empty')}</p>
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} />
              <span>{t('channel.upload')}</span>
            </button>
          </div>
        ) : (
          <div className="media-grid-wrap">
            <div className="media-grid">
            {items.map((asset) => {
              const isSelected = selected.has(asset.id);
              return (
                <div
                  key={asset.id}
                  className={`media-card${isSelected ? ' media-card--selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/media/view/${asset.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/media/view/${asset.id}`)}
                >
                  <div className="media-card__select" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={t('channel.selectAssetAria', { name: asset.title })}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(asset.id)) next.delete(asset.id);
                          else next.add(asset.id);
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className="media-card__thumb">
                    <MediaThumb asset={asset} />
                  </div>
                  <div className="media-card__body">
                    <div className="media-card__title">{asset.title}</div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
