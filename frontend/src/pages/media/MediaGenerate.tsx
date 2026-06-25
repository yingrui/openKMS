import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Image as ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { findChannel, getDocumentChannelName } from '../../data/channelUtils';
import {
  fetchMediaAssets,
  generateMediaAsset,
  resolveMediaFileUrl,
  uploadTempMedia,
  type MediaAssetOut,
  type MediaKind,
} from '../../data/mediaApi';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import '../documents/DocumentChannel.scss';
import './MediaGenerate.scss';

function PickerThumb({ asset }: { asset: MediaAssetOut }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const path = asset.thumbnail_key || asset.storage_key;
    if (!path) return;
    void resolveMediaFileUrl(asset.id, path).then(setUrl).catch(() => setUrl(null));
  }, [asset]);
  if (!url) return <ImageIcon size={24} strokeWidth={1.5} />;
  return <img src={url} alt="" loading="lazy" />;
}

export function MediaGenerate() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, loading: chLoading } = useEnsureMediaChannels();
  const channelName = getDocumentChannelName(channels, channelId);
  const currentChannel = findChannel(channels, channelId);

  const [mediaKind, setMediaKind] = useState<MediaKind>('image');
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [size, setSize] = useState('1920x1080');
  const [quality, setQuality] = useState('speed');
  const [duration, setDuration] = useState(5);
  const [fps, setFps] = useState(30);
  const [withAudio, setWithAudio] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [imageModels, setImageModels] = useState<ApiModelResponse[]>([]);
  const [videoModels, setVideoModels] = useState<ApiModelResponse[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  const imageFileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerImages, setPickerImages] = useState<MediaAssetOut[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    (async () => {
      try {
        const res = await fetchMediaAssets({ channel_id: channelId, media_kind: 'image', limit: 50 });
        setPickerImages(res.items);
      } catch { /* ignore */ }
    })();
  }, [channelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setModelsLoading(true);
      try {
        const [images, videos] = await Promise.all([
          fetchAllModels({ api_kind: 'image-generate' }),
          fetchAllModels({ api_kind: 'video-generate' }),
        ]);
        if (!cancelled) {
          setImageModels(images);
          setVideoModels(videos);
          if (images.length > 0 && !modelId) {
            const preferred = currentChannel?.default_image_model_id;
            setModelId(preferred && images.some((m) => m.id === preferred) ? preferred : images[0].id);
            if (images.length > 0 && !videoModels.length) setMediaKind('image');
            else if (videos.length > 0) setMediaKind('video');
          }
        }
      } catch {
        if (!cancelled) {
          setImageModels([]);
          setVideoModels([]);
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setSize(mediaKind === 'video' ? '1920x1080' : '1024x1024');
  }, [mediaKind]);

  const pickDefaultModel = useCallback((kind: MediaKind) => {
    const models = kind === 'image' ? imageModels : videoModels;
    if (models.length === 0) return '';
    const preferred = kind === 'image'
      ? currentChannel?.default_image_model_id
      : currentChannel?.default_video_model_id;
    if (preferred && models.some((m) => m.id === preferred)) return preferred;
    const catDefault = models.find((m) => m.is_default_in_category);
    return catDefault?.id ?? models[0].id;
  }, [currentChannel, imageModels, videoModels]);

  const switchKind = useCallback((kind: MediaKind) => {
    setMediaKind(kind);
    const defaultId = pickDefaultModel(kind);
    if (defaultId) setModelId(defaultId);
  }, [pickDefaultModel]);

  const activeModels = mediaKind === 'image' ? imageModels : videoModels;

  const handleImageFile = useCallback(async (file: File) => {
    if (!channelId) return;
    setImageUploading(true);
    try {
      const { url } = await uploadTempMedia(channelId, file);
      setImageUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.uploadFailed'));
    } finally {
      setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = '';
    }
  }, [channelId, t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void handleImageFile(file);
    }
  }, [handleImageFile]);

  const onGenerate = async () => {
    if (!channelId || !modelId) return;
    if (!prompt.trim() && !imageUrl.trim()) return;
    setBusy(true);
    try {
      const { job_id } = await generateMediaAsset({
        channel_id: channelId,
        media_kind: mediaKind,
        model_id: modelId,
        prompt: prompt.trim(),
        size,
        quality,
        duration,
        fps,
        with_audio: withAudio,
        image_url: imageUrl.trim() || undefined,
      });
      toast.success(t('channel.generateStarted', { jobId: job_id }));
      navigate(`/job-runs/${job_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('channel.generateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const canGenerate = !busy && !imageUploading && modelId && (prompt.trim() || imageUrl.trim());

  if (chLoading) {
    return <div className="documents"><p className="page-subtitle">{t('channel.loadingChannels')}</p></div>;
  }

  return (
    <div className="media-generate">
      <div className="media-generate-header">
        <Link to={`/media/channels/${channelId}`} className="media-generate-back">
          <ArrowLeft size={18} />
          <span>{channelName || t('channel.backToChannels')}</span>
        </Link>
        <span className="media-generate-channel-badge">{t('index.title')}</span>
      </div>

      <div className="media-generate-body">
        {/* Left: prompt + image */}
        <div className="media-generate-main">
          <div className="media-generate-kind-tabs">
            {imageModels.length > 0 && (
              <button
                type="button"
                className={`media-generate-kind-tab${mediaKind === 'image' ? ' active' : ''}`}
                onClick={() => switchKind('image')}
                disabled={busy}
              >
                {t('channel.createImage')}
              </button>
            )}
            {videoModels.length > 0 && (
              <button
                type="button"
                className={`media-generate-kind-tab${mediaKind === 'video' ? ' active' : ''}`}
                onClick={() => switchKind('video')}
                disabled={busy}
              >
                {t('channel.createVideo')}
              </button>
            )}
          </div>

          <label className="media-generate-label" htmlFor="media-gen-prompt">
            {t('channel.generatePrompt')}
          </label>
          <textarea
            id="media-gen-prompt"
            className="media-generate-textarea"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mediaKind === 'image'
              ? t('channel.generateImageHint')
              : t('channel.generateVideoHint')}
            disabled={busy}
            autoFocus
          />

          <label className="media-generate-label">{t('channel.generateImageUrl')}</label>
          <div className="media-generate-image-area">
            {imageUrl ? (
              <div className="media-generate-image-preview">
                <img src={imageUrl} alt="" />
                <button
                  type="button"
                  className="media-generate-image-remove"
                  disabled={busy}
                  onClick={() => setImageUrl('')}
                  title={t('channel.generateImageClear')}
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div
                ref={dropRef}
                className={`media-generate-image-drop${dragOver ? ' drag-over' : ''}${imageUploading ? ' uploading' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                {imageUploading ? (
                  <Loader2 size={24} className="media-generate-image-spinner" />
                ) : (
                  <>
                    <ImageIcon size={32} strokeWidth={1.5} />
                    <p className="media-generate-image-drop-text">
                      {t('channel.generateImageUrlPlaceholder')}
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="media-generate-image-actions">
              <input
                type="text"
                className="media-generate-image-url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('channel.generateImageUrlPlaceholder')}
                disabled={busy || imageUploading}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || imageUploading}
                onClick={() => imageFileRef.current?.click()}
              >
                <Upload size={14} />
                <span>{t('channel.upload')}</span>
              </button>
              <input
                ref={imageFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageFile(file);
                }}
              />
              {pickerImages.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || imageUploading}
                  onClick={() => setShowPicker((v) => !v)}
                >
                  <ImageIcon size={14} />
                  <span>{t('channel.generatePickFromChannel')}</span>
                </button>
              )}
            </div>
            {showPicker && (
              <div className="media-generate-picker">
                <div className="media-generate-picker-grid">
                  {pickerImages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="media-generate-picker-item"
                      disabled={pickerLoading || busy}
                      onClick={async () => {
                        setPickerLoading(true);
                        try {
                          const path = item.thumbnail_key || item.storage_key;
                          const url = await resolveMediaFileUrl(item.id, path);
                          setImageUrl(url);
                          setShowPicker(false);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : t('channel.uploadFailed'));
                        } finally {
                          setPickerLoading(false);
                        }
                      }}
                      title={item.title}
                    >
                      <PickerThumb asset={item} />
                      <span className="media-generate-picker-name">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: settings panel */}
        <div className="media-generate-sidebar">
          <div className="media-generate-sidebar-section">
            <h3 className="media-generate-sidebar-title">{t('channel.generateModel')}</h3>
            {modelsLoading ? (
              <p className="page-subtitle">{t('common.loading')}</p>
            ) : activeModels.length === 0 ? (
              <p className="media-generate-empty-hint">
                {mediaKind === 'image' ? t('channel.noImageModels') : t('channel.noVideoModels')}
              </p>
            ) : (
              <select
                className="documents-move-select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={busy}
              >
                {activeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="media-generate-sidebar-section">
            <h3 className="media-generate-sidebar-title">{t('channel.generateResolution')}</h3>
            <select
              className="documents-move-select"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={busy}
            >
              <option value="1280x720">1280x720 (HD)</option>
              <option value="720x1280">720x1280 (HD portrait)</option>
              <option value="1024x1024">1024x1024 (Square)</option>
              <option value="1920x1080">1920x1080 (Full HD)</option>
              <option value="1080x1920">1080x1920 (Full HD portrait)</option>
              <option value="2048x1080">2048x1080 (2K)</option>
              <option value="3840x2160">3840x2160 (4K)</option>
            </select>
          </div>

          <div className="media-generate-sidebar-section">
            <h3 className="media-generate-sidebar-title">{t('channel.generateQuality')}</h3>
            <select
              className="documents-move-select"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={busy}
            >
              <option value="speed">{t('channel.generateQualitySpeed')}</option>
              <option value="quality">{t('channel.generateQualityQuality')}</option>
            </select>
          </div>

          {mediaKind === 'video' && (
            <>
              <div className="media-generate-sidebar-section">
                <h3 className="media-generate-sidebar-title">{t('channel.generateDuration')}</h3>
                <select
                  className="documents-move-select"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  disabled={busy}
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                </select>
              </div>

              <div className="media-generate-sidebar-section">
                <h3 className="media-generate-sidebar-title">{t('channel.generateFps')}</h3>
                <select
                  className="documents-move-select"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  disabled={busy}
                >
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </div>

              <div className="media-generate-sidebar-section">
                <label className="documents-move-checkbox-label">
                  <input
                    type="checkbox"
                    checked={withAudio}
                    onChange={(e) => setWithAudio(e.target.checked)}
                    disabled={busy}
                  />
                  {t('channel.generateWithAudio')}
                </label>
              </div>
            </>
          )}

          <button
            type="button"
            className="btn btn-primary media-generate-submit"
            disabled={!canGenerate}
            onClick={() => void onGenerate()}
          >
            {busy ? (
              <Loader2 size={16} className="documents-upload-spinner" />
            ) : (
              <Sparkles size={16} />
            )}
            <span>{busy ? t('channel.generating') : t('channel.generateSubmit')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
