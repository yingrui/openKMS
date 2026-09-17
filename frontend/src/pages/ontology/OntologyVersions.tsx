/**
 * 版本记录 /ontology/versions —— 本体版本时间线、差异、影响与发布/回滚(mock,后端暂无本体版本化)。
 * 一期简版:版本列表 + 选中版本的变更摘要;完整 diff/影响分析留二期。
 * Demo-branch:内联 zh-CN。
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { GitBranch, Plus, Minus, PencilLine, CheckCircle2, Clock, Info } from 'lucide-react';
import './OntologyVersions.scss';

type Change = { kind: 'add' | 'remove' | 'edit'; text: string };
type Version = {
  id: string; tag: string; title: string; status: '已发布' | '草稿' | '待评审';
  author: string; date: string; changes: Change[]; impact: string;
};

const VERSIONS: Version[] = [
  {
    id: 'v12', tag: 'KG1.2', title: '体重管理本体扩展', status: '草稿', author: '王佳', date: '2026-09-06',
    changes: [
      { kind: 'add', text: '新增关系类型「指标 →反映→ 健康主题」' },
      { kind: 'add', text: '新增对象类型「服务场景」及实例「体验馆检测」' },
      { kind: 'edit', text: '「健康指标」新增属性:单位、参考范围、适用人群' },
    ],
    impact: '影响 3 个对象类型 · 48 个指标实例 · 1 个知识服务(营养合规问答)',
  },
  {
    id: 'v11', tag: 'KG1.1', title: '产品—成分—证据链完善', status: '已发布', author: '李强', date: '2026-08-20',
    changes: [
      { kind: 'add', text: '新增关系「宣称 →依据→ 研究/证书」' },
      { kind: 'edit', text: '「产品」补充属性:适用人群、禁忌说明' },
    ],
    impact: '影响 12 个产品实例 · 2 个知识服务',
  },
  {
    id: 'v10', tag: 'KG1.0', title: '企业核心本体基线', status: '已发布', author: '知识工程', date: '2026-07-30',
    changes: [
      { kind: 'add', text: '建立 产品 / 成分 / 指标 / 健康主题 / 服务场景 / 内容资产 六大对象类型' },
      { kind: 'add', text: '建立 包含 / 适用于 / 产生指标 / 关联内容 等核心关系' },
    ],
    impact: '基线版本',
  },
];

const KIND_ICON = { add: Plus, remove: Minus, edit: PencilLine } as const;

export function OntologyVersions() {
  const [selectedId, setSelectedId] = useState('v12');
  const v = VERSIONS.find((x) => x.id === selectedId) ?? VERSIONS[0];
  const act = (label: string) => toast.success(`${label}（演示）：${v.tag} ${v.title}`);

  return (
    <div className="over">
      <header className="over__head">
        <div>
          <h1>版本记录</h1>
          <p>本体每次变更形成可追溯的版本——查看差异、影响范围,提交评审、发布或回滚。</p>
        </div>
        <span className="over-demobadge"><Info size={14} /> 演示数据</span>
      </header>

      <div className="over-body">
        <aside className="over-timeline">
          {VERSIONS.map((ver) => (
            <button key={ver.id} type="button" className={`over-vitem${v.id === ver.id ? ' is-active' : ''}`} onClick={() => setSelectedId(ver.id)}>
              <span className="over-vitem__dot" />
              <div>
                <div className="over-vitem__tag"><GitBranch size={13} /> {ver.tag}
                  <span className={`over-status over-status--${ver.status === '已发布' ? 'pub' : ver.status === '草稿' ? 'draft' : 'review'}`}>{ver.status}</span>
                </div>
                <div className="over-vitem__title">{ver.title}</div>
                <div className="over-vitem__meta">{ver.author} · {ver.date}</div>
              </div>
            </button>
          ))}
        </aside>

        <section className="over-detail">
          <div className="over-detail__head">
            <h2><GitBranch size={18} /> {v.tag} · {v.title}</h2>
            <span className="over-detail__meta"><Clock size={13} /> {v.author} · {v.date}</span>
          </div>

          <div className="over-sec">变更摘要</div>
          <ul className="over-changes">
            {v.changes.map((c, i) => {
              const Icon = KIND_ICON[c.kind];
              return <li key={i} className={`over-change over-change--${c.kind}`}><Icon size={14} /> {c.text}</li>;
            })}
          </ul>

          <div className="over-sec">影响分析</div>
          <div className="over-impact"><CheckCircle2 size={14} /> {v.impact}</div>

          <div className="over-actions">
            <button type="button" className="over-btn over-btn--muted" onClick={() => act('回滚到此版本')}>回滚</button>
            <button type="button" className="over-btn over-btn--ghost" onClick={() => act('查看完整差异')}>查看完整差异</button>
            <button type="button" className="over-btn over-btn--primary" onClick={() => act('提交评审')}>提交评审</button>
          </div>
        </section>
      </div>
    </div>
  );
}
