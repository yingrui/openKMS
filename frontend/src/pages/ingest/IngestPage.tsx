/**
 * 知识接入 · 统一接入页。
 *
 * 招标要「将文章、OCR文本、字幕及业务资料转化为结构化知识」。openKMS 的五种承载
 * （文档/文章/媒体/Wiki/图谱）本来散在五个菜单，用户得自己判断"文章还是文档"。这里把
 * 它们收成一个入口：拖文件进来，系统按类型自动归纳——办公/PDF/图片走文档+OCR，音视频走
 * 媒体+自动转写出字幕，用户不用选类型。
 *
 * 复用现有 data 层（uploadDocument / uploadMediaAsset / analyzeMediaAsset / fetchPipelines），
 * 不重写上传逻辑。所有上传都 channel-scoped，故先 ensure 一个「知识接入」收件频道。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  Film,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link2,
  PenLine,
  BookOpen,
  Network,
  Cpu,
  Plus,
  ArrowRight,
} from 'lucide-react';
import {
  uploadDocument,
  fetchDocuments,
  isAcceptedFile as isAcceptedDoc,
  type DocumentResponse,
} from '../../data/documentsApi';
import { fetchDocumentChannels, createDocumentChannel } from '../../data/channelsApi';
import {
  uploadMediaAsset,
  analyzeMediaAsset,
  fetchMediaAssets,
  type MediaAssetOut,
} from '../../data/mediaApi';
import { fetchAllMediaChannels, createMediaChannel } from '../../data/mediaChannelsApi';
import { fetchPipelines, type PipelineResponse } from '../../data/pipelinesApi';
import { flattenChannels } from '../../data/channelUtils';
import './IngestPage.scss';

const INBOX_NAME = '知识接入';
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|flac|ogg)$/i;

type Kind = 'document' | 'media' | 'unknown';

type UploadRow = {
  id: string;
  name: string;
  kind: Kind;
  status: 'pending' | 'uploading' | 'analyzing' | 'done' | 'error';
  detail?: string;
  targetId?: string;
};

function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  if (VIDEO_EXT.test(name) || AUDIO_EXT.test(name) || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    return 'media';
  }
  if (isAcceptedDoc(file)) return 'document';
  return 'unknown';
}

const PIPELINE_STAGES = ['接入', '解析', '结构化', '人工治理', '入库'];

export function IngestPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentResponse[]>([]);
  const [recentMedia, setRecentMedia] = useState<MediaAssetOut[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docChannelRef = useRef<string | null>(null);
  const mediaChannelRef = useRef<string | null>(null);

  const loadSidePanels = useCallback(async () => {
    const [pipes, docs, media] = await Promise.allSettled([
      fetchPipelines(),
      fetchDocuments({ limit: 6 }),
      fetchMediaAssets({ limit: 6 }),
    ]);
    if (pipes.status === 'fulfilled') setPipelines(pipes.value.items);
    if (docs.status === 'fulfilled') setRecentDocs(docs.value.items);
    if (media.status === 'fulfilled') setRecentMedia(media.value.items);
  }, []);

  useEffect(() => {
    void loadSidePanels();
  }, [loadSidePanels]);

  // 确保「知识接入」收件频道存在，返回其 id（文档/媒体各一个）。
  const ensureInbox = useCallback(async (kind: 'document' | 'media'): Promise<string> => {
    const ref = kind === 'document' ? docChannelRef : mediaChannelRef;
    if (ref.current) return ref.current;
    if (kind === 'document') {
      const tree = await fetchDocumentChannels();
      const found = flattenChannels(tree.items).find((c) => c.name === INBOX_NAME);
      const id = found?.id ?? (await createDocumentChannel({ name: INBOX_NAME, description: '统一接入的原始资料收件箱' })).id;
      docChannelRef.current = id;
      return id;
    }
    const nodes = await fetchAllMediaChannels();
    const found = flattenChannels(nodes).find((c) => c.name === INBOX_NAME);
    const id = found?.id ?? (await createMediaChannel({ name: INBOX_NAME, description: '统一接入的音视频收件箱' })).id;
    mediaChannelRef.current = id;
    return id;
  }, []);

  const patchRow = (rowId: string, patch: Partial<UploadRow>) =>
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const ingestOne = useCallback(
    async (file: File, rowId: string, kind: Kind) => {
      try {
        if (kind === 'document') {
          const ch = await ensureInbox('document');
          patchRow(rowId, { status: 'uploading' });
          const doc = await uploadDocument(ch, file);
          patchRow(rowId, { status: 'done', detail: '已接入 · 待解析', targetId: doc.id });
        } else if (kind === 'media') {
          const ch = await ensureInbox('media');
          patchRow(rowId, { status: 'uploading' });
          const asset = await uploadMediaAsset(ch, file, { title: file.name.replace(/\.[^.]+$/, '') });
          patchRow(rowId, { status: 'analyzing', detail: '转写字幕中…', targetId: asset.id });
          // 音视频自动触发转写+摘要+关键帧（异步 worker，稍后可在媒体页看结果）。
          try {
            await analyzeMediaAsset(asset.id, { language: 'zh' });
          } catch {
            /* 分析入队失败不影响接入本身 */
          }
          patchRow(rowId, { status: 'done', detail: '已接入 · 转写已入队', targetId: asset.id });
        } else {
          patchRow(rowId, { status: 'error', detail: '不支持的类型' });
        }
      } catch (e) {
        patchRow(rowId, { status: 'error', detail: e instanceof Error ? e.message : '接入失败' });
      }
    },
    [ensureInbox],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      const newRows: UploadRow[] = arr.map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        kind: detectKind(f),
        status: 'pending',
      }));
      setRows((rs) => [...newRows, ...rs]);
      arr.forEach((f, i) => void ingestOne(f, newRows[i].id, newRows[i].kind).then(loadSidePanels));
    },
    [ingestOne, loadSidePanels],
  );

  return (
    <div className="ingest">
      <header className="ingest__head">
        <h1>知识接入</h1>
        <p>上传原始素材，系统自动解析、结构化、入图谱——文章、OCR 文本、字幕及业务资料，统一在这里接入。</p>
      </header>

      {/* 五段链路示意 */}
      <div className="ingest-pipeline-strip">
        {PIPELINE_STAGES.map((s, i) => (
          <div key={s} className="ingest-pipeline-strip__item">
            <span className="ingest-pipeline-strip__dot">{i + 1}</span>
            <span>{s}</span>
            {i < PIPELINE_STAGES.length - 1 && <ArrowRight size={14} className="ingest-pipeline-strip__arrow" />}
          </div>
        ))}
      </div>

      {/* 统一投料区 */}
      <section
        className={`ingest-drop${dragActive ? ' is-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <Upload size={34} strokeWidth={1.5} />
        <div className="ingest-drop__title">拖拽文件到此，或点击选择</div>
        <div className="ingest-drop__hint">
          文档（PDF / Word / PPT / Excel / 图片）→ OCR 解析　·　音视频（视频 / 音频）→ 自动转写字幕
        </div>
        <div className="ingest-drop__note">系统按文件类型自动归纳，无需手动区分文章或文档</div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </section>

      {rows.length > 0 && (
        <section className="ingest-queue">
          {rows.map((r) => (
            <div key={r.id} className="ingest-queue__row">
              <span className="ingest-queue__ic">
                {r.kind === 'media' ? <Film size={16} /> : <FileText size={16} />}
              </span>
              <span className="ingest-queue__name" title={r.name}>{r.name}</span>
              <span className="ingest-queue__kind">{r.kind === 'media' ? '音视频' : r.kind === 'document' ? '文档' : '未知'}</span>
              <span className={`ingest-queue__status is-${r.status}`}>
                {r.status === 'uploading' || r.status === 'analyzing' ? <Loader2 size={14} className="spin" /> : null}
                {r.status === 'done' ? <CheckCircle2 size={14} /> : null}
                {r.status === 'error' ? <AlertCircle size={14} /> : null}
                {r.detail ?? r.status}
              </span>
              {r.targetId && r.status === 'done' ? (
                <button
                  type="button"
                  className="ingest-queue__go"
                  onClick={() => navigate(r.kind === 'media' ? `/media/view/${r.targetId}` : `/documents/view/${r.targetId}`)}
                >
                  查看
                </button>
              ) : <span />}
            </div>
          ))}
        </section>
      )}

      <div className="ingest__cols">
        {/* 处理流水线 */}
        <section className="ingest-panel">
          <h2><Cpu size={16} /> 处理流水线</h2>
          <p className="ingest-panel__sub">已就绪的解析能力，可直接复用或扩展</p>
          <div className="ingest-pipes">
            {pipelines.length === 0 && <p className="ingest-empty">暂无流水线</p>}
            {pipelines.map((p) => (
              <div key={p.id} className="ingest-pipe">
                <div className="ingest-pipe__name">{p.name}{p.is_active ? null : <span className="ingest-pipe__off">停用</span>}</div>
                {p.description && <div className="ingest-pipe__desc">{p.description}</div>}
                <code className="ingest-pipe__cmd">{p.command}</code>
              </div>
            ))}
          </div>
          <button type="button" className="ingest-morelink" onClick={() => navigate('/pipelines')}>
            <Plus size={14} /> 新建流水线
          </button>
        </section>

        {/* 其他接入方式 */}
        <section className="ingest-panel">
          <h2><Link2 size={16} /> 其他接入方式</h2>
          <div className="ingest-methods">
            <button type="button" onClick={() => navigate('/articles')}>
              <PenLine size={20} /><span>手写 / 编辑文章</span>
            </button>
            <button type="button" onClick={() => navigate('/wikis')}>
              <BookOpen size={20} /><span>建知识文档（Wiki）</span>
            </button>
            <button type="button" onClick={() => navigate('/ontology')}>
              <Network size={20} /><span>从内容抽取图谱</span>
            </button>
            <button type="button" onClick={() => navigate('/documents')}>
              <FileText size={20} /><span>按频道浏览文档</span>
            </button>
          </div>
        </section>
      </div>

      {/* 最近接入 */}
      {(recentDocs.length > 0 || recentMedia.length > 0) && (
        <section className="ingest-panel">
          <h2><Upload size={16} /> 最近接入</h2>
          <div className="ingest-recent">
            {recentMedia.map((m) => (
              <button key={m.id} type="button" className="ingest-recent__row" onClick={() => navigate(`/media/view/${m.id}`)}>
                <Film size={15} />
                <span className="ingest-recent__name">{m.title}</span>
                <span className="ingest-recent__badge">{m.media_kind === 'video' ? '视频' : m.media_kind === 'audio' ? '音频' : '图片'}</span>
              </button>
            ))}
            {recentDocs.map((d) => (
              <button key={d.id} type="button" className="ingest-recent__row" onClick={() => navigate(`/documents/view/${d.id}`)}>
                <FileText size={15} />
                <span className="ingest-recent__name">{d.name}</span>
                <span className={`ingest-recent__badge status-${d.status}`}>{d.status}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
