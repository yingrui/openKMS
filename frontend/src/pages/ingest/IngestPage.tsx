/**
 * 知识接入 · 企业级接入控制台。
 *
 * 三大核心入口:上传文件与媒体 / 连接外部知识源 / 创建批量任务。
 * 主流程:来源连接 → 解析与去重 → 元数据及频道映射 → 提交审核 → 进入内容资产。
 * 「实体抽取 / 更新知识图谱 / 同步知识库」降为发布后可选动作,不与原始接入强绑定。
 *
 * 复用真实 data 层:上传(uploadDocument/uploadMediaAsset/analyzeMediaAsset)、连接器(connectorsApi)、
 * 批量任务(jobsApi/schedulesApi)、处理模板(pipelinesApi)、频道映射(channelsApi.updateChannel)。
 * 连接器目录只有 tushare/智谱搜索两 kind,故外部源目录为「全目录演示卡」——真实的按 fetchConnectorKinds 点亮。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Upload, FileText, Film, Loader2, CheckCircle2, AlertCircle, Database, Network, Cpu, Plus, ArrowRight,
  Globe, Server, FolderTree, Cloud, Plug, RefreshCw, Zap, RotateCcw, Play, Boxes, ChevronRight, X,
  Newspaper, BookOpen, CalendarClock, Layers, ShieldCheck, FileStack,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  uploadDocument, fetchDocuments, isAcceptedFile as isAcceptedDoc, type DocumentResponse,
} from '../../data/documentsApi';
import { fetchDocumentChannels, createDocumentChannel, updateChannel } from '../../data/channelsApi';
import type { ChannelNode } from '../../data/channelUtils';
import { uploadMediaAsset, analyzeMediaAsset, fetchMediaAssets, type MediaAssetOut } from '../../data/mediaApi';
import { fetchAllMediaChannels, createMediaChannel } from '../../data/mediaChannelsApi';
import { createArticle } from '../../data/articlesApi';
import { fetchAllArticleChannels, createArticleChannel } from '../../data/articleChannelsApi';
import { fetchPipelines, type PipelineResponse } from '../../data/pipelinesApi';
import { fetchConnectors, fetchConnectorKinds, triggerConnectorSync, type ConnectorResponse } from '../../data/connectorsApi';
import { fetchJobs, retryJob, type JobResponse } from '../../data/jobsApi';
import { fetchSchedules, type Schedule } from '../../data/schedulesApi';
import { flattenChannels } from '../../data/channelUtils';
import './IngestPage.scss';

const INBOX_NAME = '知识接入';
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|aac|flac|ogg)$/i;
const ARTICLE_EXT = /\.(md|markdown|txt)$/i;

type Kind = 'document' | 'media' | 'article' | 'unknown';
type UploadRow = { id: string; name: string; kind: Kind; status: 'pending' | 'uploading' | 'analyzing' | 'done' | 'error'; detail?: string; targetId?: string };
type Entry = 'upload' | 'connect' | 'batch';

function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  if (VIDEO_EXT.test(name) || AUDIO_EXT.test(name) || file.type.startsWith('video/') || file.type.startsWith('audio/')) return 'media';
  if (ARTICLE_EXT.test(name)) return 'article';
  if (isAcceptedDoc(file)) return 'document';
  return 'unknown';
}

const FLOW_STAGES: { label: string; to?: string }[] = [
  { label: '来源连接' }, { label: '解析与去重' }, { label: '元数据及频道映射' },
  { label: '提交审核', to: '/review' }, { label: '进入内容资产', to: '/content' },
];

// 外部知识源目录(全目录演示;connectorKind 命中则为真实可用)
type SourceCard = { key: string; label: string; icon: LucideIcon; connectorKind?: string; datasource?: boolean; desc: string };
const SOURCE_CARDS: SourceCard[] = [
  { key: 'cms', label: 'CMS 内容中央厨房', icon: Newspaper, desc: '同步文章、日签、每日发圈、专题等已发布内容与状态。' },
  { key: 'wiki', label: 'Wiki / 知识空间', icon: BookOpen, desc: '接入 Confluence / 内部 Wiki 空间与页面。' },
  { key: 'sharepoint', label: 'SharePoint', icon: FolderTree, desc: '接入 SharePoint 文档库与站点。' },
  { key: 'object', label: '对象存储', icon: Cloud, desc: '接入 S3 / MinIO / OSS 桶中的文档与媒体。' },
  { key: 'website', label: '网站 / 网页搜索', icon: Globe, connectorKind: 'zhipu_web_search', desc: '接入网站抓取与联网搜索(智谱)。' },
  { key: 'api', label: 'API / 行情数据', icon: Plug, connectorKind: 'tushare', desc: '接入外部 API 数据源(如 Tushare 行情)。' },
  { key: 'db', label: '数据库', icon: Server, datasource: true, desc: '接入 Postgres / Neo4j 等数据库为数据集。' },
];

// 批量任务模式
type BatchMode = { key: string; label: string; icon: LucideIcon; real: boolean; desc: string };
const BATCH_MODES: BatchMode[] = [
  { key: 'bulk', label: '一次性批量导入', icon: Upload, real: true, desc: '多文件批量上传,自动解析入库。' },
  { key: 'schedule', label: '定时同步', icon: CalendarClock, real: true, desc: '按 cron 周期从连接器同步。' },
  { key: 'incremental', label: '增量更新', icon: RefreshCw, real: false, desc: '仅同步变化内容(规划中)。' },
  { key: 'event', label: '事件触发', icon: Zap, real: false, desc: 'Webhook / 事件驱动实时接入(规划中)。' },
  { key: 'retry', label: '失败重试', icon: RotateCcw, real: true, desc: '一键重跑失败任务。' },
];

/** 递归收集频道树为扁平节点(保留 pipeline_id / auto_process / extraction_schema)。 */
function flattenNodes(nodes: ChannelNode[]): ChannelNode[] {
  const out: ChannelNode[] = [];
  const walk = (ns: ChannelNode[]) => ns.forEach((n) => { out.push(n); walk(n.children ?? []); });
  walk(nodes);
  return out;
}

function statusTone(s: string): string {
  if (s === 'completed' || s === 'success') return 'green';
  if (s === 'failed' || s === 'error') return 'red';
  if (s === 'running') return 'blue';
  return 'gray';
}
function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function IngestPage() {
  const navigate = useNavigate();
  const [activeEntry, setActiveEntry] = useState<Entry>('upload');
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [connectDemo, setConnectDemo] = useState<SourceCard | null>(null);
  const [cmdOpen, setCmdOpen] = useState<string | null>(null);

  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentResponse[]>([]);
  const [recentMedia, setRecentMedia] = useState<MediaAssetOut[]>([]);
  const [connectors, setConnectors] = useState<ConnectorResponse[]>([]);
  const [kindSet, setKindSet] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [mapChannels, setMapChannels] = useState<ChannelNode[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docChannelRef = useRef<string | null>(null);
  const mediaChannelRef = useRef<string | null>(null);
  const articleChannelRef = useRef<string | null>(null);

  const loadSidePanels = useCallback(async () => {
    const [pipes, docs, media, conns, kinds, jobsR, sched, docCh, medCh] = await Promise.allSettled([
      fetchPipelines(), fetchDocuments({ limit: 6 }), fetchMediaAssets({ limit: 6 }),
      fetchConnectors(), fetchConnectorKinds(), fetchJobs({ limit: 8 }), fetchSchedules({ limit: 20 }),
      fetchDocumentChannels(), fetchAllMediaChannels(),
    ]);
    if (pipes.status === 'fulfilled') setPipelines(pipes.value.items);
    if (docs.status === 'fulfilled') setRecentDocs(docs.value.items);
    if (media.status === 'fulfilled') setRecentMedia(media.value.items);
    if (conns.status === 'fulfilled') setConnectors(conns.value.items);
    if (kinds.status === 'fulfilled') setKindSet(new Set(kinds.value.map((k) => k.kind)));
    if (jobsR.status === 'fulfilled') setJobs(jobsR.value.items);
    if (sched.status === 'fulfilled') setSchedules(sched.value.items);
    const dc = docCh.status === 'fulfilled' ? flattenNodes(docCh.value.items) : [];
    const mc = medCh.status === 'fulfilled' ? flattenNodes(medCh.value) : [];
    setMapChannels([...dc, ...mc].filter((c) => c.pipeline_id || c.name === INBOX_NAME || c.extraction_schema).slice(0, 8));
  }, []);

  useEffect(() => { void loadSidePanels(); }, [loadSidePanels]);

  const ensureInbox = useCallback(async (kind: 'document' | 'media' | 'article'): Promise<string> => {
    const ref = kind === 'article' ? articleChannelRef : kind === 'document' ? docChannelRef : mediaChannelRef;
    if (ref.current) return ref.current;
    if (kind === 'article') {
      const nodes = await fetchAllArticleChannels();
      const found = flattenChannels(nodes).find((c) => c.name === INBOX_NAME);
      const id = found?.id ?? (await createArticleChannel({ name: INBOX_NAME, description: '统一接入的文章/Markdown 收件箱' })).id;
      articleChannelRef.current = id;
      return id;
    }
    if (kind === 'document') {
      const tree = await fetchDocumentChannels();
      const found = flattenChannels(tree.items).find((c) => c.name === INBOX_NAME);
      let id = found?.id;
      if (!id) {
        id = (await createDocumentChannel({ name: INBOX_NAME, description: '统一接入的原始资料收件箱' })).id;
        try {
          const pipes = (await fetchPipelines()).items.filter((p) => p.is_active);
          const parser = pipes.find((p) => /paddle|doc-parse|ocr/i.test(`${p.name} ${p.command}`)) ?? pipes[0];
          if (parser) await updateChannel(id, { pipeline_id: parser.id, auto_process: true });
        } catch { /* 绑定失败不阻断上传 */ }
      }
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

  const ingestOne = useCallback(async (file: File, rowId: string, kind: Kind) => {
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
        try { await analyzeMediaAsset(asset.id, { language: 'zh' }); } catch { /* 分析入队失败不影响接入 */ }
        patchRow(rowId, { status: 'done', detail: '已接入 · 转写已入队', targetId: asset.id });
      } else if (kind === 'article') {
        const ch = await ensureInbox('article');
        patchRow(rowId, { status: 'uploading' });
        const markdown = await file.text();
        const art = await createArticle({ channel_id: ch, name: file.name.replace(/\.[^.]+$/, ''), markdown });
        patchRow(rowId, { status: 'done', detail: '已接入 · 文章', targetId: art.id });
      } else {
        patchRow(rowId, { status: 'error', detail: '不支持的类型' });
      }
    } catch (e) {
      patchRow(rowId, { status: 'error', detail: e instanceof Error ? e.message : '接入失败' });
    }
  }, [ensureInbox]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const newRows: UploadRow[] = arr.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, name: f.name, kind: detectKind(f), status: 'pending' }));
    setRows((rs) => [...newRows, ...rs]);
    arr.forEach((f, i) => void ingestOne(f, newRows[i].id, newRows[i].kind).then(loadSidePanels));
  }, [ingestOne, loadSidePanels]);

  const sourceIsReal = (c: SourceCard) => Boolean(c.datasource || (c.connectorKind && kindSet.has(c.connectorKind)));
  const openSource = (c: SourceCard) => {
    if (c.datasource) { navigate('/ontology/datasets'); return; }
    if (c.connectorKind && kindSet.has(c.connectorKind)) { navigate('/connectors'); return; }
    setConnectDemo(c);
  };

  const syncNow = async (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    try { await triggerConnectorSync(id, { start_date: today, end_date: today }); toast.success('已触发同步'); void loadSidePanels(); }
    catch (e) { toast.error(e instanceof Error ? e.message : '同步失败'); }
  };
  const rerun = async (jobId: number) => {
    try { await retryJob(jobId); toast.success('已重跑'); void loadSidePanels(); }
    catch (e) { toast.error(e instanceof Error ? e.message : '重跑失败'); }
  };
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const rerunAllFailed = async () => {
    const failed = jobs.filter((j) => j.status === 'failed');
    if (!failed.length) { toast.info('暂无失败任务'); return; }
    for (const j of failed) { try { await retryJob(j.id); } catch { /* skip */ } }
    toast.success(`已重跑 ${failed.length} 个失败任务`); void loadSidePanels();
  };
  const pipelineName = (id?: string | null) => pipelines.find((p) => p.id === id)?.name;

  const ENTRIES: { key: Entry; label: string; icon: LucideIcon; blurb: string }[] = [
    { key: 'upload', label: '上传文件与媒体', icon: FileStack, blurb: 'PDF · Office · 图片/扫描件 · 视频 · 音频 · 字幕' },
    { key: 'connect', label: '连接外部知识源', icon: Plug, blurb: 'CMS · Wiki · SharePoint · 对象存储 · 网站 · API · 数据库' },
    { key: 'batch', label: '创建批量任务', icon: Boxes, blurb: '批量导入 · 定时同步 · 增量更新 · 事件触发 · 失败重试' },
  ];

  return (
    <div className="ingest">
      <header className="ingest__head">
        <h1>知识接入</h1>
        <p>从上传、外部源连接与批量任务统一接入原始素材,经解析、映射与审核后进入内容资产。</p>
      </header>

      {/* 主流程条 */}
      <div className="ingest-pipeline-strip">
        {FLOW_STAGES.map((s, i) => (
          <div key={s.label} className={`ingest-pipeline-strip__item${s.to ? ' is-clickable' : ''}`} onClick={s.to ? () => navigate(s.to!) : undefined}>
            <span className="ingest-pipeline-strip__dot">{i + 1}</span>
            <span>{s.label}</span>
            {i < FLOW_STAGES.length - 1 && <ArrowRight size={14} className="ingest-pipeline-strip__arrow" />}
          </div>
        ))}
      </div>

      {/* ===== 主流程:接入 ===== */}
      <div className="ingest-zone"><span>接入原始素材</span><em>选择一种接入方式,系统自动解析、映射、送审</em></div>
      <div className="ingest-entries">
        {ENTRIES.map((e) => {
          const Icon = e.icon;
          return (
            <button key={e.key} type="button" className={`ingest-entry-card${activeEntry === e.key ? ' is-active' : ''}`} onClick={() => setActiveEntry(e.key)}>
              <span className="ingest-entry-card__ic"><Icon size={22} /></span>
              <span className="ingest-entry-card__title">{e.label}</span>
              <span className="ingest-entry-card__blurb">{e.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* 入口活动体 */}
      <div className="ingest-entry-body">
        {activeEntry === 'upload' && (
          <>
            <section
              className={`ingest-drop${dragActive ? ' is-active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              role="button" tabIndex={0}
            >
              <Upload size={34} strokeWidth={1.5} />
              <div className="ingest-drop__title">拖拽文件到此,或点击选择</div>
              <div className="ingest-drop__hint">PDF · Word · PPT · Excel · 图片/扫描件 → OCR 解析　·　视频 · 音频 → 自动转写字幕　·　Markdown/txt → 文章</div>
              <div className="ingest-drop__note">系统按文件类型自动归纳,无需手动区分文章或文档</div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
            </section>
            {rows.length > 0 && (
              <section className="ingest-queue">
                {rows.map((r) => (
                  <div key={r.id} className="ingest-queue__row">
                    <span className="ingest-queue__ic">{r.kind === 'media' ? <Film size={16} /> : <FileText size={16} />}</span>
                    <span className="ingest-queue__name" title={r.name}>{r.name}</span>
                    <span className="ingest-queue__kind">{r.kind === 'media' ? '音视频' : r.kind === 'document' ? '文档' : r.kind === 'article' ? '文章' : '未知'}</span>
                    <span className={`ingest-queue__status is-${r.status}`}>
                      {r.status === 'uploading' || r.status === 'analyzing' ? <Loader2 size={14} className="spin" /> : null}
                      {r.status === 'done' ? <CheckCircle2 size={14} /> : null}
                      {r.status === 'error' ? <AlertCircle size={14} /> : null}
                      {r.detail ?? r.status}
                    </span>
                    {r.targetId && r.status === 'done' ? (
                      <button type="button" className="ingest-queue__go" onClick={() => navigate(r.kind === 'media' ? `/media/view/${r.targetId}` : r.kind === 'article' ? `/articles/view/${r.targetId}` : `/documents/view/${r.targetId}`)}>查看</button>
                    ) : <span />}
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {activeEntry === 'connect' && (
          <div className="ingest-source-gallery">
            {SOURCE_CARDS.map((c) => {
              const Icon = c.icon;
              const real = sourceIsReal(c);
              return (
                <button key={c.key} type="button" className={`ingest-source-card${real ? '' : ' is-demo'}`} onClick={() => openSource(c)}>
                  <span className="ingest-source-card__ic"><Icon size={20} /></span>
                  <span className="ingest-source-card__name">{c.label}</span>
                  <span className={`ingest-source-card__pill${real ? ' is-real' : ''}`}>{real ? '可用' : '示例 · 可接入'}</span>
                </button>
              );
            })}
          </div>
        )}

        {activeEntry === 'batch' && (
          <div className="ingest-batch-modes">
            {BATCH_MODES.map((m) => {
              const Icon = m.icon;
              const onClick = () => {
                if (m.key === 'bulk') setActiveEntry('upload');
                else if (m.key === 'schedule') navigate('/job-runs/schedules');
                else if (m.key === 'retry') void rerunAllFailed();
                else setConnectDemo({ key: m.key, label: m.label, icon: m.icon, desc: m.desc });
              };
              return (
                <button key={m.key} type="button" className={`ingest-batch-tile${m.real ? '' : ' is-demo'}`} onClick={onClick}>
                  <span className="ingest-batch-tile__ic"><Icon size={20} /></span>
                  <span className="ingest-batch-tile__title">{m.label}{m.key === 'retry' && failedCount > 0 && <em> · {failedCount}</em>}</span>
                  <span className="ingest-batch-tile__desc">{m.desc}</span>
                  {!m.real && <span className="ingest-batch-tile__pill">示例</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 主流程尾部:发布后可选动作(进入内容资产后按需触发,与原始接入解耦) */}
      <section className="ingest-postpublish">
        <div className="ingest-postpublish__title"><ShieldCheck size={15} /> 发布后可选动作 <em>（与原始接入解耦,按需触发）</em></div>
        <div className="ingest-postpublish__actions">
          <button type="button" onClick={() => navigate('/objects')}><Boxes size={16} /> 实体抽取 / 本体</button>
          <button type="button" onClick={() => navigate('/kg')}><Network size={16} /> 更新知识图谱</button>
          <button type="button" onClick={() => navigate('/knowledge-bases')}><Database size={16} /> 同步知识库</button>
        </div>
      </section>

      {/* ===== 配置 ===== */}
      <div className="ingest-zone"><span>配置</span><em>接入时自动套用的模板与频道映射</em></div>
      <div className="ingest__cols">
        {/* 处理模板 */}
        <section className="ingest-panel">
          <h2><Cpu size={16} /> 处理模板</h2>
          <p className="ingest-panel__sub">解析 / OCR / 结构化模板,接入时自动套用</p>
          <div className="ingest-pipes">
            {pipelines.length === 0 && <p className="ingest-empty">暂无模板</p>}
            {pipelines.map((p) => (
              <div key={p.id} className="ingest-pipe">
                <div className="ingest-pipe__name">{p.name}{p.is_active ? null : <span className="ingest-pipe__off">停用</span>}</div>
                {p.description && <div className="ingest-pipe__desc">{p.description}</div>}
                <button type="button" className="ingest-pipe__cmdtoggle" onClick={() => setCmdOpen(cmdOpen === p.id ? null : p.id)}>
                  {cmdOpen === p.id ? '收起命令' : '查看命令'}
                </button>
                {cmdOpen === p.id && <code className="ingest-pipe__cmd">{p.command}</code>}
              </div>
            ))}
          </div>
          <button type="button" className="ingest-morelink" onClick={() => navigate('/pipelines')}><Plus size={14} /> 新建模板</button>
        </section>

        {/* 元数据及内容频道映射 */}
        <section className="ingest-panel">
          <h2><Network size={16} /> 元数据及频道映射</h2>
          <p className="ingest-panel__sub">频道 → 处理模板 · 抽取字段 · 自动处理</p>
          {mapChannels.length === 0 ? <p className="ingest-empty">暂无映射</p> : (
            <div className="ingest-map">
              <div className="ingest-map__head"><span>频道</span><span>模板</span><span>抽取</span><span>处理</span></div>
              {mapChannels.map((c) => (
                <div key={c.id} className="ingest-map__row">
                  <span className="ingest-map__name">{c.name}</span>
                  <span>{pipelineName(c.pipeline_id) ?? (c.pipeline_id ? '已绑定' : '—')}</span>
                  <span>{c.extraction_schema ? '已配置' : '—'}</span>
                  <span>{c.auto_process ? '自动' : '手动'}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="ingest-morelink" onClick={() => navigate('/documents/channels')}>配置频道映射 <ChevronRight size={13} /></button>
        </section>
      </div>

      {/* ===== 状态与监控 ===== */}
      <div className="ingest-zone"><span>状态与监控</span><em>连接器健康、批量任务与近期接入</em></div>
      <div className="ingest__cols">
        {/* 连接器管理与健康状态 */}
        <section className="ingest-panel">
          <h2><Plug size={16} /> 连接器与健康状态</h2>
          {connectors.length === 0 ? (
            <p className="ingest-empty">暂无连接器 · <button type="button" className="ingest-link" onClick={() => navigate('/connectors')}>去创建</button></p>
          ) : (
            <div className="ingest-conn">
              {connectors.map((c) => (
                <div key={c.id} className="ingest-conn__row">
                  <span className="ingest-conn__name">{c.name}<em>{c.kind}</em></span>
                  <span className={`ingest-badge tone-${statusTone(c.sync_schedule?.last_status ?? '')}`}>{c.sync_schedule?.last_status ?? (c.enabled ? '已启用' : '停用')}</span>
                  <span className="ingest-conn__next">下次 {fmt(c.sync_schedule?.next_run_at)}</span>
                  <button type="button" className="ingest-iconbtn" title="立即同步" onClick={() => void syncNow(c.id)}><Play size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="ingest-morelink" onClick={() => navigate('/connectors')}>管理连接器 <ChevronRight size={13} /></button>
        </section>

        {/* Batch Job 及同步记录 */}
        <section className="ingest-panel">
          <h2><Layers size={16} /> Batch Job 与同步记录 {schedules.length > 0 && <span className="ingest-panel__count">{schedules.length} 个定时</span>}</h2>
          {jobs.length === 0 ? <p className="ingest-empty">暂无任务</p> : (
            <div className="ingest-jobs">
              {jobs.map((j) => (
                <div key={j.id} className="ingest-jobs__row">
                  <span className="ingest-jobs__task">#{j.id} {j.task_name}</span>
                  <span className={`ingest-badge tone-${statusTone(j.status)}`}>{j.status}</span>
                  <span className="ingest-jobs__att">{j.attempts} 次</span>
                  <span className="ingest-jobs__time">{fmt(j.finished_at ?? j.created_at)}</span>
                  {j.status === 'failed' ? (
                    <button type="button" className="ingest-iconbtn" title="重跑" onClick={() => void rerun(j.id)}><RotateCcw size={13} /></button>
                  ) : <span className="ingest-iconbtn ingest-iconbtn--ph" />}
                </div>
              ))}
            </div>
          )}
          <button type="button" className="ingest-morelink" onClick={() => navigate('/job-runs')}>查看全部任务 <ChevronRight size={13} /></button>
        </section>
      </div>

      {/* 最近接入 */}
      {(recentDocs.length > 0 || recentMedia.length > 0) && (
        <section className="ingest-panel">
          <h2><Upload size={16} /> 最近接入</h2>
          <div className="ingest-recent">
            {recentMedia.map((m) => (
              <button key={m.id} type="button" className="ingest-recent__row" onClick={() => navigate(`/media/view/${m.id}`)}>
                <Film size={15} /><span className="ingest-recent__name">{m.title}</span>
                <span className="ingest-recent__badge">{m.media_kind === 'video' ? '视频' : m.media_kind === 'audio' ? '音频' : '图片'}</span>
              </button>
            ))}
            {recentDocs.map((d) => (
              <button key={d.id} type="button" className="ingest-recent__row" onClick={() => navigate(`/documents/view/${d.id}`)}>
                <FileText size={15} /><span className="ingest-recent__name">{d.name}</span>
                <span className={`ingest-recent__badge status-${d.status}`}>{d.status}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 演示源 / 批量模式 说明弹窗 */}
      {connectDemo && (
        <div className="ingest-modal" role="dialog" onClick={() => setConnectDemo(null)}>
          <div className="ingest-modal__card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ingest-modal__close" onClick={() => setConnectDemo(null)}><X size={16} /></button>
            <div className="ingest-modal__ic">{(() => { const DemoIcon = connectDemo.icon; return <DemoIcon size={26} />; })()}</div>
            <h3>{connectDemo.label}</h3>
            <p>{connectDemo.desc}</p>
            <p className="ingest-modal__note">该连接器为方案演示项,后端接入后此入口自动可用。当前可先用「上传文件」或已支持的网站 / API / 数据库源接入。</p>
            <div className="ingest-modal__actions">
              <button type="button" className="ingest-modal__btn" onClick={() => { setConnectDemo(null); navigate('/connectors'); }}>前往连接器</button>
              <button type="button" className="ingest-modal__btn ingest-modal__btn--ghost" onClick={() => setConnectDemo(null)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
