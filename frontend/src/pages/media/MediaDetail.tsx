import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteMediaAsset,
  fetchMediaAsset,
  fetchMediaAssets,
  resolveMediaFileUrl,
  updateMediaAsset,
  type MediaAssetOut,
} from '../../data/mediaApi';
import '../documents/DocumentDetail.scss';
import '../documents/DocumentChannel.scss';
import './Media.scss';

type MediaDetailFormProps = {
  title: string;
  description: string;
  capturedAt: string;
  locationLabel: string;
  provenanceLabel: string;
  mediaKind: 'image' | 'video';
  saving: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCapturedAtChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  nav: ReactNode;
  descriptionOnly?: boolean;
};

function MediaDetailFormPanel({
  title,
  description,
  capturedAt,
  locationLabel,
  provenanceLabel,
  mediaKind,
  saving,
  onTitleChange,
  onDescriptionChange,
  onCapturedAtChange,
  onLocationChange,
  onSave,
  onDelete,
  nav,
  descriptionOnly = false,
}: MediaDetailFormProps) {
  const { t } = useTranslation('media');

  return (
    <section className="document-detail-info media-detail-info" aria-label={t('detail.metadataPanelAria')}>
      <h2 className="document-detail-info-title">
        {mediaKind === 'video' ? <Video size={18} strokeWidth={1.75} /> : <ImageIcon size={18} strokeWidth={1.75} />}
        <span>{title.trim() || t('detail.untitled')}</span>
      </h2>
      <div className="document-detail-info-body">
        <div className="media-detail-info-meta">
          <span className="document-detail-metadata-pill">{provenanceLabel}</span>
        </div>

        <div className="media-detail-fields">
          {!descriptionOnly && (
            <>
              <div className="media-detail-field">
                <label className="media-detail-field-label" htmlFor="media-detail-title">
                  {t('detail.title')}
                </label>
                <input
                  id="media-detail-title"
                  type="text"
                  className="document-detail-metadata-input"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
              </div>
              <div className="media-detail-field">
                <label className="media-detail-field-label" htmlFor="media-detail-captured">
                  {t('detail.capturedAt')}
                </label>
                <input
                  id="media-detail-captured"
                  type="datetime-local"
                  className="document-detail-metadata-input"
                  value={capturedAt}
                  onChange={(e) => onCapturedAtChange(e.target.value)}
                />
              </div>
              <div className="media-detail-field">
                <label className="media-detail-field-label" htmlFor="media-detail-location">
                  {t('detail.location')}
                </label>
                <input
                  id="media-detail-location"
                  type="text"
                  className="document-detail-metadata-input"
                  value={locationLabel}
                  onChange={(e) => onLocationChange(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="media-detail-field">
            <label className="media-detail-field-label" htmlFor="media-detail-desc">
              {t('detail.description')}
            </label>
            <textarea
              id="media-detail-desc"
              className="document-detail-metadata-input media-detail-textarea"
              rows={descriptionOnly ? 10 : 6}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>
        </div>

        <div className="media-detail-footer">
          <div className="document-detail-metadata-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 size={14} className="documents-loading-spinner" /> : null}
              <span>{saving ? t('detail.saving') : t('detail.save')}</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm documents-bulk-delete" onClick={onDelete}>
              <Trash2 size={14} />
              <span>{t('detail.delete')}</span>
            </button>
          </div>
          {nav}
        </div>
      </div>
    </section>
  );
}

export function MediaDetail() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<MediaAssetOut | null>(null);
  const [siblings, setSiblings] = useState<MediaAssetOut[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [tab, setTab] = useState<'description' | 'details'>('description');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const row = await fetchMediaAsset(id);
      setAsset(row);
      setTitle(row.title);
      setDescription(row.description || '');
      setCapturedAt(row.captured_at ? row.captured_at.slice(0, 16) : '');
      const loc = row.location as { label?: string } | null;
      setLocationLabel(loc?.label || '');
      const url = await resolveMediaFileUrl(row.id, row.storage_key);
      setMediaUrl(url);
      const posterKey = row.poster_key || row.thumbnail_key;
      if (posterKey) {
        void resolveMediaFileUrl(row.id, posterKey).then(setPosterUrl).catch(() => setPosterUrl(null));
      }
      const list = await fetchMediaAssets({ channel_id: row.channel_id, limit: 500 });
      setSiblings(list.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const idx = siblings.findIndex((s) => s.id === id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const onSave = async () => {
    if (!asset) return;
    setSaving(true);
    try {
      const updated = await updateMediaAsset(asset.id, {
        title: title.trim() || asset.title,
        description: description || null,
        captured_at: capturedAt ? new Date(capturedAt).toISOString() : null,
        location: locationLabel.trim() ? { label: locationLabel.trim() } : null,
      });
      setAsset(updated);
      toast.success(t('detail.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!asset || !window.confirm(t('detail.deleteConfirm'))) return;
    try {
      await deleteMediaAsset(asset.id);
      navigate(`/media/channels/${asset.channel_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.deleteFailed'));
    }
  };

  const navRow =
    prev || next ? (
      <div className="media-detail-nav" aria-label={t('detail.siblingNavAria')}>
        {prev ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/media/view/${prev.id}`)}>
            <ChevronLeft size={14} />
            {t('detail.prev')}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/media/view/${next.id}`)}>
            {t('detail.next')}
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="document-detail media-detail-page">
        <div className="document-detail-loading">
          <Loader2 size={24} className="documents-loading-spinner" />
          <span>{t('detail.loading')}</span>
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="document-detail media-detail-page">
        <div className="document-detail-error">{t('detail.notFound')}</div>
      </div>
    );
  }

  const provenanceLabel =
    asset.provenance === 'generated' ? t('detail.provenanceGenerated') : t('detail.provenanceUploaded');

  const formPanelProps = {
    title,
    description,
    capturedAt,
    locationLabel,
    provenanceLabel,
    saving,
    onTitleChange: setTitle,
    onDescriptionChange: setDescription,
    onCapturedAtChange: setCapturedAt,
    onLocationChange: setLocationLabel,
    onSave: () => void onSave(),
    onDelete: () => void onDelete(),
    nav: navRow,
  };

  if (asset.media_kind === 'video') {
    return (
      <div className="document-detail media-detail-page media-detail-page--video">
        <Link to={`/media/channels/${asset.channel_id}`} className="document-detail-back">
          <ArrowLeft size={18} />
          <span>{t('detail.back')}</span>
        </Link>
        <div className="media-video-layout">
          <div className="document-detail-panel media-detail__viewer-panel">
            <div className="media-detail__viewer-body media-detail__viewer-body--video">
              {mediaUrl && <video src={mediaUrl} controls poster={posterUrl || undefined} />}
            </div>
          </div>
          <div className="media-video-layout__tabs" role="tablist" aria-label={t('detail.videoTabsAria')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'description'}
              className={`document-detail-panel-tab${tab === 'description' ? ' active' : ''}`}
              onClick={() => setTab('description')}
            >
              {t('detail.tabDescription')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              className={`document-detail-panel-tab${tab === 'details' ? ' active' : ''}`}
              onClick={() => setTab('details')}
            >
              {t('detail.tabDetails')}
            </button>
          </div>
          <MediaDetailFormPanel
            {...formPanelProps}
            mediaKind="video"
            descriptionOnly={tab === 'description'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="document-detail media-detail-page">
      <Link to={`/media/channels/${asset.channel_id}`} className="document-detail-back">
        <ArrowLeft size={18} />
        <span>{t('detail.back')}</span>
      </Link>
      <div className="media-detail">
        <div className="document-detail-panel media-detail__viewer-panel">
          <div className="media-detail__viewer-body">
            {mediaUrl ? <img src={mediaUrl} alt={title} /> : null}
          </div>
        </div>
        <MediaDetailFormPanel {...formPanelProps} mediaKind="image" />
      </div>
    </div>
  );
}
