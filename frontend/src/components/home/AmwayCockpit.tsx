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
  Plus,
  Info,
  HeartPulse,
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

const DOMAIN_META = [
  { name: '产品与成分', icon: Box },
  { name: '健康解决方案', icon: HeartPulse },
  { name: '内容运营', icon: FileText },
  { name: '云购与长客会', icon: ShoppingCart },
  { name: '培训客服', icon: Headphones },
  { name: '营销人员服务', icon: UserRound },
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

export function AmwayCockpit({ hub }: { hub: HomeHubResponse }) {
  const navigate = useNavigate();
  const ov = hub.asset_overview;
  const domainCounts = new Map((hub.knowledge_domains ?? []).map((d) => [d.name, d.content_count]));

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

      {/* 中间三栏：快速开始（与今日治理对调）| 业务知识地图 | 知识服务运行 */}
      <section className="cockpit__mid">
        <div className="cockpit-panel">
          <h2><Target size={16} /> 快速开始</h2>
          <div className="cockpit-quick">
            <button type="button" onClick={() => navigate('/ingest')}><Upload size={22} /><span>接入新资料</span></button>
            <button type="button" onClick={() => navigate('/ontology')}><ShieldCheck size={22} /><span>新建知识主张</span></button>
            <button type="button" onClick={() => navigate('/ontology')}><Network size={22} /><span>维护本体</span></button>
            <button type="button" onClick={() => navigate('/evaluations')}><Target size={22} /><span>发起评测</span></button>
          </div>
        </div>

        <div className="cockpit-panel cockpit-panel--map">
          <h2><Network size={16} /> 业务知识地图</h2>
          <div className="cockpit-map" style={{ width: W, maxWidth: '100%' }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="cockpit-map__svg" aria-label="以知识主张为中心的业务知识网络">
              {/* 环 */}
              <polygon
                points={MAP_NODES.map((n) => { const p = pos(n.angle); return `${p.x},${p.y}`; }).join(' ')}
                className="cockpit-map__ring"
              />
              {/* 辐条 */}
              {MAP_NODES.map((n) => { const p = pos(n.angle); return <line key={n.key} x1={cx} y1={cy} x2={p.x} y2={p.y} className="cockpit-map__spoke" />; })}
            </svg>
            {/* 中心 */}
            <div className="cockpit-map__center" style={{ left: cx, top: cy }}>
              <ShieldCheck size={22} />
              <span>知识主张</span>
            </div>
            {/* 节点 + 侧描述 */}
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
        <div className="cockpit-panel">
          <h2><Database size={16} /> 知识领域</h2>
          <div className="cockpit-domains">
            {DOMAIN_META.map((d) => {
              const Icon = d.icon;
              return (
                <button key={d.name} type="button" className="cockpit-domain" onClick={() => navigate('/articles')}>
                  <Icon size={22} strokeWidth={1.6} />
                  <span className="cockpit-domain__name">{d.name}</span>
                  <span className="cockpit-domain__count">{domainCounts.get(d.name) ?? 0} 条</span>
                </button>
              );
            })}
            <button type="button" className="cockpit-domain cockpit-domain--add" onClick={() => navigate('/ontology')}>
              <Plus size={22} strokeWidth={1.6} />
              <span className="cockpit-domain__name">新增知识领域</span>
            </button>
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
