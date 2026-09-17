/**
 * 知识服务 /services —— 把已审核发布的知识交付给下游(API / RAG / MCP / 订阅)的服务目录(mock)。
 * 对齐方案概念图:服务目录 / 调用方 / 发布管理 / 调用监控 四 tab;左侧服务列表 + 右侧服务详情。
 *
 * 注:真实知识库(RAG)在 /knowledge-bases;本页是「知识即服务」的交付/治理视图,演示数据。
 * Demo-branch 页面:内联 zh-CN 文案。
 */
import { useState } from 'react';
import { toast } from 'sonner';
import {
  FileCode, Rss, Network as NetworkIcon, MessageSquare,
  ShoppingCart, Bot, UserRound, Store, Headphones, ChevronRight, Info, FileText,
  ShieldCheck, RefreshCw, ListChecks, BarChart3, CheckCircle2, Clock, FileCheck,
} from 'lucide-react';
import './KnowledgeService.scss';

type SvcStatus = 'published' | 'testing';
type SvcKind = 'API' | 'RAG' | 'Graph API' | 'Webhook';

type Consumer = { icon: typeof ShoppingCart; name: string };
type Metric = { icon: typeof BarChart3; label: string; value: string; tone?: string };
type Service = {
  id: string;
  name: string;
  domain: string;
  kind: SvcKind;
  version: string;
  status: SvcStatus;
  callsToday: string;
  running: boolean;
  sla: string;
  pipeline: string[];
  consumers: Consumer[];
  config: { label: string; value: string; icon: typeof FileText }[];
  metrics: Metric[];
};

const KIND_ICON: Record<SvcKind, typeof FileCode> = {
  API: FileCode, RAG: MessageSquare, 'Graph API': NetworkIcon, Webhook: Rss,
};
const KIND_COLOR: Record<SvcKind, string> = {
  API: '#2563eb', RAG: '#e4002b', 'Graph API': '#059669', Webhook: '#d97706',
};

const SERVICES: Service[] = [
  {
    id: 's1', name: '企业知识搜索 API', domain: '大健康与营养', kind: 'API', version: 'v2.2',
    status: 'published', callsToday: '8,351', running: true, sla: '99.9%',
    pipeline: ['已发布内容 + 本体 + 知识图谱', '语义检索与权限校验', '结果与来源', '下游调用方'],
    consumers: [
      { icon: ShoppingCart, name: '安利云购' }, { icon: Store, name: '体验馆顾问台' },
      { icon: Headphones, name: '客服工作台' }, { icon: UserRound, name: '营销人员助手' },
    ],
    config: [
      { label: '业务域', value: '大健康与营养', icon: FileText },
      { label: '权限', value: '全员', icon: ShieldCheck },
      { label: '更新策略', value: '发布后自动同步', icon: RefreshCw },
      { label: '返回内容', value: '命中片段 + 来源', icon: ListChecks },
    ],
    metrics: [
      { icon: BarChart3, label: '今日调用', value: '8,351' },
      { icon: CheckCircle2, label: '成功率', value: '99.8%', tone: 'green' },
      { icon: Clock, label: '平均响应', value: '210ms' },
      { icon: FileCheck, label: '召回覆盖率', value: '97.1%', tone: 'green' },
    ],
  },
  {
    id: 's2', name: '营养合规问答服务', domain: '大健康与营养', kind: 'RAG', version: 'v1.4',
    status: 'published', callsToday: '2,486', running: true, sla: '99.9%',
    pipeline: ['已发布内容 + 本体 KG1.2 + 知识图谱', '检索与权限校验', '回答与引用', '下游调用方(内部系统与用户端应用)'],
    consumers: [
      { icon: ShoppingCart, name: '安利云购' }, { icon: Bot, name: 'AI 小安' },
      { icon: UserRound, name: '营销人员助手' }, { icon: Store, name: '体验馆顾问台' },
      { icon: Headphones, name: '客服工作台' },
    ],
    config: [
      { label: '业务域', value: '大健康与营养', icon: FileText },
      { label: '权限', value: '营销人员 / 员工', icon: ShieldCheck },
      { label: '更新策略', value: '发布后自动同步', icon: RefreshCw },
      { label: '返回内容', value: '答案 + 来源 + 有效期', icon: ListChecks },
    ],
    metrics: [
      { icon: BarChart3, label: '今日调用', value: '12,486' },
      { icon: CheckCircle2, label: '成功率', value: '99.7%', tone: 'green' },
      { icon: Clock, label: '平均响应', value: '680ms' },
      { icon: FileCheck, label: '引用覆盖率', value: '98.2%', tone: 'green' },
    ],
  },
  {
    id: 's3', name: '知识图谱查询 API', domain: '数据与洞察', kind: 'Graph API', version: 'v1.3',
    status: 'published', callsToday: '1,027', running: true, sla: '99.5%',
    pipeline: ['本体 + 图谱实例', 'Cypher 生成与权限校验', '子图与推理', '下游调用方'],
    consumers: [
      { icon: Bot, name: 'AI 小安' }, { icon: UserRound, name: '营销人员助手' },
      { icon: Store, name: '体验馆顾问台' },
    ],
    config: [
      { label: '业务域', value: '数据与洞察', icon: FileText },
      { label: '权限', value: '员工', icon: ShieldCheck },
      { label: '更新策略', value: '图谱变更后同步', icon: RefreshCw },
      { label: '返回内容', value: '子图 + 关系解释', icon: ListChecks },
    ],
    metrics: [
      { icon: BarChart3, label: '今日调用', value: '1,027' },
      { icon: CheckCircle2, label: '成功率', value: '99.4%', tone: 'green' },
      { icon: Clock, label: '平均响应', value: '340ms' },
      { icon: FileCheck, label: '解释覆盖率', value: '95.6%', tone: 'green' },
    ],
  },
  {
    id: 's4', name: '内容更新订阅服务', domain: '通用能力', kind: 'Webhook', version: 'v1.1',
    status: 'testing', callsToday: '622', running: false, sla: '—',
    pipeline: ['已发布/变更事件', '订阅过滤与签名', '推送载荷', '下游订阅方'],
    consumers: [
      { icon: ShoppingCart, name: '安利云购' }, { icon: Headphones, name: '客服工作台' },
    ],
    config: [
      { label: '业务域', value: '通用能力', icon: FileText },
      { label: '权限', value: '系统间(签名)', icon: ShieldCheck },
      { label: '更新策略', value: '事件驱动实时推送', icon: RefreshCw },
      { label: '返回内容', value: '变更摘要 + 版本', icon: ListChecks },
    ],
    metrics: [
      { icon: BarChart3, label: '今日推送', value: '622' },
      { icon: CheckCircle2, label: '成功率', value: '97.9%', tone: 'amber' },
      { icon: Clock, label: '平均延迟', value: '1.2s' },
      { icon: FileCheck, label: '重投率', value: '2.1%', tone: 'amber' },
    ],
  },
];

const TABS = ['服务目录', '调用方', '发布管理', '调用监控'] as const;

export function KnowledgeService() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('服务目录');
  const [selectedId, setSelectedId] = useState('s2');
  const svc = SERVICES.find((s) => s.id === selectedId) ?? SERVICES[0];
  const act = (label: string) => toast.success(`${label}（演示）：${svc.name}`);

  return (
    <div className="ksvc">
      <header className="ksvc__head">
        <div>
          <h1>知识服务</h1>
          <p>将已审核发布的知识交付给下游业务系统、智能体与用户端应用。</p>
        </div>
        <div className="ksvc__head-right">
          <button type="button" className="ksvc-btn ksvc-btn--ghost" onClick={() => act('打开接口文档')}>
            <FileCode size={14} /> 接口文档
          </button>
          <button type="button" className="ksvc-btn ksvc-btn--primary" onClick={() => act('创建知识服务')}>创建知识服务</button>
        </div>
      </header>

      <nav className="ksvc-tabs">
        {TABS.map((tb) => (
          <button key={tb} type="button" className={`ksvc-tab${tab === tb ? ' is-active' : ''}`} onClick={() => setTab(tb)}>{tb}</button>
        ))}
      </nav>

      <div className="ksvc-banner"><Info size={15} /> 平台外调用方（含内部业务系统与智能体）通过 API、RAG、MCP 与订阅方式使用知识。</div>

      <div className="ksvc-body">
        {/* 左:服务列表 */}
        <aside className="ksvc-list">
          <div className="ksvc-filters">
            <div className="ksvc-filter">服务类型 <ChevronRight size={12} /></div>
            <div className="ksvc-filter">业务域 <ChevronRight size={12} /></div>
            <div className="ksvc-filter">状态 <ChevronRight size={12} /></div>
          </div>
          <div className="ksvc-list__head"><span>服务名称</span><span>类型</span><span>版本</span><span>状态</span><span>今日调用</span></div>
          <ul className="ksvc-list__rows">
            {SERVICES.map((s) => {
              const Icon = KIND_ICON[s.kind];
              return (
                <li key={s.id}>
                  <button type="button" className={`ksvc-srow${svc.id === s.id ? ' is-active' : ''}`} onClick={() => setSelectedId(s.id)}>
                    <span className="ksvc-srow__name">
                      <span className="ksvc-srow__ic" style={{ background: KIND_COLOR[s.kind] }}><Icon size={15} /></span>
                      <span><b>{s.name}</b><em>{s.domain}</em></span>
                    </span>
                    <span className="ksvc-srow__kind">{s.kind}</span>
                    <span className="ksvc-srow__ver">{s.version}</span>
                    <span className={`ksvc-status ksvc-status--${s.status}`}>{s.status === 'published' ? '已发布' : '测试中'}</span>
                    <span className="ksvc-srow__calls">{s.callsToday} <ChevronRight size={13} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="ksvc-list__foot">共 {SERVICES.length} 项</div>
        </aside>

        {/* 右:服务详情 */}
        <section className="ksvc-detail">
          <div className="ksvc-detail__head">
            <span className="ksvc-detail__ic" style={{ background: KIND_COLOR[svc.kind] }}>
              {(() => { const I = KIND_ICON[svc.kind]; return <I size={22} />; })()}
            </span>
            <h2>{svc.name}</h2>
            <span className={`ksvc-run${svc.running ? ' is-on' : ''}`}>● {svc.running ? '运行中' : '测试中'}</span>
            <span className="ksvc-tagpill">版本 {svc.version}</span>
            <span className="ksvc-tagpill">SLA {svc.sla}</span>
          </div>

          {/* 流水线 */}
          <div className="ksvc-flow">
            {svc.pipeline.map((step, i) => (
              <div key={step} className="ksvc-flow__step">
                <div className="ksvc-flow__box">{step}</div>
                {i < svc.pipeline.length - 1 && <ChevronRight size={18} className="ksvc-flow__arrow" />}
              </div>
            ))}
          </div>

          {/* 已授权调用方 */}
          <div className="ksvc-section">
            <h3>已授权调用方</h3>
            <div className="ksvc-consumers">
              {svc.consumers.map((c) => {
                const Icon = c.icon;
                return <div key={c.name} className="ksvc-consumer"><Icon size={16} /> {c.name}</div>;
              })}
            </div>
          </div>

          {/* 服务配置 */}
          <div className="ksvc-section">
            <h3>服务配置</h3>
            <div className="ksvc-config">
              {svc.config.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="ksvc-config__item">
                    <span className="ksvc-config__label"><Icon size={14} /> {c.label}</span>
                    <span className="ksvc-config__val">{c.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 指标 */}
          <div className="ksvc-metrics">
            {svc.metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="ksvc-metric">
                  <Icon size={20} className={`ksvc-metric__ic tone-${m.tone ?? 'blue'}`} />
                  <div>
                    <div className="ksvc-metric__label">{m.label}</div>
                    <div className={`ksvc-metric__val tone-${m.tone ?? 'blue'}`}>{m.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ksvc-detail__actions">
            <button type="button" className="ksvc-btn ksvc-btn--ghost" onClick={() => act('查看调用记录')}>查看调用记录</button>
            <button type="button" className="ksvc-btn ksvc-btn--ghost" onClick={() => act('管理授权')}>管理授权</button>
            <button type="button" className="ksvc-btn ksvc-btn--primary" onClick={() => act('发布新版本')}>发布新版本</button>
          </div>
        </section>
      </div>
    </div>
  );
}
