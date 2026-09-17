/**
 * 安利企业知识中枢 · 治理驾驶舱首页。忠实复刻方案概念图。
 *
 * 指标与治理任务是概念图的演示数字（来源变化/即将失效等尚无实时数据源，属路线图指标）；
 * 知识领域条数来自 /api/home/hub 的真实聚合。业务知识地图是模型示意图，不是实时渲染。
 *
 * Demo-branch component: 内联 zh-CN 文案（安利 demo 目标语言）。
 */
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Users,
  RefreshCw,
  CalendarClock,
  ListChecks,
  FileText,
  Search as SearchIcon,
  ShoppingCart,
  Headphones,
  UserRound,
  Bot,
  Upload,
  ShieldCheck,
  Network,
  Target,
  Box,
  Leaf,
  Award,
  Store,
  Activity,
  ChevronRight,
  Info,
  Rocket,
  ArrowRight,
  Clock,
} from 'lucide-react';
import type { HomeHubResponse } from '../../data/homeHubApi';
import './AmwayCockpit.scss';

// 今日治理演示行（对齐概念图）
const GOVERNANCE_ROWS = [
  { icon: FileText, source: '产品主张证据补全', domain: '产品与成分', owner: '张敏', status: '待审核', tone: 'amber', action: '进入审核', to: '/ontology' },
  { icon: SearchIcon, source: '云购搜索 badcase', domain: '云购与长客会', owner: '李强', status: '待审核', tone: 'amber', action: '进入审核', to: '/evaluations' },
  { icon: Headphones, source: '培训字幕待校准', domain: '培训客服', owner: '王芳', status: '待审核', tone: 'amber', action: '进入审核', to: '/media' },
  { icon: RefreshCw, source: '官方资料版本变化', domain: '内容运营', owner: '陈卓', status: '待复审', tone: 'teal', action: '查看影响', to: '/ontology' },
];

const SERVICES = [
  { icon: SearchIcon, name: '企业知识搜索' },
  { icon: ShoppingCart, name: '安利云购搜索/推荐' },
  { icon: Headphones, name: '培训与客服助手' },
  { icon: UserRound, name: '营销人员客户服务' },
  { icon: Bot, name: '其他 AI / Agent' },
];


// 业务知识地图六节点（角度 + 图标 + 颜色 + 侧描述）
const MAP_NODES = [
  { key: '产品', icon: Box, tone: 'blue', angle: -90, side: 'right', lines: ['产品信息', '规格/形态'] },
  { key: '证据/背书', icon: Award, tone: 'teal', angle: -30, side: 'right', lines: ['临床研究', '检测报告', '权威背书'] },
  { key: '健康解决方案', icon: Users, tone: 'teal', angle: 30, side: 'right', lines: ['目标人群', '健康需求', '方案组合'] },
  { key: '渠道/适用条件', icon: Store, tone: 'blue', angle: 90, side: 'right', lines: ['合规要求', '禁忌说明'] },
  { key: '内容资产', icon: FileText, tone: 'blue', angle: 150, side: 'left', lines: ['图文/视频', '讲义/课件', '文档资料'] },
  { key: '成分', icon: Leaf, tone: 'teal', angle: -150, side: 'left', lines: ['成分信息', '来源/工艺', '作用机理'] },
];

// 快速开始:五段知识流水线(接入→组织→编排本体→创建知识库→发布服务)
const PIPELINE = [
  { n: '01', label: '接入资料', sub: '文档·图片·音视频', icon: Upload, to: '/ingest', tone: 'red' },
  { n: '02', label: '组织内容', sub: '频道·版本·权限', icon: FileText, to: '/content', tone: 'blue' },
  { n: '03', label: '编排本体', sub: '对象·关系·值索引', icon: Network, to: '/ontology', tone: 'blue' },
  { n: '04', label: '创建知识库', sub: '内容·图谱·检索', icon: Database, to: '/knowledge-bases', tone: 'blue' },
  { n: '05', label: '发布服务', sub: 'API·RAG·MCP', icon: Rocket, to: '/services', tone: 'green' },
] as const;

// 继续上次工作
const CONTINUE_ROWS = [
  { icon: Network, name: '体重管理本体 KG1.2', status: '草稿', tone: 'draft', action: '继续编排', to: '/ontology' },
  { icon: Database, name: '营养合规问答知识库', status: '待测试', tone: 'review', action: '继续配置', to: '/knowledge-bases' },
] as const;

export function AmwayCockpit({ hub }: { hub: HomeHubResponse }) {
  const navigate = useNavigate();
  const ov = hub.asset_overview;

  const metrics = [
    { icon: Database, label: '待治理存量', value: (ov?.cms_total ?? 72898).toLocaleString(), tone: 'blue' },
    { icon: Users, label: '待专业审核', value: String(ov?.pending_review ?? 28), tone: 'amber' },
    { icon: RefreshCw, label: '来源变化待复审', value: String(ov?.source_changed ?? 6), tone: 'teal' },
    { icon: CalendarClock, label: '即将失效', value: String(ov?.expiring ?? 14), tone: 'red' },
  ];

  // 地图几何
  const W = 440, H = 380, cx = W / 2, cy = H / 2, R = 118, nodeR = 30;
  const pos = (a: number) => ({ x: cx + R * Math.cos((a * Math.PI) / 180), y: cy + R * Math.sin((a * Math.PI) / 180) });

  return (
    <div className="cockpit">
      <header className="cockpit__head">
        <h1>知识资产总览</h1>
        <span>让一套已审核知识同时服务企业员工、营销人员与消费者触点</span>
      </header>

      {/* 指标横条 */}
      <section className="cockpit-metricbar" aria-label="知识资产总览">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`cockpit-metricbar__item${i > 0 ? ' has-divider' : ''}`}>
              <span className={`cockpit-metricbar__icon tone-${m.tone}`}><Icon size={30} strokeWidth={1.6} /></span>
              <div>
                <div className="cockpit-metricbar__label">{m.label}</div>
                <div className={`cockpit-metricbar__value tone-${m.tone}`}>{m.value}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 快速开始（五段流水线，宽）| 知识服务运行 */}
      <section className="cockpit__mid cockpit__mid--v2">
        <div className="cockpit-panel cockpit-panel--quick">
          <h2><Target size={16} /> 快速开始</h2>
          <p className="cockpit-quick__lead">选择任务，系统将带你完成下一步</p>
          <div className="cockpit-pipeline">
            {PIPELINE.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="cockpit-pstep">
                  <button type="button" className={`cockpit-pstep__circle tone-${s.tone}`} onClick={() => navigate(s.to)} title={s.label}>
                    <Icon size={24} strokeWidth={1.7} />
                  </button>
                  <div className="cockpit-pstep__label"><b>{s.n}</b> {s.label}</div>
                  <div className="cockpit-pstep__sub">{s.sub}</div>
                  {i < PIPELINE.length - 1 && <ArrowRight size={18} className={`cockpit-pstep__arrow${i === 0 ? ' is-red' : ''}${i === 3 ? ' is-green' : ''}`} />}
                </div>
              );
            })}
          </div>
          <div className="cockpit-continue">
            <div className="cockpit-continue__title"><Clock size={14} /> 继续上次工作</div>
            {CONTINUE_ROWS.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.name} type="button" className="cockpit-continue__row" onClick={() => navigate(c.to)}>
                  <Icon size={16} className="cockpit-continue__ic" />
                  <span className="cockpit-continue__name">{c.name}</span>
                  <span className={`cockpit-continue__badge tone-${c.tone}`}>{c.status}</span>
                  <span className="cockpit-continue__action">{c.action} <ChevronRight size={13} /></span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cockpit-panel">
          <h2><Activity size={16} /> 知识服务运行 <span className="cockpit-online">● 已发布知识可用</span></h2>
          <div className="cockpit-services">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="cockpit-service">
                  <span className="cockpit-service__ic"><Icon size={16} /></span>
                  <span className="cockpit-service__name">{s.name}</span>
                  <span className="cockpit-service__dot">● 正常</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="cockpit-morelink" onClick={() => navigate('/console/health')}>
            查看服务健康与日志 <ChevronRight size={14} />
          </button>
        </div>
      </section>

      {/* 底部：知识领域（宽） | 今日治理（与快速开始对调） */}
      <section className="cockpit__bottom">
        <div className="cockpit-panel cockpit-panel--map">
          <h2><Network size={16} /> 业务知识地图</h2>
          <div className="cockpit-map" style={{ width: W, maxWidth: '100%' }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="cockpit-map__svg" aria-label="以知识主张为中心的业务知识网络">
              <polygon
                points={MAP_NODES.map((n) => { const p = pos(n.angle); return `${p.x},${p.y}`; }).join(' ')}
                className="cockpit-map__ring"
              />
              {MAP_NODES.map((n) => { const p = pos(n.angle); return <line key={n.key} x1={cx} y1={cy} x2={p.x} y2={p.y} className="cockpit-map__spoke" />; })}
            </svg>
            <div className="cockpit-map__center" style={{ left: cx, top: cy }}>
              <ShieldCheck size={22} />
              <span>知识主张</span>
            </div>
            {MAP_NODES.map((n) => {
              const p = pos(n.angle);
              const Icon = n.icon;
              return (
                <div key={n.key}>
                  <div className={`cockpit-map__node tone-${n.tone}`} style={{ left: p.x, top: p.y }}>
                    <Icon size={18} />
                    <b>{n.key}</b>
                  </div>
                  <div
                    className={`cockpit-map__desc cockpit-map__desc--${n.side}`}
                    style={{ left: p.x + (n.side === 'right' ? nodeR + 8 : -(nodeR + 8)), top: p.y }}
                  >
                    {n.lines.map((l) => <div key={l}>{l}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cockpit-panel">
          <h2><ListChecks size={16} /> 今日治理</h2>
          <table className="cockpit-gov">
            <thead>
              <tr><th>来源类型</th><th>知识领域</th><th>负责人</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {GOVERNANCE_ROWS.map((r) => {
                const Icon = r.icon;
                return (
                  <tr key={r.source}>
                    <td className="cockpit-gov__src"><Icon size={15} /><span>{r.source}</span></td>
                    <td>{r.domain}</td>
                    <td>{r.owner}</td>
                    <td><span className={`cockpit-gov__status tone-${r.tone}`}>● {r.status}</span></td>
                    <td><button type="button" onClick={() => navigate(r.to)}>{r.action}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="cockpit-morelink" onClick={() => navigate('/ontology')}>
            查看全部任务 <ChevronRight size={14} />
          </button>
        </div>
      </section>

      <p className="cockpit-foot"><Info size={14} /> 订单、业绩及个人数据留在业务系统，OpenKMS 仅管理企业知识与语义关系。</p>
    </div>
  );
}
