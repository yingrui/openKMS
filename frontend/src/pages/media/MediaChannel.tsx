import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Video, Upload, Trash2, Settings, Sparkles, Loader2, Search, X, Folder } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import {
  flattenChannels,
  findChannel,
  getDocumentChannelDescription,
  getDocumentChannelName,
} from '../../data/channelUtils';
import {
  ACCEPTED_MEDIA,
  deleteMediaAsset,
  fetchMediaAssets,
  generateMediaAsset,
  resolveMediaFileUrl,
  uploadMediaAsset,
  type MediaAssetOut,
  type MediaKind,
} from '../../data/mediaApi';
import '../documents/DocumentChannel.scss';
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
  const { channels, loading: chLoading } = useEnsureMediaChannels();
  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelDescription = getDocumentChannelDescription(channels, channelId);
  const currentChannel = findChannel(channels, channelId);

  const [items, setItems] = useState<MediaAssetOut[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | MediaKind>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [genOpen, setGenOpen] = useState<MediaKind | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genModelId, setGenModelId] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!channelId || !channelIds.has(channelId)) {
      setItems([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const res = await fetchMediaAssets({
        channel_id: channelId,
        media_kind: kindFilter === 'all' ? undefined : kindFilter,
        search: debouncedSearch || undefined,
        limit: 200,
      });
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.loadFailed'));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch, channelId, channelIds, kindFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!window.confirm(t('channel.deleteConfirm'))) return;
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

  const onGenerate = async () => {
    if (!genOpen || !channelId || !genPrompt.trim() || !genModelId.trim()) return;
    setGenBusy(true);
    try {
      await generateMediaAsset({
        channel_id: channelId,
        media_kind: genOpen,
        model_id: genModelId.trim(),
        prompt: genPrompt.trim(),
      });
      toast.success(t('channel.generateStarted'));
      setGenOpen(null);
      setGenPrompt('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.generateFailed'));
    } finally {
      setGenBusy(false);
    }
  };

  const selectedCount = selected.size;

  if (chLoading) {
    return (
      <div className="documents">
        <div className="page-header">
          <p className="page-subtitle">{t('channel.loadingChannels')}</p>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="documents">
        <div className="documents-empty-state">
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
      <div className="documents">
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
    <div className="documents">
      <div className="page-header documents-header">
        <div>
          <div className="documents-header-title">
            <h1>{channelName}</h1>
          </div>
          <p className="page-subtitle">
            {channelDescription?.trim() ? channelDescription : t('channel.defaultDescription')}
          </p>
        </div>
        <div className="documents-header-actions">
          <Link to={`/media/channels/${channelId}/settings`} className="btn btn-secondary">
            <Settings size={18} />
            <span>{t('channel.settings')}</span>
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setGenOpen('image');
              setGenModelId(currentChannel?.default_image_model_id || '');
            }}
          >
            <Sparkles size={18} />
            <span>{t('channel.createImage')}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setGenOpen('video');
              setGenModelId(currentChannel?.default_video_model_id || '');
            }}
          >
            <Sparkles size={18} />
            <span>{t('channel.createVideo')}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={18} />
            <span>{t('channel.upload')}</span>
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

      <div className="documents-main">
        <div className="documents-toolbar">
          <div className="documents-search">
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
          <div className="documents-bulk-bar" role="toolbar" aria-label={t('channel.selectedCount', { count: selectedCount })}>
            <span className="documents-bulk-count">{t('channel.selectedCount', { count: selectedCount })}</span>
            <div className="documents-bulk-actions">
              <button type="button" className="btn btn-secondary btn-sm documents-bulk-delete" onClick={() => void onBulkDelete()}>
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
            <Loader2 size={24} className="documents-loading-spinner" />
            <span>{t('channel.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="media-empty-wrap documents-empty">
            <Image size={48} strokeWidth={1.25} />
            <p className="documents-empty-hint">{t('channel.empty')}</p>
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

      {genOpen && (
        <div className="media-modal-backdrop" role="presentation" onClick={() => !genBusy && setGenOpen(null)}>
          <div className="media-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{genOpen === 'image' ? t('channel.createImage') : t('channel.createVideo')}</h2>
            <div className="media-detail-field">
              <label className="media-detail-field-label" htmlFor="media-gen-prompt">{t('channel.generatePrompt')}</label>
              <textarea
                id="media-gen-prompt"
                className="document-detail-metadata-input media-detail-textarea"
                rows={4}
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
              />
            </div>
            <div className="media-detail-field">
              <label className="media-detail-field-label" htmlFor="media-gen-model">{t('channel.generateModel')}</label>
              <input
                id="media-gen-model"
                type="text"
                className="document-detail-metadata-input"
                value={genModelId}
                onChange={(e) => setGenModelId(e.target.value)}
              />
            </div>
            <div className="media-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={genBusy} onClick={() => setGenOpen(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-primary" disabled={genBusy} onClick={() => void onGenerate()}>
                {genBusy ? <Loader2 size={16} className="documents-loading-spinner" /> : t('channel.generateSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
