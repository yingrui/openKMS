/**
 * 入图管理 /materialization —— 数据产品「物化 / 同步入图」运行日志。
 *
 * 把「从本体/数据源物化进知识图谱」做成可观测的运行日志:每次 run(全量入图 / 增量同步 /
 * 重算关系边)记录状态、进度、结果(新增实体·关系·失败·跳过)、时间。
 *
 * 半真:动作按钮真实调用 index-to-neo4j(复用 ontologyApi),返回真实 nodes/relationships
 * 数记成一条 completed run;历史 run 预置 + localStorage 持久化。对标 OSL 数据产品·入图管理。
 * Demo-branch:内联 zh-CN。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DatabaseZap, RefreshCw, Layers, GitBranch, Waves, Trash2, X,
  CheckCircle2, XCircle, Loader2, Camera,
} from 'lucide-react';
import { indexObjectTypesToNeo4j, indexLinkTypesToNeo4j } from '../../data/ontologyApi';
import { fetchAllDataSources } from '../../data/dataSourcesApi';
import './MaterializationPage.scss';

type RunType = '全量入图' | '增量同步' | '重算关系边';
type RunStatus = 'completed' | 'failed' | 'running';
type RunRecord = {
  id: string;
  type: RunType;
  trigger: '手动' | '自动';
  status: RunStatus;
  progress: number;
  result: string;
  updatedAt: string; // ISO
  detail?: string;
};

const LS_KEY = 'anli_materialization_runs';

const shortId = (t: RunType) => {
  const prefix = t === '增量同步' ? 'mj' : 'run_';
  const hex = Array.from({ length: 20 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return prefix + hex;
};

// 预置历史 run(演示数据),含失败样例,证明可观测性覆盖成功/失败链路。
const SEED_RUNS: RunRecord[] = [
  { id: 'run_09abd8ed156dd1a01755', type: '全量入图', trigger: '手动', status: 'completed', progress: 100, result: '新增实体 107 · 关系 96 · 失败 0 · 跳过 0', updatedAt: '2026-09-01T09:45:16', detail: '产品 6/6 · 成分 5/5 · 健康主题 5/5 · 内容资产 8/8 · 关系 96/96' },
  { id: 'run_26ba9f8ae79be07aa2f1', type: '增量同步', trigger: '手动', status: 'completed', progress: 100, result: '新增实体 4 · 关系 3 · 失败 0 · 跳过 103', updatedAt: '2026-09-01T09:45:09', detail: '新增文章 4 篇经抽取入图,复用已有实体 103。' },
  { id: 'mjdc014cef7eba085c5d15', type: '增量同步', trigger: '手动', status: 'failed', progress: 45, result: 'err: anli_graph_0831:ie_apply_failed=EntityMatch 未命中主键', updatedAt: '2026-08-31T09:45:35', detail: '实体抽取阶段 3 条记录主键缺失,已回滚该批次。建议补齐 product_code 后重试。' },
  { id: 'run_2e8e0d4643478df1650a', type: '全量入图', trigger: '手动', status: 'completed', progress: 100, result: '新增实体 103 · 关系 93 · 失败 0 · 跳过 0', updatedAt: '2026-08-28T23:22:18', detail: '产品 6/6 · 成分 5/5 · 健康主题 5/5 · 内容资产 4/4 · 关系 93/93' },
  { id: 'run_bae1c1531ecbf3ee8320', type: '重算关系边', trigger: '手动', status: 'completed', progress: 100, result: '重算关系 93 · 失败 0 · 跳过 0', updatedAt: '2026-08-27T23:22:15', detail: '按最新链接类型定义重算全部关系边,未新增实体。' },
];

const TYPE_META: Record<RunType, { icon: typeof Layers; tone: string }> = {
  '全量入图': { icon: Layers, tone: '#2563eb' },
  '增量同步': { icon: Waves, tone: '#0d9488' },
  '重算关系边': { icon: GitBranch, tone: '#d97706' },
};

function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as RunRecord[];
  } catch { /* ignore */ }
  return SEED_RUNS;
}
function saveRuns(runs: RunRecord[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(runs.slice(0, 60))); } catch { /* ignore */ }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function MaterializationPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRecord[]>(() => loadRuns());
  const [neo4jDsId, setNeo4jDsId] = useState<string | null>(null);
  const [dsError, setDsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<RunType | null>(null);
  const [autoIncr, setAutoIncr] = useState(false);
  const [detailRun, setDetailRun] = useState<RunRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { saveRuns(runs); }, [runs]);

  useEffect(() => {
    let alive = true;
    fetchAllDataSources()
      .then((list) => {
        if (!alive) return;
        const neo = list.find((d) => d.kind === 'neo4j');
        if (neo) setNeo4jDsId(neo.id);
        else setDsError('未找到 Neo4j 数据源');
      })
      .catch((e) => alive && setDsError(e instanceof Error ? e.message : '数据源加载失败'));
    return () => { alive = false; };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const runAction = useCallback(async (type: RunType) => {
    if (!neo4jDsId) { showToast(dsError ?? '无可用 Neo4j 数据源'); return; }
    setBusy(type);
    const runId = shortId(type);
    const pending: RunRecord = { id: runId, type, trigger: '手动', status: 'running', progress: 10, result: '正在物化…', updatedAt: new Date().toISOString() };
    setRuns((prev) => [pending, ...prev]);
    try {
      let nodes = 0, rels = 0;
      if (type === '重算关系边') {
        const l = await indexLinkTypesToNeo4j(neo4jDsId);
        rels = l.relationships_created;
      } else {
        const o = await indexObjectTypesToNeo4j(neo4jDsId);
        nodes = o.nodes_created;
        const l = await indexLinkTypesToNeo4j(neo4jDsId);
        rels = l.relationships_created;
      }
      const result = type === '重算关系边'
        ? `重算关系 ${rels} · 失败 0 · 跳过 0`
        : `新增实体 ${nodes} · 关系 ${rels} · 失败 0 · 跳过 0`;
      const done: RunRecord = { ...pending, status: 'completed', progress: 100, result, updatedAt: new Date().toISOString(), detail: `本次物化写入 Neo4j：实体 ${nodes}、关系 ${rels}。` };
      setRuns((prev) => prev.map((r) => (r.id === runId ? done : r)));
      showToast(`${type}完成：实体 ${nodes} · 关系 ${rels}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '入图失败';
      const failed: RunRecord = { ...pending, status: 'failed', progress: 45, result: `err: ${msg}`, updatedAt: new Date().toISOString(), detail: msg };
      setRuns((prev) => prev.map((r) => (r.id === runId ? failed : r)));
      showToast(`${type}失败`);
    } finally {
      setBusy(null);
    }
  }, [neo4jDsId, dsError, showToast]);

  const stats = useMemo(() => {
    const total = runs.length;
    const ok = runs.filter((r) => r.status === 'completed').length;
    const fail = runs.filter((r) => r.status === 'failed').length;
    return { total, ok, fail };
  }, [runs]);

  const ACTIONS: { type: RunType; label: string; icon: typeof Layers }[] = [
    { type: '全量入图', label: '全量入图', icon: Layers },
    { type: '增量同步', label: '增量同步', icon: Waves },
    { type: '重算关系边', label: '重算关系边', icon: GitBranch },
  ];

  return (
    <div className="matz">
      <header className="matz__head">
        <div>
          <div className="matz__crumb">数据产品 / 入图管理</div>
          <h1><DatabaseZap size={22} strokeWidth={2} /> 入图管理</h1>
          <p>把数据产品从数据源 / 本体物化、同步进知识图谱。每次运行的状态、进度、结果全程可观测。</p>
        </div>
        <span className="matz-demobadge">半真演示 · 入图动作真实写入 Neo4j</span>
      </header>

      <div className="matz-stats">
        <div className="matz-stat"><span className="matz-stat__n">{stats.total}</span><span className="matz-stat__l">运行总数</span></div>
        <div className="matz-stat matz-stat--ok"><span className="matz-stat__n">{stats.ok}</span><span className="matz-stat__l">成功</span></div>
        <div className="matz-stat matz-stat--fail"><span className="matz-stat__n">{stats.fail}</span><span className="matz-stat__l">失败</span></div>
        <div className="matz-stat"><span className="matz-stat__n">{neo4jDsId ? 'Neo4j' : '—'}</span><span className="matz-stat__l">目标图库</span></div>
      </div>

      <section className="matz-panel">
        <div className="matz-panel__bar">
          <div className="matz-panel__title">物化 / 同步运行日志</div>
          <div className="matz-actions">
            {ACTIONS.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" className="matz-btn matz-btn--primary"
                disabled={busy !== null || !neo4jDsId}
                onClick={() => runAction(type)}>
                {busy === type ? <Loader2 size={14} className="matz-spin" /> : <Icon size={14} />} {label}
              </button>
            ))}
            <button type="button" className="matz-btn" disabled={busy !== null} onClick={() => showToast('已清理阻塞队列(演示)')}><Trash2 size={14} /> 清理阻塞</button>
            <button type="button" className="matz-btn" onClick={() => showToast('已生成 Guest Snapshot(演示)')}><Camera size={14} /> Guest Snapshot</button>
            <button type="button" className={`matz-toggle${autoIncr ? ' matz-toggle--on' : ''}`} onClick={() => { setAutoIncr((v) => !v); showToast(autoIncr ? '自动增量已关闭' : '自动增量已开启(演示)'); }}>
              自动增量：{autoIncr ? '已开启' : '未开启'}
            </button>
            <button type="button" className="matz-btn" onClick={() => setRuns(loadRuns())}><RefreshCw size={14} /> 刷新</button>
          </div>
        </div>

        {dsError && <div className="matz-warn">{dsError}——入图动作暂不可用,请在「数据源」中配置 Neo4j 数据源。</div>}

        <div className="matz-tablewrap">
          <table className="matz-table">
            <thead>
              <tr><th>Run / Job</th><th>类型</th><th>触发</th><th>Status</th><th>进度</th><th>Result</th><th>Updated</th><th></th></tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const meta = TYPE_META[r.type];
                return (
                  <tr key={r.id} className={r.status === 'failed' ? 'is-failed' : ''}>
                    <td className="matz-mono">{r.id.length > 22 ? r.id.slice(0, 22) + '…' : r.id}</td>
                    <td><span className="matz-typepill" style={{ color: meta.tone, background: meta.tone + '18' }}><meta.icon size={12} /> {r.type}</span></td>
                    <td className="matz-dim">{r.trigger}</td>
                    <td>
                      {r.status === 'completed' && <span className="matz-status matz-status--ok"><CheckCircle2 size={13} /> completed</span>}
                      {r.status === 'failed' && <span className="matz-status matz-status--fail"><XCircle size={13} /> failed</span>}
                      {r.status === 'running' && <span className="matz-status matz-status--run"><Loader2 size={13} className="matz-spin" /> running</span>}
                    </td>
                    <td>
                      <div className="matz-prog">
                        <span className="matz-prog__pct">{r.status === 'failed' ? `完成 ${r.progress}%` : `${r.progress}%`}</span>
                        <div className="matz-prog__bar"><i style={{ width: `${r.progress}%`, background: r.status === 'failed' ? '#f59e0b' : r.status === 'running' ? '#6366f1' : '#16a34a' }} /></div>
                      </div>
                    </td>
                    <td className={`matz-result${r.status === 'failed' ? ' matz-result--err' : ''}`}>{r.result}</td>
                    <td className="matz-dim matz-nowrap">{fmtTime(r.updatedAt)}</td>
                    <td><button type="button" className="matz-detailbtn" onClick={() => setDetailRun(r)}>详情</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="matz-foot">以本域物化任务(mat job)为准;点击「全量入图 / 增量同步」将真实写入 Neo4j 图库。入图完成后可到 <button type="button" className="matz-link" onClick={() => navigate('/kg')}>图谱总览</button> 或 <button type="button" className="matz-link" onClick={() => navigate('/object-explorer')}>图谱查询</button> 查看结果。</div>
      </section>

      {detailRun && (
        <div className="matz-modal" role="dialog" onClick={() => setDetailRun(null)}>
          <div className="matz-modal__card" onClick={(e) => e.stopPropagation()}>
            <div className="matz-modal__head">
              <span>运行详情</span>
              <button type="button" onClick={() => setDetailRun(null)}><X size={16} /></button>
            </div>
            <dl className="matz-kv">
              <div><dt>Run / Job</dt><dd className="matz-mono">{detailRun.id}</dd></div>
              <div><dt>类型</dt><dd>{detailRun.type}</dd></div>
              <div><dt>状态</dt><dd>{detailRun.status}</dd></div>
              <div><dt>结果</dt><dd className={detailRun.status === 'failed' ? 'matz-result--err' : ''}>{detailRun.result}</dd></div>
              <div><dt>时间</dt><dd>{fmtTime(detailRun.updatedAt)}</dd></div>
              {detailRun.detail && <div><dt>明细</dt><dd>{detailRun.detail}</dd></div>}
            </dl>
          </div>
        </div>
      )}

      {toast && <div className="matz-toast">{toast}</div>}
    </div>
  );
}
