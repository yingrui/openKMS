/**
 * 内容资产 /content —— 跨频道、跨模态的内容中枢。主从布局(对齐方案概念图):
 *  - 按模态浏览:顶部模态指标横条 + 左侧「{模态}频道」树 + 右侧该频道内容。
 *  - 按业务域浏览:左侧「三层业务域」树 + 右侧该域跨模态内容 + 本体关系示意。
 *
 * 全部复用现成 flat-list API + 频道 context 的真实频道树;条目点击下钻既有详情页。
 * Demo-branch 页面:内联 zh-CN 文案。指标为真实计数。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Newspaper,
  FileText,
  Film,
  BookOpen,
  Search as SearchIcon,
  Database,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchArticles } from '../data/articlesApi';
import { fetchDocuments } from '../data/documentsApi';
import { fetchMediaAssets } from '../data/mediaApi';
import { fetchAllWikiSpaces, fetchAllWikiPages } from '../data/wikiSpacesApi';
import type { ChannelNode } from '../data/channelUtils';
import { useEnsureArticleChannels } from '../contexts/ArticleChannelsContext';
import { useEnsureDocumentChannels } from '../contexts/DocumentChannelsContext';
import { useEnsureMediaChannels } from '../contexts/MediaChannelsContext';
import { LAYERS, DOMAIN_META, domainForChannel } from '../data/contentDomains';
import './ContentAssets.scss';

type Kind = 'article' | 'document' | 'media' | 'wiki';

// fetch 阶段只存原始字段(含 channelId);频道名/业务域在渲染阶段解析,避免 fetch 依赖频道加载导致重取循环。
type RawItem = {
  kind: Kind;
  id: string;
  title: string;
  channelId?: string;
  status: string;
  updatedAt?: string;
  to: string;
};

type ContentItem = RawItem & { channelName?: string; domain: string };

const KIND_LABEL: Record<Kind, string> = { article: '文章', document: '文档', media: '媒体', wiki: 'Wiki' };
const KIND_UNIT: Record<Kind, string> = { article: '篇', document: '份', media: '个', wiki: '页' };
const KIND_ICON: Record<Kind, LucideIcon> = { article: Newspaper, document: FileText, media: Film, wiki: BookOpen };
const KIND_ORDER: Kind[] = ['article', 'document', 'media', 'wiki'];

// 本体关系示意条(按域给一组代表性对象链;非逐条真实数据,代表该域的知识对象骨架)。
const RELATION_CHAIN: Record<string, string[]> = {
  大健康与营养: ['产品', '成分', '指标', '健康主题', '服务场景'],
  植物营养研发与科学实证: ['植物', '成分', '靶点', '研究证据', '产品宣称'],
  '供应链、生产、质量与物流': ['原料批次', '配方版本', '生产批次', '检验', '成品追溯'],
  营销人员创业与顾客服务: ['营销人员', '资格', '顾客', '服务关系', '业绩'],
  '内容、培训、直播与 AI': ['内容资产', '知识对象', '证据', '渠道', '受控动作'],
};
const RELATION_DEFAULT = ['业务对象', '属性', '业务关系', '证据', '适用范围'];

function statusFromLifecycle(s?: string | null): { label: string; tone: string } {
  switch (s) {
    case 'draft': return { label: '草稿', tone: 'gray' };
    case 'superseded': return { label: '已替代', tone: 'amber' };
    case 'withdrawn': return { label: '已撤回', tone: 'red' };
    case 'in_force':
    default: return { label: '已发布', tone: 'green' };
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 一个频道节点及其所有后代的 id 集合。 */
function descendantIds(node: ChannelNode): Set<string> {
  const set = new Set<string>();
  const walk = (n: ChannelNode) => {
    set.add(n.id);
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return set;
}

export function ContentAssets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') === 'domain' ? 'domain' : 'modality') as 'modality' | 'domain';

  const [modality, setModality] = useState<Kind>('article');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [domainModality, setDomainModality] = useState<Kind | 'all'>('all');

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rawItems, setRawItems] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const artChannels = useEnsureArticleChannels();
  const docChannels = useEnsureDocumentChannels();
  const mediaChannels = useEnsureMediaChannels();
  const [wikiSpaces, setWikiSpaces] = useState<ChannelNode[]>([]);

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: ChannelNode[]) => nodes.forEach((n) => { map.set(n.id, n.name); walk(n.children ?? []); });
    walk(artChannels.channels);
    walk(docChannels.channels);
    walk(mediaChannels.channels);
    walk(wikiSpaces);
    return map;
  }, [artChannels.channels, docChannels.channels, mediaChannels.channels, wikiSpaces]);

  // 频道树 by modality(Wiki 用空间列表当作频道)。
  const channelTree: Record<Kind, ChannelNode[]> = useMemo(() => ({
    article: artChannels.channels,
    document: docChannels.channels,
    media: mediaChannels.channels,
    wiki: wikiSpaces,
  }), [artChannels.channels, docChannels.channels, mediaChannels.channels, wikiSpaces]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  // 取数:并行拉四模态(Wiki 拉空间→页)。只依赖 debouncedQ —— 频道名/域在渲染阶段解析。
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const search = debouncedQ || undefined;
    (async () => {
      const [artRes, docRes, mediaRes, spacesRes] = await Promise.allSettled([
        fetchArticles({ search, limit: 200 }),
        fetchDocuments({ search, limit: 200 }),
        fetchMediaAssets({ search, limit: 200 }),
        fetchAllWikiSpaces(),
      ]);
      if (cancelled) return;
      const next: RawItem[] = [];

      if (artRes.status === 'fulfilled') for (const a of artRes.value.items) {
        next.push({ kind: 'article', id: a.id, title: a.name, channelId: a.channel_id,
          status: statusFromLifecycle(a.lifecycle_status).label,
          updatedAt: a.updated_at ?? a.created_at, to: `/articles/view/${a.id}` });
      }
      if (docRes.status === 'fulfilled') for (const d of docRes.value.items) {
        next.push({ kind: 'document', id: d.id, title: d.name, channelId: d.channel_id,
          status: statusFromLifecycle(d.lifecycle_status).label,
          updatedAt: d.updated_at ?? d.created_at, to: `/documents/view/${d.id}` });
      }
      if (mediaRes.status === 'fulfilled') for (const m of mediaRes.value.items) {
        next.push({ kind: 'media', id: m.id, title: m.title, channelId: m.channel_id,
          status: statusFromLifecycle(m.lifecycle_status).label,
          updatedAt: m.updated_at ?? m.created_at, to: `/media/view/${m.id}` });
      }

      // Wiki:空间→页(空间少,fan-out 可接受)。
      let spaces: ChannelNode[] = [];
      if (spacesRes.status === 'fulfilled') {
        spaces = spacesRes.value.map((s) => ({ id: s.id, name: s.name }));
        const pageLists = await Promise.allSettled(spacesRes.value.map((s) => fetchAllWikiPages(s.id)));
        if (!cancelled) {
          pageLists.forEach((pl, i) => {
            if (pl.status !== 'fulfilled') return;
            const space = spacesRes.value[i];
            for (const pg of pl.value.items) {
              next.push({ kind: 'wiki', id: pg.id, title: pg.title || pg.path, channelId: space.id,
                status: '已发布', updatedAt: pg.updated_at, to: `/wikis/${space.id}/pages/${pg.id}` });
            }
          });
        }
      }
      if (cancelled) return;
      setWikiSpaces(spaces);
      if ([artRes, docRes, mediaRes, spacesRes].every((r) => r.status === 'rejected')) setError('内容资产加载失败,请稍后重试');
      setRawItems(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // 渲染阶段解析频道名 + 业务域(与 fetch 解耦,频道异步加载后自动重算)。
  const items = useMemo<ContentItem[]>(() =>
    rawItems.map((r) => {
      const channelName = r.channelId ? channelNameById.get(r.channelId) : undefined;
      return { ...r, channelName, domain: r.kind === 'wiki' ? domainForChannel(undefined) : domainForChannel(channelName) };
    }),
    [rawItems, channelNameById],
  );

  const switchView = (v: 'modality' | 'domain') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'domain') next.set('view', 'domain'); else next.delete('view');
    setSearchParams(next);
  };

  const kindItems = (k: Kind) => items.filter((i) => i.kind === k);
  const metrics = KIND_ORDER.map((k) => ({ kind: k, count: kindItems(k).length }));

  // —— 按模态:当前模态的频道树 + 选中频道内容 ——
  const activeTree = channelTree[modality];
  const selectedNode = useMemo<ChannelNode | null>(() => {
    if (!selectedChannelId) return null;
    const find = (nodes: ChannelNode[]): ChannelNode | null => {
      for (const n of nodes) {
        if (n.id === selectedChannelId) return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return null;
    };
    return find(activeTree);
  }, [selectedChannelId, activeTree]);

  const modalityRows = useMemo(() => {
    const pool = kindItems(modality);
    if (!selectedNode) return pool;
    const ids = descendantIds(selectedNode);
    return pool.filter((i) => i.channelId && ids.has(i.channelId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, modality, selectedNode]);

  const countInNode = (node: ChannelNode): number => {
    const ids = descendantIds(node);
    return kindItems(modality).filter((i) => i.channelId && ids.has(i.channelId)).length;
  };

  // —— 按业务:域内内容 ——
  const domainRows = useMemo(() => {
    const dom = selectedDomain ?? firstNonEmptyDomain(items);
    let rows = items.filter((i) => i.domain === dom);
    if (domainModality !== 'all') rows = rows.filter((i) => i.kind === domainModality);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedDomain, domainModality]);

  const activeDomain = selectedDomain ?? firstNonEmptyDomain(items);

  const toggleExpand = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const renderTree = (nodes: ChannelNode[], depth = 0) => (
    <ul className="ca-tree">
      {[...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((n) => {
        const kids = n.children ?? [];
        const hasKids = kids.length > 0;
        const isOpen = expanded.has(n.id) || depth === 0;
        const active = selectedChannelId === n.id;
        const cnt = countInNode(n);
        return (
          <li key={n.id}>
            <div
              className={`ca-tree__row${active ? ' is-active' : ''}`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => setSelectedChannelId(n.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedChannelId(n.id)}
            >
              {hasKids ? (
                <button type="button" className="ca-tree__toggle" onClick={(e) => { e.stopPropagation(); toggleExpand(n.id); }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="ca-tree__toggle ca-tree__toggle--leaf" />
              )}
              {hasKids ? (isOpen ? <FolderOpen size={15} /> : <Folder size={15} />) : <span className="ca-tree__dot" />}
              <span className="ca-tree__name">{n.name}</span>
              <span className="ca-tree__count">{cnt}</span>
            </div>
            {hasKids && isOpen && renderTree(kids, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  const rightTitle = selectedNode ? selectedNode.name : `全部${KIND_LABEL[modality]}`;

  return (
    <div className="ca">
      {/* 顶部大标题 + 搜索 */}
      <header className="ca__head">
        <div className="ca__head-left">
          <h1>内容资产</h1>
          <p>跨频道、跨模态汇聚同一业务主题的全部内容,让内容更容易找到、维护与复用。</p>
        </div>
        <div className="ca__head-right">
          <div className="ca-search">
            <SearchIcon size={17} />
            <input type="search" placeholder="搜索产品、成分、健康主题、操作指南、活动素材…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="ca-demobadge"><Database size={14} /> 演示数据</span>
        </div>
      </header>

      {/* 一级 tab */}
      <nav className="ca-tabs">
        <button type="button" className={`ca-tab${view === 'modality' ? ' is-active' : ''}`} onClick={() => switchView('modality')}>按模态浏览</button>
        <button type="button" className={`ca-tab${view === 'domain' ? ' is-active' : ''}`} onClick={() => switchView('domain')}>按业务域浏览</button>
      </nav>

      {error && <p className="ca-status is-error">{error}</p>}
      {loading && <p className="ca-status">加载中…</p>}

      {/* —— 按模态浏览 —— */}
      {!loading && !error && view === 'modality' && (
        <>
          <section className="ca-metricbar">
            {metrics.map(({ kind, count }) => {
              const Icon = KIND_ICON[kind];
              return (
                <button key={kind} type="button"
                  className={`ca-metric${modality === kind ? ' is-active' : ''}`}
                  onClick={() => { setModality(kind); setSelectedChannelId(null); }}>
                  <span className="ca-metric__icon"><Icon size={26} strokeWidth={1.7} /></span>
                  <span className="ca-metric__label">{KIND_LABEL[kind]}</span>
                  <span className="ca-metric__value">{count.toLocaleString()}</span>
                </button>
              );
            })}
          </section>

          <div className="ca-body">
            <aside className="ca-rail">
              <div className="ca-rail__title">{KIND_LABEL[modality]}频道</div>
              <div
                className={`ca-tree__row ca-tree__all${!selectedChannelId ? ' is-active' : ''}`}
                onClick={() => setSelectedChannelId(null)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedChannelId(null)}>
                <span className="ca-tree__dot" /><span className="ca-tree__name">全部{KIND_LABEL[modality]}</span>
                <span className="ca-tree__count">{kindItems(modality).length}</span>
              </div>
              {activeTree.length === 0 ? <p className="ca-empty">暂无频道</p> : renderTree(activeTree)}
            </aside>

            <main className="ca-main">
              <div className="ca-crumb">{KIND_LABEL[modality]} <ChevronRight size={13} /> {rightTitle}</div>
              <div className="ca-main__title">
                <h2>{rightTitle}</h2>
                <span className="ca-main__count">{modalityRows.length} {KIND_UNIT[modality]}</span>
              </div>

              {/* 子频道快捷(选中节点有子频道时) */}
              {selectedNode?.children?.length ? (
                <div className="ca-subtabs">
                  {selectedNode.children.map((c) => (
                    <button key={c.id} type="button" className="ca-subtab" onClick={() => setSelectedChannelId(c.id)}>
                      {c.name}<span>{countInNode(c)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <ContentTable rows={modalityRows} showChannel emptyText={`该频道暂无${KIND_LABEL[modality]}`} />
            </main>
          </div>
        </>
      )}

      {/* —— 按业务域浏览 —— */}
      {!loading && !error && view === 'domain' && (
        <div className="ca-body">
          <aside className="ca-rail">
            {LAYERS.map((layer) => (
              <div key={layer.layer} className="ca-domlayer">
                <div className="ca-domlayer__title">{layer.layer}</div>
                {layer.domains.map((d) => {
                  const Icon = DOMAIN_META[d]?.icon;
                  const cnt = items.filter((i) => i.domain === d).length;
                  const active = activeDomain === d;
                  return (
                    <div key={d}
                      className={`ca-domrow${active ? ' is-active' : ''}${cnt === 0 ? ' is-empty' : ''}`}
                      onClick={() => { setSelectedDomain(d); setDomainModality('all'); }}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedDomain(d)}>
                      {Icon && <Icon size={16} />}
                      <span className="ca-domrow__name">{d}</span>
                      <span className="ca-domrow__count">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </aside>

          <main className="ca-main">
            <div className="ca-crumb">业务域 <ChevronRight size={13} /> {activeDomain}</div>
            <div className="ca-main__title">
              <h2>{activeDomain}内容专题</h2>
            </div>
            <p className="ca-main__sub">汇聚围绕该业务域的产品、成分、指标、健康主题与服务场景相关内容,支撑搜索、问答与下游业务。</p>

            {/* 本体关系示意条 */}
            <div className="ca-relation">
              <span className="ca-relation__tag">本体关系</span>
              {(RELATION_CHAIN[activeDomain] ?? RELATION_DEFAULT).map((r, i, arr) => (
                <span key={r} className="ca-relation__step">
                  <span className="ca-relation__node">{r}</span>
                  {i < arr.length - 1 && <ArrowRight size={14} className="ca-relation__arrow" />}
                </span>
              ))}
            </div>

            {/* 域内模态计数子 tab */}
            <div className="ca-subtabs">
              {(['all', ...KIND_ORDER] as (Kind | 'all')[]).map((k) => {
                const base = items.filter((i) => i.domain === activeDomain);
                const cnt = k === 'all' ? base.length : base.filter((i) => i.kind === k).length;
                return (
                  <button key={k} type="button"
                    className={`ca-subtab${domainModality === k ? ' is-active' : ''}`}
                    onClick={() => setDomainModality(k)}>
                    {k === 'all' ? '全部' : KIND_LABEL[k]}<span>{cnt}</span>
                  </button>
                );
              })}
            </div>

            <ContentTable rows={domainRows} showKind showChannel emptyText="该业务域暂无已接入内容" />
          </main>
        </div>
      )}
    </div>
  );
}

function firstNonEmptyDomain(items: ContentItem[]): string {
  for (const layer of LAYERS) for (const d of layer.domains) if (items.some((i) => i.domain === d)) return d;
  return LAYERS[0].domains[0];
}

function ContentTable({ rows, showKind, showChannel, emptyText }:
  { rows: ContentItem[]; showKind?: boolean; showChannel?: boolean; emptyText: string }) {
  if (rows.length === 0) return <p className="ca-empty">{emptyText}</p>;
  return (
    <div className="ca-table">
      <div className="ca-table__head">
        <span>内容标题</span>
        {showChannel && <span className="ca-col-src">来源频道</span>}
        <span className="ca-col-status">治理状态</span>
        <span className="ca-col-date">更新时间</span>
      </div>
      {rows.map((r) => {
        const KindIcon = KIND_ICON[r.kind];
        const tone = statusToTone(r.status);
        return (
          <Link key={`${r.kind}-${r.id}`} to={r.to} className="ca-table__row">
            <span className="ca-table__title">
              <KindIcon size={16} className={`ca-kindic kind-${r.kind}`} />
              {showKind && <span className={`ca-chip chip-${r.kind}`}>{KIND_LABEL[r.kind]}</span>}
              <span className="ca-table__name">{r.title || '(未命名)'}</span>
            </span>
            {showChannel && <span className="ca-col-src">{r.channelName ?? '—'}</span>}
            <span className="ca-col-status"><span className={`ca-badge tone-${tone}`}>{r.status}</span></span>
            <span className="ca-col-date">{formatDate(r.updatedAt)}</span>
          </Link>
        );
      })}
    </div>
  );
}

function statusToTone(label: string): string {
  if (label === '已发布') return 'green';
  if (label === '草稿') return 'gray';
  if (label === '已替代') return 'amber';
  if (label === '已撤回') return 'red';
  return 'gray';
}
