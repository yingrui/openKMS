/**
 * 审核发布 /review —— 知识治理审核控制台(对齐方案概念图)。
 *
 * 骨架真实(内容审核=文章 LLM 评审+生命周期/版本;本体/图谱/服务变更 openKMS 暂无变更审批追踪),
 * 队列与右侧结构化结果用 anli demo 内容 mock,标注「演示数据」。三栏:审核队列 / 原始内容与证据 / 结构化结果。
 *
 * Demo-branch 页面:内联 zh-CN 文案。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Layers, Users, BarChart3, Share2, CalendarClock, ShieldCheck, FileText, ExternalLink,
  History, Info, ChevronRight, Database, Boxes, Network, ClipboardCheck, Search as SearchIcon,
} from 'lucide-react';
import { WorkflowPage } from '../ontology/WorkflowPage';
import './ReviewPublish.scss';

type Risk = 'high' | 'mid' | 'low';
type ChangeType = 'extract' | 'content' | 'ontology' | 'graph' | 'service';

const CHANGE_LABEL: Record<ChangeType, string> = {
  extract: '抽取结果', content: '内容发布', ontology: '本体变更', graph: '图谱变更', service: '服务发布',
};
const RISK_LABEL: Record<Risk, string> = { high: '高风险', mid: '中风险', low: '低风险' };

type StructRow = { icon: typeof Layers; label: string; value: string };
type QueueItem = {
  id: string;
  title: string;
  changeType: ChangeType;
  domain: string;
  risk: Risk;
  submitter: string;
  timeAgo: string;
  submitTime: string;
  impact: string;
  publishVersion: string;
  source: { file: string; page: string; version: string; owner: string; effective: string };
  evidenceTitle: string;
  evidence: { text: string; highlight?: boolean }[];
  struct: StructRow[];
  confidence: number;
  docPage: number;
  graphNodes: number;
  ontologyOk: boolean;
  dedupeOk: boolean;
};

// —— 演示数据(对齐概念图;标注 mock)——
const QUEUE: QueueItem[] = [
  {
    id: 'q1', title: 'InBody H30 体脂率指标解读', changeType: 'extract', domain: '体重管理', risk: 'high',
    submitter: '张晓敏', timeAgo: '30 分钟前', submitTime: '2024-05-12 10:23',
    impact: '3 个图谱节点 · 1 个知识服务', publishVersion: 'v2024.05.12',
    source: { file: 'InBody H30 用户手册.pdf', page: '12', version: 'V2.1', owner: '产品技术部', effective: '2024-05-01' },
    evidenceTitle: '3.3 体脂率（PBF）指标解读',
    evidence: [
      { text: '体脂率（PBF）是体内脂肪重量占总体重的百分比，反映个体脂肪含量的相对水平，是体重管理与健康评估的重要参考指标。' },
      { text: '为保证检测结果的准确性，建议在以下条件下进行复测：同一时间段（前后误差不超过 2 小时）、空腹状态、排空膀胱、未进行剧烈运动且充分休息。', highlight: true },
      { text: '若复测结果与前次差异超过 2%，请检查测试条件是否一致，并确认设备电极片清洁、握姿与站姿正确，必要时重新检测。' },
      { text: '注意：本设备测得的体脂率为估算值，不能替代医疗诊断。如有健康问题，请咨询专业医疗人员。' },
    ],
    struct: [
      { icon: Users, label: '对象', value: 'InBody H30' },
      { icon: BarChart3, label: '指标', value: '体脂率' },
      { icon: Share2, label: '关系', value: '产生指标' },
      { icon: CalendarClock, label: '适用场景', value: '体验馆检测' },
      { icon: ShieldCheck, label: '健康主题', value: '体重管理' },
    ],
    confidence: 96, docPage: 12, graphNodes: 3, ontologyOk: true, dedupeOk: true,
  },
  {
    id: 'q2', title: '浓缩清洁剂稀释比例更新', changeType: 'content', domain: '家居清洁', risk: 'mid',
    submitter: '李明', timeAgo: '1 小时前', submitTime: '2024-05-12 09:40',
    impact: '2 个知识服务', publishVersion: 'v2024.05.12',
    source: { file: '优生活多用途浓缩清洁剂说明.pdf', page: '3', version: 'V1.4', owner: '家居品类', effective: '2024-05-08' },
    evidenceTitle: '稀释与使用比例',
    evidence: [
      { text: '多用途浓缩清洁剂建议按 1:20 稀释用于日常清洁；重油污区域可提高至 1:8，作用 3–5 分钟后擦拭。', highlight: true },
      { text: '不建议用于未封釉的天然石材与实木表面；使用后请充分通风并存放于儿童接触不到处。' },
    ],
    struct: [
      { icon: Users, label: '对象', value: '多用途浓缩清洁剂' },
      { icon: BarChart3, label: '属性', value: '稀释比例 1:20 / 1:8' },
      { icon: Share2, label: '关系', value: '适用于→污渍/材质' },
      { icon: CalendarClock, label: '适用场景', value: '日常清洁' },
      { icon: ShieldCheck, label: '合规提示', value: '禁忌材质已标注' },
    ],
    confidence: 92, docPage: 3, graphNodes: 2, ontologyOk: true, dedupeOk: true,
  },
  {
    id: 'q3', title: '体重管理本体新增关系', changeType: 'ontology', domain: '体重管理', risk: 'mid',
    submitter: '王佳', timeAgo: '2 小时前', submitTime: '2024-05-12 08:55',
    impact: '本体：新增 1 个关系类型', publishVersion: 'v2024.05.12',
    source: { file: '本体变更提案 · 体重管理.md', page: '—', version: 'draft', owner: '知识工程', effective: '—' },
    evidenceTitle: '关系类型：指标—反映→健康主题',
    evidence: [
      { text: '提案新增关系类型「指标 —反映→ 健康主题」，用于把 InBody 体成分指标与「体重管理 / 代谢健康」等健康主题关联，支撑指标解读与方案推荐。', highlight: true },
      { text: '基数：多对多；不携带边属性;方向：指标→健康主题。' },
    ],
    struct: [
      { icon: Boxes, label: '关系类型', value: '指标 →反映→ 健康主题' },
      { icon: Share2, label: '基数', value: '多对多' },
      { icon: Network, label: '影响对象类型', value: '指标 / 健康主题' },
      { icon: CalendarClock, label: '适用范围', value: '大健康与营养' },
    ],
    confidence: 88, docPage: 0, graphNodes: 2, ontologyOk: true, dedupeOk: true,
  },
  {
    id: 'q4', title: 'InBody H30 检测场景补充', changeType: 'graph', domain: '体重管理', risk: 'low',
    submitter: '陈晨', timeAgo: '3 小时前', submitTime: '2024-05-12 07:30',
    impact: '图谱：新增 1 个实例 · 1 条关系', publishVersion: 'v2024.05.12',
    source: { file: '体验馆检测流程.md', page: '—', version: 'V1.0', owner: '门店运营', effective: '2024-04-20' },
    evidenceTitle: '实例：适用场景「体验馆检测」',
    evidence: [
      { text: '为 InBody H30 补充适用场景实例「体验馆检测」，并建立 设备 —用于→ 场景 关系，用于门店服务与预约提醒。', highlight: true },
    ],
    struct: [
      { icon: Network, label: '新增实例', value: '体验馆检测（场景）' },
      { icon: Share2, label: '新增关系', value: 'InBody H30 →用于→ 体验馆检测' },
      { icon: ShieldCheck, label: '健康主题', value: '体重管理' },
    ],
    confidence: 90, docPage: 0, graphNodes: 1, ontologyOk: true, dedupeOk: true,
  },
  {
    id: 'q5', title: '营养问答服务 v1.4 发布', changeType: 'service', domain: '营养健康', risk: 'low',
    submitter: '刘洋', timeAgo: '5 小时前', submitTime: '2024-05-12 05:10',
    impact: '知识服务：营养问答 v1.3 → v1.4', publishVersion: 'v1.4',
    source: { file: '营养问答服务评测报告.md', page: '—', version: 'v1.4', owner: 'AI 平台', effective: '2024-05-12' },
    evidenceTitle: '评测：命中率 94.8% · badcase 已修复 5 例',
    evidence: [
      { text: '基于最新已发布知识重建索引后，营养问答在 120 条评测集上的命中率由 91.2% 提升至 94.8%，叶黄素 / 体重管理相关 badcase 全部修复。', highlight: true },
      { text: '本次发布仅使用已审核发布的知识与已批准规则,回答均可溯源。' },
    ],
    struct: [
      { icon: Layers, label: '服务', value: '营养问答' },
      { icon: BarChart3, label: '版本', value: 'v1.3 → v1.4' },
      { icon: BarChart3, label: '命中率', value: '91.2% → 94.8%' },
      { icon: ShieldCheck, label: '溯源', value: '全部可溯源' },
    ],
    confidence: 95, docPage: 0, graphNodes: 0, ontologyOk: true, dedupeOk: true,
  },
];

type ReviewTab = ChangeType | 'mine' | 'workflow';
const TABS: { key: ReviewTab; label: string; count?: number }[] = [
  { key: 'mine', label: '待我审核', count: 18 },
  { key: 'content', label: '内容发布', count: 6 },
  { key: 'extract', label: '抽取结果', count: 5 },
  { key: 'ontology', label: '本体变更', count: 3 },
  { key: 'graph', label: '图谱变更', count: 2 },
  { key: 'service', label: '服务发布', count: 2 },
  { key: 'workflow', label: '工作流' },
];

const RISK_DOT: Record<Risk, string> = { high: '#dc2626', mid: '#d97706', low: '#16a34a' };

export function ReviewPublish() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ReviewTab>('mine');
  const [selectedId, setSelectedId] = useState('q1');

  const visibleQueue = useMemo(
    () => (tab === 'mine' ? QUEUE : QUEUE.filter((q) => q.changeType === tab)),
    [tab],
  );
  const item = QUEUE.find((q) => q.id === selectedId) ?? visibleQueue[0] ?? QUEUE[0];

  const act = (label: string) => toast.success(`${label}（演示）：${item.title}`);

  return (
    <div className="rev">
      <header className="rev__head">
        <div>
          <h1>审核发布</h1>
          <p>以原始证据为依据，审核知识变更并形成可追溯的发布版本。</p>
        </div>
        <div className="rev__head-right">
          <span className="rev-demobadge"><Database size={14} /> 演示数据</span>
          <button type="button" className="rev-btn rev-btn--primary" onClick={() => act('批量处理')}>批量处理</button>
        </div>
      </header>

      <nav className="rev-tabs">
        {TABS.map((tb) => (
          <button key={tb.key} type="button"
            className={`rev-tab${tab === tb.key ? ' is-active' : ''}`}
            onClick={() => { setTab(tb.key); }}>
            {tb.label}{tb.count != null && <span className="rev-tab__count">{tb.count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'workflow' ? (
        <div className="rev-workflow"><WorkflowPage /></div>
      ) : (
      <>
      <div className="rev-filters">
        <div className="rev-filter"><SearchIcon size={14} /> 风险等级 <ChevronRight size={13} className="rev-filter__chev" /></div>
        <div className="rev-filter">业务域 <ChevronRight size={13} className="rev-filter__chev" /></div>
        <div className="rev-filter">提交人 <ChevronRight size={13} className="rev-filter__chev" /></div>
      </div>

      <div className="rev-body">
        {/* 左:审核队列 */}
        <aside className="rev-queue">
          <div className="rev-queue__title"><ClipboardCheck size={15} /> 审核队列</div>
          <ul className="rev-queue__list">
            {visibleQueue.map((q) => (
              <li key={q.id}>
                <button type="button"
                  className={`rev-qitem${item.id === q.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(q.id)}>
                  <span className="rev-qitem__dot" style={{ background: RISK_DOT[q.risk] }} />
                  <div className="rev-qitem__body">
                    <div className="rev-qitem__title">{q.title}</div>
                    <div className="rev-qitem__meta">
                      <span>{CHANGE_LABEL[q.changeType]}</span>
                      <span>·</span>
                      <span>{q.domain}</span>
                      <span className={`rev-risk rev-risk--${q.risk}`}>{RISK_LABEL[q.risk]}</span>
                    </div>
                    <div className="rev-qitem__sub">提交人: {q.submitter} · {q.timeAgo}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 中:原始内容与证据 */}
        <section className="rev-evidence">
          <div className="rev-panel__title"><FileText size={15} /> 原始内容与证据</div>
          <div className="rev-srcmeta">
            <div><span>来源文件</span><b><FileText size={13} /> {item.source.file}</b></div>
            <div><span>页码</span><b>{item.source.page}</b></div>
            <div><span>版本</span><b>{item.source.version}</b></div>
            <div><span>所有者</span><b>{item.source.owner}</b></div>
            <div><span>生效日期</span><b>{item.source.effective}</b></div>
          </div>
          <div className="rev-srcactions">
            <button type="button" className="rev-btn rev-btn--ghost" onClick={() => navigate('/content')}>
              <ExternalLink size={13} /> 查看原文
            </button>
            <button type="button" className="rev-btn rev-btn--ghost" onClick={() => act('查看历史版本')}>
              <History size={13} /> 查看历史版本
            </button>
          </div>
          <div className="rev-evbody">
            <h3>{item.evidenceTitle}</h3>
            {item.evidence.map((p, i) => (
              <p key={i} className={p.highlight ? 'rev-ev-hl' : undefined}>{p.text}</p>
            ))}
          </div>
        </section>

        {/* 右:结构化结果 */}
        <aside className="rev-struct">
          <div className="rev-panel__title"><Boxes size={15} /> 结构化结果</div>
          <dl className="rev-struct__grid">
            {item.struct.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.label} className="rev-struct__row">
                  <dt><Icon size={15} /> {r.label}</dt>
                  <dd>{r.value} <Info size={13} className="rev-struct__info" /></dd>
                </div>
              );
            })}
          </dl>
          <div className="rev-struct__foot">
            <div className="rev-confidence">
              <span className="rev-confidence__label">置信度</span>
              <span className="rev-confidence__val">{item.confidence}%</span>
            </div>
            <div className="rev-links">
              <span className="rev-links__label">来源链接</span>
              <div className="rev-links__row">
                {item.docPage > 0 && <button type="button" onClick={() => navigate('/content')}><ExternalLink size={12} /> 文档页 {item.docPage}</button>}
                {item.graphNodes > 0 && <button type="button" onClick={() => navigate('/knowledge-map')}><Network size={12} /> 相关图谱节点</button>}
              </div>
            </div>
          </div>
          <div className="rev-checks">
            <div className="rev-check"><span>本体校验</span><b className={item.ontologyOk ? 'ok' : 'bad'}>{item.ontologyOk ? '✔ 通过' : '✘ 未通过'}</b></div>
            <div className="rev-check"><span>重复性检查</span><b className={item.dedupeOk ? 'ok' : 'bad'}>{item.dedupeOk ? '✔ 无冲突' : '✘ 有冲突'}</b></div>
          </div>
        </aside>
      </div>

      {/* 底部操作条 */}
      <footer className="rev-actionbar">
        <div className="rev-actionbar__meta">
          <div><Users size={14} /> 提交人 <b>{item.submitter}</b></div>
          <div><CalendarClock size={14} /> 提交时间 <b>{item.submitTime}</b></div>
          <div><Layers size={14} /> 影响范围 <b>{item.impact}</b></div>
          <div><ShieldCheck size={14} /> 发布版本(预计) <b>{item.publishVersion}</b></div>
        </div>
        <div className="rev-actionbar__btns">
          <button type="button" className="rev-btn rev-btn--muted" onClick={() => act('退回修改')}>退回修改</button>
          <button type="button" className="rev-btn rev-btn--ghost" onClick={() => act('编辑后通过')}>编辑后通过</button>
          <button type="button" className="rev-btn rev-btn--primary" onClick={() => act('通过并发布')}>通过并发布</button>
        </div>
      </footer>
      </>
      )}
    </div>
  );
}
