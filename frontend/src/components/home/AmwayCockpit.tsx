/**
 * 安利企业知识中枢 · 治理驾驶舱首页。
 *
 * Renders the five boards of the concept homepage from the /api/home/hub aggregate.
 * Every number is real (from that endpoint) except the headline 存量, which is Amway's
 * known CMS total shown next to how many this demo has processed — the true story.
 *
 * The 业务知识地图 is a stylised hub-and-spoke schema diagram (like the concept art),
 * not a live graph render: it names the model, it does not fake live counts.
 *
 * Demo-branch component: labels are inline zh-CN (this is the Amway demo locale), unlike
 * the i18n'd rest of the app.
 */
import { useNavigate } from 'react-router-dom';
import {
  Database,
  UserCheck,
  RefreshCw,
  CalendarClock,
  FileText,
  Search,
  ShoppingCart,
  Headphones,
  Users,
  Bot,
  Upload,
  ShieldCheck,
  Network,
  Target,
} from 'lucide-react';
import type { HomeHubResponse } from '../../data/homeHubApi';
import './AmwayCockpit.scss';

const DOMAIN_ICONS: Record<string, typeof FileText> = {
  产品与成分: Database,
  健康解决方案: ShieldCheck,
  内容运营: FileText,
  云购与长客会: ShoppingCart,
  培训客服: Headphones,
  营销人员服务: Users,
};

const SERVICE_ICONS: Record<string, typeof Search> = {
  企业知识搜索: Search,
  ' 安利云购搜索/推荐': ShoppingCart,
  '安利云购搜索/推荐': ShoppingCart,
  培训与客服助手: Headphones,
  营销人员客户服务: Users,
  '其他 AI / Agent': Bot,
};

export function AmwayCockpit({ hub }: { hub: HomeHubResponse }) {
  const navigate = useNavigate();
  const ov = hub.asset_overview;
  const tasks = hub.governance_tasks ?? [];
  const services = hub.service_health ?? [];
  const domains = hub.knowledge_domains ?? [];

  const metrics = [
    { icon: Database, label: '待治理存量', value: ov?.cms_total ?? 0, tone: 'brand', sub: `已处理 ${ov?.processed ?? 0} 条` },
    { icon: UserCheck, label: '待专业审核', value: ov?.pending_review ?? 0, tone: 'amber' },
    { icon: RefreshCw, label: '来源变化待复审', value: ov?.source_changed ?? 0, tone: 'teal' },
    { icon: CalendarClock, label: '即将失效', value: ov?.expiring ?? 0, tone: 'red' },
  ];

  // 业务知识地图：知识主张为中心的 hub-spoke，对齐概念图
  const spokes = [
    { label: '产品', hint: '产品信息 / 规格', angle: -90 },
    { label: '证据/背书', hint: '临床研究 / 认证', angle: -30 },
    { label: '健康解决方案', hint: '目标人群 / 方案组合', angle: 30 },
    { label: '渠道/适用条件', hint: '合规要求 / 禁忌', angle: 90 },
    { label: '内容资产', hint: '图文 / 视频 / 课件', angle: 150 },
    { label: '成分', hint: '来源 / 作用机理', angle: -150 },
  ];
  const cx = 190, cy = 150, r = 108;
  const pt = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)] as const;

  return (
    <div className="cockpit">
      <header className="cockpit__head">
        <h1>知识资产总览</h1>
        <span>让一套已审核知识同时服务企业员工、营销人员与消费者触点</span>
      </header>

      <section className="cockpit__metrics" aria-label="知识资产总览">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className={`cockpit-metric cockpit-metric--${m.tone}`}>
              <Icon size={26} strokeWidth={1.6} />
              <div>
                <div className="cockpit-metric__label">{m.label}</div>
                <div className="cockpit-metric__value">{m.value.toLocaleString()}</div>
                {m.sub && <div className="cockpit-metric__sub">{m.sub}</div>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="cockpit__mid">
        <div className="cockpit-panel">
          <h2>今日治理</h2>
          <div className="cockpit-tasks">
            {tasks.length === 0 && <p className="cockpit-empty">暂无待办</p>}
            {tasks.map((t, i) => (
              <div key={i} className="cockpit-task">
                <FileText size={15} />
                <span className="cockpit-task__title" title={t.title}>{t.title}</span>
                <span className="cockpit-task__domain">{t.domain}</span>
                <span className="cockpit-task__status">● {t.status}</span>
                <button type="button" onClick={() => navigate('/ontology')}>{t.action}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="cockpit-panel cockpit-panel--map">
          <h2><Network size={16} /> 业务知识地图</h2>
          <svg viewBox="0 0 380 300" className="cockpit-map" role="img" aria-label="以知识主张为中心的业务知识网络">
            {spokes.map((s, i) => {
              const [x, y] = pt(s.angle);
              return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="cockpit-map__edge" />;
            })}
            <circle cx={cx} cy={cy} r={30} className="cockpit-map__center" />
            <text x={cx} y={cy - 3} className="cockpit-map__center-label">知识</text>
            <text x={cx} y={cy + 11} className="cockpit-map__center-label">主张</text>
            {spokes.map((s, i) => {
              const [x, y] = pt(s.angle);
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={20} className="cockpit-map__node" />
                  <text x={x} y={y + 3} className="cockpit-map__node-label">{s.label.slice(0, 4)}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="cockpit-panel">
          <h2>知识服务运行 <span className="cockpit-online">● 已发布知识可用</span></h2>
          <div className="cockpit-services">
            {services.map((s) => {
              const Icon = SERVICE_ICONS[s.name] ?? Bot;
              return (
                <div key={s.name} className="cockpit-service">
                  <Icon size={16} />
                  <span>{s.name}</span>
                  <span className={`cockpit-service__dot${s.online ? ' is-on' : ''}`}>● {s.online ? '正常' : '未就绪'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="cockpit__bottom">
        <div className="cockpit-panel">
          <h2>知识领域</h2>
          <div className="cockpit-domains">
            {domains.map((d) => {
              const Icon = DOMAIN_ICONS[d.name] ?? FileText;
              return (
                <button key={d.name} type="button" className="cockpit-domain" onClick={() => navigate('/articles')}>
                  <Icon size={22} strokeWidth={1.6} />
                  <span className="cockpit-domain__name">{d.name}</span>
                  <span className="cockpit-domain__count">{d.content_count} 条</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cockpit-panel">
          <h2>快速开始</h2>
          <div className="cockpit-quick">
            <button type="button" onClick={() => navigate('/documents')}><Upload size={20} /><span>接入新资料</span></button>
            <button type="button" onClick={() => navigate('/ontology')}><ShieldCheck size={20} /><span>新建知识主张</span></button>
            <button type="button" onClick={() => navigate('/ontology')}><Network size={20} /><span>维护本体</span></button>
            <button type="button" onClick={() => navigate('/evaluations')}><Target size={20} /><span>发起评测</span></button>
          </div>
        </div>
      </section>
    </div>
  );
}
