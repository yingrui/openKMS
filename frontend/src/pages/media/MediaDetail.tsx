import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteMediaAsset,
  fetchMediaAsset,
  fetchMediaAssets,
  resolveMediaFileUrl,
  updateMediaAsset,
  type MediaAssetOut,
} from '../../data/mediaApi';
import './Media.scss';

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

  const load = useCallback(async () => {
    if (!id) return;
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
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id]);

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
      toast.error(e instanceof Error ? e.message : 'Save failed');
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
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (!asset) {
    return <div className="media-detail"><p>Loading…</p></div>;
  }

  const isVideo = asset.media_kind === 'video';

  if (isVideo) {
    return (
      <div className="media-video-layout">
        <Link to={`/media/channels/${asset.channel_id}`} className="document-channel-back">
          <ArrowLeft size={16} /> {t('detail.back')}
        </Link>
        <div className="media-video-layout__player">
          {mediaUrl && (
            <video src={mediaUrl} controls poster={posterUrl || undefined} />
          )}
        </div>
        <div>
          <h1>{title}</h1>
          <span className="media-provenance">
            {asset.provenance === 'generated' ? t('detail.provenanceGenerated') : t('detail.provenanceUploaded')}
          </span>
        </div>
        <div className="media-toolbar">
          <button type="button" className={tab === 'description' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('description')}>{t('detail.tabDescription')}</button>
          <button type="button" className={tab === 'details' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('details')}>{t('detail.tabDetails')}</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>{t('detail.save')}</button>
          <button type="button" className="btn btn-danger" onClick={() => void onDelete()}><Trash2 size={16} /></button>
        </div>
        {tab === 'description' ? (
          <textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
        ) : (
          <div className="media-detail__panel">
            <label>{t('detail.title')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
            <label>{t('detail.capturedAt')}</label>
            <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
            <label>{t('detail.location')}</label>
            <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
          </div>
        )}
        <div className="media-detail__nav">
          {prev && <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/view/${prev.id}`)}><ChevronLeft size={16} /> {t('detail.prev')}</button>}
          {next && <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/view/${next.id}`)}>{t('detail.next')} <ChevronRight size={16} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to={`/media/channels/${asset.channel_id}`} className="document-channel-back">
        <ArrowLeft size={16} /> {t('detail.back')}
      </Link>
      <div className="media-detail">
        <div className="media-detail__viewer">
          {mediaUrl && <img src={mediaUrl} alt={title} />}
        </div>
        <div className="media-detail__panel">
          <span className="media-provenance">
            {asset.provenance === 'generated' ? t('detail.provenanceGenerated') : t('detail.provenanceUploaded')}
          </span>
          <label>{t('detail.title')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <label>{t('detail.capturedAt')}</label>
          <input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          <label>{t('detail.location')}</label>
          <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
          <label>{t('detail.description')}</label>
          <textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="media-detail__nav">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>{t('detail.save')}</button>
            <button type="button" className="btn btn-danger" onClick={() => void onDelete()}><Trash2 size={16} /> {t('detail.delete')}</button>
          </div>
          <div className="media-detail__nav">
            {prev && <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/view/${prev.id}`)}><ChevronLeft size={16} /> {t('detail.prev')}</button>}
            {next && <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/view/${next.id}`)}>{t('detail.next')} <ChevronRight size={16} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}
