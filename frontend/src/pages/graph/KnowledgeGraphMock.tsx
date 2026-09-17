/**
 * 知识图谱 /kg —— 建于统一本体之上的知识实例图(mock,对齐方案概念图 #14)。
 * 图谱浏览 / 路径分析 / 图查询 / 数据质量 四 tab;左侧图谱范围(业务域+对象类型)、
 * 中间图可视化(以 InBody H30 为中心的产品—指标—健康主题—场景—内容资产网络)、右侧实例详情。
 *
 * 注:真实图谱在 /knowledge-map(Neo4j)。本页为演示视图,固定布局的示意图。
 * Demo-branch 页面:内联 zh-CN 文案。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search as SearchIcon, Filter, ChevronDown, Star, MoreVertical, GitBranch, PenLine,
  Percent, Dumbbell, Activity, Heart, FileText, Box, ShieldCheck, Store, CheckCircle2, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GraphQA } from '../ontology/GraphQA';
import './KnowledgeGraphMock.scss';

type Tone = 'product' | 'indicator' | 'theme' | 'scenario' | 'content';
const TONE_COLOR: Record<Tone, string> = {
  product: '#e4002b', indicator: '#059669', theme: '#2563eb', scenario: '#d97706', content: '#2563eb',
};
type GNode = { id: string; label: string; x: number; y: number; tone: Tone; icon: LucideIcon; sub?: string };
type GEdge = { from: string; to: string; label: string; dashed?: boolean };

const NODES: GNode[] = [
  { id: 'inbody', label: 'InBody H30', x: 130, y: 285, tone: 'product', icon: Box },
  { id: 'pbf', label: '体脂率', x: 355, y: 150, tone: 'indicator', icon: Percent },
  { id: 'smm', label: '骨骼肌量', x: 355, y: 285, tone: 'indicator', icon: Dumbbell },
  { id: 'bmi', label: 'BMI', x: 355, y: 420, tone: 'indicator', icon: Activity },
  { id: 'weight', label: '体重管理', x: 590, y: 205, tone: 'theme', icon: Heart },
  { id: 'center', label: '体验馆检测', x: 590, y: 375, tone: 'scenario', icon: Store },
  { id: 'guide', label: '体成分指标解读指南', x: 820, y: 150, tone: 'content', icon: FileText },
  { id: 'retest', label: '复测建议', x: 820, y: 420, tone: 'content', icon: FileText },
];
const EDGES: GEdge[] = [
  { from: 'inbody', to: 'pbf', label: '产生指标' },
  { from: 'inbody', to: 'smm', label: '产生指标' },
  { from: 'inbody', to: 'bmi', label: '产生指标' },
  { from: 'pbf', to: 'weight', label: '用于评估' },
  { from: 'smm', to: 'weight', label: '支持决策' },
  { from: 'bmi', to: 'center', label: '用于评估' },
  { from: 'weight', to: 'guide', label: '关联内容' },
  { from: 'weight', to: 'retest', label: '关联内容', dashed: true },
  { from: 'center', to: 'retest', label: '关联内容', dashed: true },
];

const LEGEND: { tone: Tone; label: string }[] = [
  { tone: 'product', label: '产品' }, { tone: 'indicator', label: '指标' },
  { tone: 'theme', label: '健康主题' }, { tone: 'scenario', label: '服务场景' },
  { tone: 'content', label: '内容资产' },
];

const DOMAIN_TREE = ['体重管理', '代谢健康', '免疫健康', '营养早餐'];
const OBJECT_TYPES: { icon: LucideIcon; label: string; count: number; tone: Tone }[] = [
  { icon: Box, label: '产品', count: 12, tone: 'product' },
  { icon: Activity, label: '指标', count: 48, tone: 'indicator' },
  { icon: Heart, label: '健康主题', count: 24, tone: 'theme' },
  { icon: Store, label: '服务场景', count: 18, tone: 'scenario' },
  { icon: FileText, label: '内容资产', count: 156, tone: 'content' },
];

// InBody 实例详情(右栏)。
const INBODY = {
  name: 'InBody H30', typeLabel: '检测设备', status: '已发布',
  props: [
    { k: '设备编号', v: 'DEV-INBODY-H30' },
    { k: '品牌', v: 'InBody' },
    { k: '适用场景', v: '体成分检测、体重管理评估' },
  ],
  related: [
    { label: '产生指标', count: 3, tone: 'indicator' as Tone },
    { label: '支持健康主题', count: 2, tone: 'theme' as Tone },
    { label: '关联服务场景', count: 2, tone: 'scenario' as Tone },
    { label: '关联内容资产', count: 5, tone: 'content' as Tone },
  ],
  sources: [
    { name: 'InBody H30 产品技术白皮书 v1.2', date: '2024-04-12' },
    { name: '体成分检测临床应用共识（2023）', date: '2023-11-08' },
    { name: '安利体验馆检测服务 SOP v2.0', date: '2024-02-20' },
  ],
  updatedAt: '2024-05-12 15:32', updatedBy: '安利同事',
};

const TABS = ['图谱浏览', '路径分析', '图查询', '数据质量'] as const;

export function KnowledgeGraphMock() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>('图谱浏览');
  const [selected, setSelected] = useState('inbody');
  const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

  return (
    <div className="kg">
      <header className="kg__head">
        <div>
          <h1>知识图谱</h1>
          <p>基于统一本体组织知识实例，支持查询、关联分析与来源追溯。</p>
        </div>
        <div className="kg-search">
          <SearchIcon size={16} />
          <input placeholder="搜索产品、指标、健康主题、内容资产或服务场景…" />
        </div>
      </header>

      <nav className="kg-tabs">
        {TABS.map((tb) => (
          <button key={tb} type="button" className={`kg-tab${tab === tb ? ' is-active' : ''}`} onClick={() => setTab(tb)}>{tb}</button>
        ))}
      </nav>

      {tab === '图查询' ? (
        <div className="kg-graphqa"><GraphQA /></div>
      ) : (
      <div className="kg-body">
        {/* 左:图谱范围 */}
        <aside className="kg-scope">
          <div className="kg-scope__title">图谱范围 <Filter size={13} /></div>
          <div className="kg-scope__sub">业务领域</div>
          <div className="kg-domrow is-open"><ChevronDown size={14} /> <Heart size={14} /> 大健康与营养</div>
          <ul className="kg-domtree">
            {DOMAIN_TREE.map((d, i) => (
              <li key={d} className={i === 0 ? 'is-active' : ''}><span className="kg-dot" /> {d}</li>
            ))}
          </ul>
          <div className="kg-scope__sub">对象类型</div>
          <ul className="kg-types">
            {OBJECT_TYPES.map((o) => {
              const Icon = o.icon;
              return (
                <li key={o.label}>
                  <input type="checkbox" defaultChecked />
                  <Icon size={15} style={{ color: TONE_COLOR[o.tone] }} />
                  <span className="kg-types__label">{o.label}</span>
                  <span className="kg-types__count">{o.count}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* 中:图可视化 */}
        <section className="kg-canvas">
          <div className="kg-legend">
            {LEGEND.map((l) => (
              <span key={l.tone} className="kg-legend__item"><i style={{ background: TONE_COLOR[l.tone] }} /> {l.label}</span>
            ))}
            <span className="kg-legend__item"><i className="kg-legend__line" /> 关系</span>
          </div>

          <div className="kg-graph">
            <svg viewBox="0 0 940 540" className="kg-graph__svg">
              <defs>
                <marker id="kg-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#b8c0cf" />
                </marker>
              </defs>
              {EDGES.map((e) => {
                const a = nodeById(e.from), b = nodeById(e.to);
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                return (
                  <g key={`${e.from}-${e.to}`}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="#c6cdda" strokeWidth={1.5} markerEnd="url(#kg-arrow)"
                      strokeDasharray={e.dashed ? '5 5' : undefined} />
                    <rect x={mx - e.label.length * 6.5} y={my - 11} width={e.label.length * 13} height={18} rx={9} fill="#fff" opacity={0.9} />
                    <text x={mx} y={my + 2} textAnchor="middle" className="kg-edge-label">{e.label}</text>
                  </g>
                );
              })}
            </svg>
            {NODES.map((n) => {
              const Icon = n.icon;
              const active = selected === n.id;
              return (
                <button key={n.id} type="button"
                  className={`kg-node kg-node--${n.tone}${active ? ' is-active' : ''}`}
                  style={{ left: `${(n.x / 940) * 100}%`, top: `${(n.y / 540) * 100}%` }}
                  onClick={() => setSelected(n.id)}>
                  <span className="kg-node__circle" style={{ borderColor: TONE_COLOR[n.tone], color: TONE_COLOR[n.tone] }}>
                    <Icon size={20} />
                  </span>
                  <span className="kg-node__label">{n.label}</span>
                </button>
              );
            })}
          </div>

          <div className="kg-path">
            <span className="kg-path__label">当前路径</span>
            <span className="kg-chip kg-chip--product">InBody H30</span>
            <span className="kg-path__rel">→ 产生指标 →</span>
            <span className="kg-chip kg-chip--indicator">体脂率</span>
            <span className="kg-path__rel">— 用于评估 →</span>
            <span className="kg-chip kg-chip--theme">体重管理</span>
          </div>
        </section>

        {/* 右:实例详情 */}
        <aside className="kg-inspect">
          <div className="kg-inspect__head">
            <h2>{INBODY.name}</h2>
            <div className="kg-inspect__icons"><Star size={16} /><MoreVertical size={16} /></div>
          </div>
          <div className="kg-inspect__badges">
            <span className="kg-typebadge">{INBODY.typeLabel}</span>
            <span className="kg-pub"><CheckCircle2 size={13} /> {INBODY.status}</span>
          </div>

          <div className="kg-inspect__sec">基础属性</div>
          <dl className="kg-props">
            {INBODY.props.map((p) => (
              <div key={p.k}><dt>{p.k}</dt><dd>{p.v}</dd></div>
            ))}
          </dl>

          <div className="kg-inspect__sec">关联对象</div>
          <ul className="kg-related">
            {INBODY.related.map((r) => (
              <li key={r.label}><span className="kg-dot" style={{ background: TONE_COLOR[r.tone] }} /> {r.label}<b>{r.count}</b></li>
            ))}
          </ul>

          <div className="kg-inspect__sec">来源与证据 <button type="button" className="kg-viewall" onClick={() => navigate('/content')}>查看全部</button></div>
          <div className="kg-src-note"><ShieldCheck size={13} /> {INBODY.sources.length} 条已审核来源</div>
          <ul className="kg-sources">
            {INBODY.sources.map((s) => (
              <li key={s.name}><FileText size={13} /><span>{s.name}</span><em>{s.date}</em></li>
            ))}
          </ul>

          <div className="kg-inspect__sec"><Clock size={13} /> 变更记录</div>
          <div className="kg-change">最近更新: {INBODY.updatedAt}<br />更新者: {INBODY.updatedBy}</div>

          <div className="kg-inspect__actions">
            <button type="button" className="kg-btn kg-btn--ghost" onClick={() => navigate('/knowledge-map')}><GitBranch size={14} /> 查看完整关系</button>
            <button type="button" className="kg-btn kg-btn--primary" onClick={() => navigate('/review')}><PenLine size={14} /> 发起修订</button>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}
