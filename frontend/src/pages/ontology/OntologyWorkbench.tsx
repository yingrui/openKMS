/**
 * 编排工作台 /ontology/workbench —— 把「对象类型 + 关联类型 + 值索引 + 规则与动作」收进一个建模工作台。
 *
 * 一期:顶部模式 tab 切换;对象/关系直接内嵌现有真实 CRUD(ObjectTypesPage / LinkTypesPage,
 * 其 modal 表单即属性编辑器);值索引 / 规则与动作为 mock 占位。二期再做三栏画布 + 中文业务名。
 *
 * Demo-branch:内联 zh-CN。
 */
import { useState } from 'react';
import { Boxes, Share2, Hash, Zap, Info } from 'lucide-react';
import { ObjectTypesPage } from './ObjectTypesPage';
import { LinkTypesPage } from './LinkTypesPage';
import './OntologyWorkbench.scss';

type Mode = 'object' | 'relation' | 'valueIndex' | 'rules';
const MODES: { key: Mode; label: string; icon: typeof Boxes }[] = [
  { key: 'object', label: '对象', icon: Boxes },
  { key: 'relation', label: '关系', icon: Share2 },
  { key: 'valueIndex', label: '值索引', icon: Hash },
  { key: 'rules', label: '规则与动作', icon: Zap },
];

// 值索引 mock(演示:标准名/编码/同义词/值域映射)
const VALUE_INDEX_MOCK = [
  { cn: '体脂率', code: 'body_fat_rate', syn: 'PBF、Body Fat Percentage', unit: '%', type: '数值' },
  { cn: '骨骼肌量', code: 'skeletal_muscle_mass', syn: 'SMM', unit: 'kg', type: '数值' },
  { cn: '体重管理', code: 'weight_management', syn: '减脂、控重', unit: '—', type: '健康主题' },
  { cn: '叶黄素', code: 'lutein', syn: 'Lutein、玉米黄质(相关)', unit: 'mg', type: '成分' },
];

// 规则与动作 mock
const RULES_MOCK = [
  { when: '体脂率进入需关注区间', then: '提醒营养健康顾问跟进 + 推送已发布方案', guard: '需用户授权 · 不做医疗诊断' },
  { when: '到达计划复测时间', then: '发送复测提醒 / 体验馆预约入口', guard: '控制频率 · 允许拒收' },
  { when: '结果超出知识服务边界', then: '停止自动建议,转专业人员', guard: '人工兜底 · 保留审计' },
];

export function OntologyWorkbench() {
  const [mode, setMode] = useState<Mode>('object');

  return (
    <div className="owb">
      <header className="owb__head">
        <div>
          <h1>编排工作台</h1>
          <p>在一处完成对象类型、关系、值索引与规则的建模——定义「类型与规则」,实例交由知识图谱管理。</p>
        </div>
      </header>

      <nav className="owb-modes">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button key={m.key} type="button" className={`owb-mode${mode === m.key ? ' is-active' : ''}`} onClick={() => setMode(m.key)}>
              <Icon size={16} /> {m.label}
            </button>
          );
        })}
      </nav>

      <div className="owb-body">
        {mode === 'object' && <ObjectTypesPage />}
        {mode === 'relation' && <LinkTypesPage />}

        {mode === 'valueIndex' && (
          <section className="owb-mock">
            <div className="owb-mock__note"><Info size={14} /> 值索引:统一「它叫什么」——标准名、编码、同义词与跨系统值映射(演示数据,建设中)。</div>
            <div className="owb-table">
              <div className="owb-table__head"><span>标准名称</span><span>对象编码</span><span>同义词</span><span>单位</span><span>数据类型</span></div>
              {VALUE_INDEX_MOCK.map((r) => (
                <div key={r.code} className="owb-table__row">
                  <span><b>{r.cn}</b></span><span className="owb-code">{r.code}</span><span>{r.syn}</span><span>{r.unit}</span><span>{r.type}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === 'rules' && (
          <section className="owb-mock">
            <div className="owb-mock__note"><Info size={14} /> 规则与动作:什么条件下允许触发什么受控动作(演示数据,建设中)。只有已发布知识与已批准规则能驱动动作。</div>
            <div className="owb-rules">
              {RULES_MOCK.map((r, i) => (
                <div key={i} className="owb-rule">
                  <div className="owb-rule__when"><span className="owb-rule__tag">当</span>{r.when}</div>
                  <div className="owb-rule__then"><span className="owb-rule__tag owb-rule__tag--then">则</span>{r.then}</div>
                  <div className="owb-rule__guard">安全边界:{r.guard}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
