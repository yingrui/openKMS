import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Video, Upload, Trash2, Settings, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { flattenChannels, getDocumentChannelName } from '../../data/channelUtils';
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
    return asset.media_kind === 'video' ? <Video size={32} /> : <Image size={32} />;
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
  const flatChannels = flattenChannels(channels);
  const currentChannel = flatChannels.find((c) => c.id === channelId);

  const [items, setItems] = useState<MediaAssetOut[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | MediaKind>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [genOpen, setGenOpen] = useState<MediaKind | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genModelId, setGenModelId] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        search: search.trim() || undefined,
        limit: 200,
      });
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.loadFailed'));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [channelId, channelIds, kindFilter, search, t]);

  useEffect(() => {
    void load();
  }, [load]);

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
        toast.error(e instanceof Error ? e.message : 'Delete failed');
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
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenBusy(false);
    }
  };

  if (chLoading) {
    return <div className="document-channel"><p>{t('index.title')}</p></div>;
  }

  if (!channelIds.has(channelId)) {
    return (
      <div className="document-channel">
        <Link to="/media/channels">{t('channel.backToChannels')}</Link>
        <p>Collection not found</p>
      </div>
    );
  }

  return (
    <div className="document-channel">
      <div className="document-channel-header">
        <div>
          <Link to="/media/channels" className="document-channel-back">{t('channel.backToChannels')}</Link>
          <h1>{channelName}</h1>
        </div>
        <div className="document-channel-actions">
          <Link to={`/media/channels/${channelId}/settings`} className="btn btn-secondary">
            <Settings size={16} /> {t('channel.settings')}
          </Link>
        </div>
      </div>

      <div className="media-toolbar">
        <input
          type="search"
          className="document-channel-search"
          placeholder={t('channel.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as 'all' | MediaKind)}>
          <option value="all">{t('channel.filterAll')}</option>
          <option value="image">{t('channel.filterImages')}</option>
          <option value="video">{t('channel.filterVideos')}</option>
        </select>
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {t('channel.upload')}
        </button>
        <input ref={fileRef} type="file" accept={ACCEPTED_MEDIA} multiple hidden onChange={(e) => void onUpload(e.target.files)} />
        <button type="button" className="btn btn-secondary" onClick={() => { setGenOpen('image'); setGenModelId(currentChannel?.default_image_model_id || ''); }}>
          <Sparkles size={16} /> {t('channel.createImage')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setGenOpen('video'); setGenModelId(currentChannel?.default_video_model_id || ''); }}>
          <Sparkles size={16} /> {t('channel.createVideo')}
        </button>
        {selected.size > 0 && (
          <button type="button" className="btn btn-danger" onClick={() => void onBulkDelete()}>
            <Trash2 size={16} /> ({selected.size})
          </button>
        )}
      </div>

      {listLoading ? (
        <p><Loader2 className="spin" size={20} /></p>
      ) : items.length === 0 ? (
        <p className="page-subtitle">{t('channel.empty')}</p>
      ) : (
        <div className="media-grid">
          {items.map((asset) => (
            <div
              key={asset.id}
              className="media-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/media/view/${asset.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/media/view/${asset.id}`)}
            >
              <div className="media-card__thumb" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(asset.id)}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(asset.id)) next.delete(asset.id);
                      else next.add(asset.id);
                      return next;
                    });
                  }}
                />
                <MediaThumb asset={asset} />
              </div>
              <div className="media-card__body">
                <div className="media-card__title">{asset.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {genOpen && (
        <div className="media-modal-backdrop" role="presentation" onClick={() => setGenOpen(null)}>
          <div className="media-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{genOpen === 'image' ? t('channel.createImage') : t('channel.createVideo')}</h2>
            <label>{t('channel.generatePrompt')}</label>
            <textarea rows={4} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
            <label>{t('channel.generateModel')}</label>
            <input type="text" value={genModelId} onChange={(e) => setGenModelId(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setGenOpen(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={genBusy} onClick={() => void onGenerate()}>
                {genBusy ? <Loader2 className="spin" size={16} /> : t('channel.generateSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
