import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Sparkles, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  analyzeMediaAsset,
  deleteMediaAsset,
  extractMediaMetadata,
  fetchMediaAsset,
  fetchMediaAssets,
  resolveMediaFileUrl,
  updateMediaAsset,
  type MediaAssetOut,
  type TranscriptSegment,
} from '../../data/mediaApi';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { findChannel, normalizeExtractionSchemaToFields } from '../../data/channelUtils';
import { ContentMetadataSection } from '../../components/metadata/ContentMetadataSection';
import { richMarkdownRemarkPlugins, richMarkdownRehypePlugins } from '../../components/markdown/richMarkdown';
import '../documents/DocumentDetail.scss';
import '../documents/DocumentChannel.scss';
import './Media.scss';

type MediaDetailFormProps = {
  title: string;
  description: string;
  capturedAt: string;
  locationLabel: string;
  provenanceLabel: string;
  mediaKind: 'image' | 'video' | 'audio';
  saving: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCapturedAtChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  nav: ReactNode;
  descriptionOnly?: boolean;
  activeTab?: MediaDetailTab;
  onTabChange?: (tab: MediaDetailTab) => void;
  techDetails?: ReactNode;
  derivedPanel?: ReactNode;
};

type MediaDetailTab = 'description' | 'summary' | 'transcript' | 'frames' | 'details';

// 「描述」tab 已去除——描述字段并入「详情」tab(信息+技术详情+结构化元数据合并)。
const VIDEO_TABS: MediaDetailTab[] = ['summary', 'transcript', 'frames', 'details'];
const AUDIO_TABS: MediaDetailTab[] = ['summary', 'transcript', 'details'];

const TAB_LABEL_KEY: Record<MediaDetailTab, string> = {
  description: 'detail.tabDescription',
  summary: 'detail.tabSummary',
  transcript: 'detail.tabTranscript',
  frames: 'detail.tabFrames',
  details: 'detail.tabDetails',
};

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

/** Build a WebVTT track from the stored transcript so the player can burn in captions. */
function buildVtt(segments: TranscriptSegment[]): string {
  const cues = segments
    .filter((s) => s.end_ms > s.start_ms && s.text.trim())
    .map((s, i) => `${i + 1}\n${vttTime(s.start_ms)} --> ${vttTime(s.end_ms)}\n${s.text.trim()}`);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  activeTab,
  onTabChange,
  techDetails,
  derivedPanel,
}: MediaDetailFormProps) {
  const { t } = useTranslation('media');
  const tabsForKind = mediaKind === 'audio' ? AUDIO_TABS : VIDEO_TABS;
  const showVideoTabs = mediaKind !== 'image' && activeTab && onTabChange;

  return (
    <section className="document-detail-info media-detail-info" aria-label={t('detail.metadataPanelAria')}>
      {showVideoTabs ? (
        <div className="media-detail-panel-tabs" role="tablist" aria-label={t('detail.videoTabsAria')}>
          {tabsForKind.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={activeTab === name}
              className={`document-detail-panel-tab${activeTab === name ? ' active' : ''}`}
              onClick={() => onTabChange(name)}
            >
              {t(TAB_LABEL_KEY[name])}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="document-detail-info-title">
          {mediaKind === 'image' ? <ImageIcon size={18} strokeWidth={1.75} /> : <Video size={18} strokeWidth={1.75} />}
          <span>{title.trim() || t('detail.untitled')}</span>
        </h2>
      )}
      <div className="document-detail-info-body">
        {!showVideoTabs && (
          <div className="media-detail-info-meta">
            <span className="document-detail-metadata-pill">{provenanceLabel}</span>
          </div>
        )}

        {techDetails}

        {derivedPanel}

        {!derivedPanel && (
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
              rows={descriptionOnly ? 12 : 6}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={descriptionOnly ? t('detail.descriptionPlaceholder') : undefined}
            />
          </div>
        </div>
        )}

        <div className="media-detail-footer">
          <div className="document-detail-metadata-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !!derivedPanel} onClick={onSave}>
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
  const { channels: mediaChannels } = useEnsureMediaChannels();
  const [asset, setAsset] = useState<MediaAssetOut | null>(null);
  const [siblings, setSiblings] = useState<MediaAssetOut[]>([]);
  const mediaChannel = useMemo(
    () => (asset ? findChannel(mediaChannels, asset.channel_id) : null),
    [mediaChannels, asset],
  );
  const mediaExtractionFields = useMemo(
    () => normalizeExtractionSchemaToFields(mediaChannel?.extraction_schema),
    [mediaChannel],
  );
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [tab, setTab] = useState<MediaDetailTab>('summary');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const playerRef = useRef<HTMLMediaElement | null>(null);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const [activeCue, setActiveCue] = useState(-1);
  const activeCueRef = useRef<HTMLLIElement | null>(null);

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
      const frames = row.keyframes || [];
      if (frames.length) {
        const entries = await Promise.all(
          frames.map(async (f) => {
            try {
              return [f.key, await resolveMediaFileUrl(row.id, f.key)] as const;
            } catch {
              return null;
            }
          }),
        );
        setFrameUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null)));
      } else {
        setFrameUrls({});
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

  // Captions come from the stored transcript, so there is nothing extra to fetch.
  const transcriptSegments = asset?.transcript?.segments;
  useEffect(() => {
    if (!transcriptSegments?.length) {
      setVttUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([buildVtt(transcriptSegments)], { type: 'text/vtt' }));
    setVttUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [transcriptSegments]);

  // Follow playback so the transcript highlights the line being spoken. Audio elements
  // never render a caption track, so this is the only cue indicator they get.
  useEffect(() => {
    const el = playerRef.current;
    if (!el || !transcriptSegments?.length) return;
    const onTime = () => {
      const ms = el.currentTime * 1000;
      const idx = transcriptSegments.findIndex((s) => ms >= s.start_ms && ms < s.end_ms);
      setActiveCue((prev) => (prev === idx ? prev : idx));
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [transcriptSegments, mediaUrl]);

  // Keep the spoken line in view, but only nudge within the panel.
  useEffect(() => {
    activeCueRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCue]);

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

  const seekTo = (ms: number) => {
    const el = playerRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    void el.play().catch(() => undefined);
  };

  const onAnalyze = async () => {
    if (!asset) return;
    setAnalyzing(true);
    try {
      await analyzeMediaAsset(asset.id, { language: 'zh' });
      toast.success(t('detail.analyzeQueued'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.analyzeFailed'));
    } finally {
      setAnalyzing(false);
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

  const durationLabel = formatDuration(asset.duration_ms);
  const dimensionsLabel =
    asset.width && asset.height ? t('detail.dimensionsValue', { width: asset.width, height: asset.height }) : null;

  const metadataSection = (
    <ContentMetadataSection
      meta={(asset.metadata ?? {}) as Record<string, unknown>}
      schemaFields={mediaExtractionFields}
      hasExtractionModel={Boolean(mediaChannel?.extraction_model_id)}
      canExtract={Boolean(asset.transcript?.text || asset.summary || asset.description)}
      extractHint="请先运行分析生成转写稿/摘要"
      onExtract={async () => {
        const res = await extractMediaMetadata(asset.id);
        setAsset(res.asset);
        return { warnings: res.warnings };
      }}
      onSave={async (values) => {
        const updated = await updateMediaAsset(asset.id, { metadata: values });
        setAsset(updated);
      }}
    />
  );

  const techDetailsPanel =
    tab === 'details' ? (
      <>
      <dl className="media-detail-tech">
        <div className="media-detail-tech-item">
          <dt>{t('detail.provenance')}</dt>
          <dd>{provenanceLabel}</dd>
        </div>
        {dimensionsLabel ? (
          <div className="media-detail-tech-item">
            <dt>{t('detail.dimensions')}</dt>
            <dd>{dimensionsLabel}</dd>
          </div>
        ) : null}
        {durationLabel ? (
          <div className="media-detail-tech-item">
            <dt>{t('detail.duration')}</dt>
            <dd>{durationLabel}</dd>
          </div>
        ) : null}
        {asset.content_type ? (
          <div className="media-detail-tech-item">
            <dt>{t('detail.format')}</dt>
            <dd>{asset.content_type}</dd>
          </div>
        ) : null}
        <div className="media-detail-tech-item">
          <dt>{t('detail.added')}</dt>
          <dd>{new Date(asset.created_at).toLocaleString()}</dd>
        </div>
      </dl>
      {metadataSection}
      </>
    ) : null;

  const analyzeButton = (
    <button type="button" className="btn btn-secondary btn-sm" disabled={analyzing} onClick={() => void onAnalyze()}>
      {analyzing ? <Loader2 size={14} className="documents-loading-spinner" /> : <Sparkles size={14} />}
      <span>{analyzing ? t('detail.analyzing') : t('detail.analyze')}</span>
    </button>
  );

  const segments = asset.transcript?.segments || [];
  const corrections = asset.transcript?.corrections_applied || [];
  const frames = asset.keyframes || [];

  let derivedPanel: ReactNode = null;
  if (tab === 'summary') {
    derivedPanel = (
      <div className="media-derived">
        {asset.summary ? (
          <div className="media-derived__summary media-derived__summary--md">
            <ReactMarkdown remarkPlugins={richMarkdownRemarkPlugins} rehypePlugins={richMarkdownRehypePlugins}>
              {asset.summary}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="media-derived__empty">{t('detail.summaryEmpty')}</p>
        )}
        <div className="media-derived__actions">{analyzeButton}</div>
      </div>
    );
  } else if (tab === 'transcript') {
    derivedPanel = (
      <div className="media-derived">
        {segments.length ? (
          <>
            <p className="media-derived__meta">
              {t('detail.transcriptMeta', {
                engine: asset.transcript?.engine || '',
                count: segments.length,
              })}
            </p>
            {corrections.length ? (
              <details className="media-derived__corrections">
                <summary>{t('detail.correctionsApplied', { count: corrections.length })}</summary>
                <ul>
                  {corrections.map((c) => (
                    <li key={`${c.from}-${c.to}`}>
                      <s>{c.from}</s> → <strong>{c.to}</strong>
                      {c.count > 1 ? ` ×${c.count}` : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <ol className="media-derived__transcript">
              {segments.map((seg, i) => (
                <li
                  key={`${seg.start_ms}-${i}`}
                  ref={i === activeCue ? activeCueRef : undefined}
                  className={i === activeCue ? 'is-active' : undefined}
                >
                  <button
                    type="button"
                    className="media-derived__cue"
                    title={t('detail.seekTo')}
                    onClick={() => seekTo(seg.start_ms)}
                  >
                    {formatTimestamp(seg.start_ms)}
                  </button>
                  <span className="media-derived__cue-text">{seg.text}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="media-derived__empty">{t('detail.transcriptEmpty')}</p>
        )}
        <div className="media-derived__actions">{analyzeButton}</div>
      </div>
    );
  } else if (tab === 'frames') {
    derivedPanel = (
      <div className="media-derived">
        {frames.length ? (
          <div className="media-derived__frames">
            {frames.map((f) => (
              <button
                key={f.key}
                type="button"
                className="media-derived__frame"
                title={t('detail.seekTo')}
                onClick={() => seekTo(f.t_ms)}
              >
                {frameUrls[f.key] ? <img src={frameUrls[f.key]} alt={formatTimestamp(f.t_ms)} /> : null}
                <span>{formatTimestamp(f.t_ms)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="media-derived__empty">{t('detail.framesEmpty')}</p>
        )}
        <div className="media-derived__actions">{analyzeButton}</div>
      </div>
    );
  }

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

  if (asset.media_kind === 'audio') {
    return (
      <div className="document-detail media-detail-page media-detail-page--video">
        <Link to={`/media/channels/${asset.channel_id}`} className="document-detail-back">
          <ArrowLeft size={18} />
          <span>{t('detail.back')}</span>
        </Link>
        <div className="media-detail media-detail--video">
          <div className="media-detail__main">
            <div className="document-detail-panel media-detail__viewer-panel">
              <div className="media-detail__viewer-body media-detail__viewer-body--audio">
                {mediaUrl && (
                  <audio
                    ref={(el) => {
                      playerRef.current = el;
                    }}
                    src={mediaUrl}
                    controls
                  />
                )}
              </div>
            </div>
            <div className="media-detail__video-caption">
              <h1 className="media-detail__video-title">{title.trim() || t('detail.untitled')}</h1>
              <div className="media-detail__video-meta">
                <span className="document-detail-metadata-pill">{provenanceLabel}</span>
                {durationLabel ? <span className="media-detail__video-meta-item">{durationLabel}</span> : null}
              </div>
            </div>
          </div>
          <MediaDetailFormPanel
            {...formPanelProps}
            mediaKind="audio"
            descriptionOnly={tab === 'description'}
            activeTab={tab}
            onTabChange={setTab}
            techDetails={techDetailsPanel}
            derivedPanel={derivedPanel}
          />
        </div>
      </div>
    );
  }

  if (asset.media_kind === 'video') {
    return (
      <div className="document-detail media-detail-page media-detail-page--video">
        <Link to={`/media/channels/${asset.channel_id}`} className="document-detail-back">
          <ArrowLeft size={18} />
          <span>{t('detail.back')}</span>
        </Link>
        <div className="media-detail media-detail--video">
          <div className="media-detail__main">
            <div className="document-detail-panel media-detail__viewer-panel media-detail__viewer-panel--video">
              <div className="media-detail__viewer-body media-detail__viewer-body--video">
                {mediaUrl && (
                  <video
                    ref={(el) => {
                      playerRef.current = el;
                    }}
                    src={mediaUrl}
                    controls
                    poster={posterUrl || undefined}
                  >
                    {vttUrl ? (
                      <track
                        kind="captions"
                        src={vttUrl}
                        srcLang={asset.transcript?.language || 'zh'}
                        label={t('detail.captionsLabel')}
                        default
                      />
                    ) : null}
                  </video>
                )}
              </div>
            </div>
            <div className="media-detail__video-caption">
              <h1 className="media-detail__video-title">{title.trim() || t('detail.untitled')}</h1>
              <div className="media-detail__video-meta">
                <span className="document-detail-metadata-pill">{provenanceLabel}</span>
                {dimensionsLabel ? <span className="media-detail__video-meta-item">{dimensionsLabel}</span> : null}
                {durationLabel ? <span className="media-detail__video-meta-item">{durationLabel}</span> : null}
              </div>
            </div>
          </div>
          <MediaDetailFormPanel
            {...formPanelProps}
            mediaKind="video"
            descriptionOnly={tab === 'description'}
            activeTab={tab}
            onTabChange={setTab}
            techDetails={techDetailsPanel}
            derivedPanel={derivedPanel}
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
