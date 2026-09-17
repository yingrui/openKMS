/**
 * AI 问答助手 /qa-assistant —— 平台运维下的能力展示页。
 *
 * 展示 qa-agent(LangGraph 知识 Agent)的技能:图谱问答 / 文档章节定位 / 知识库混合检索 /
 * 来源溯源 / 工具编排。这些是 qa-agent 真实具备的能力(ontology、page_index skill +
 * 混合检索 + sources + LangGraph 工具编排),此页贴合安利大健康语境展示,并内嵌可直接试用的
 * 问答 dock(连安利 KB)。Demo-branch:内联 zh-CN。
 */
import {
  Bot, Network, ListTree, Search, BookMarked, Workflow,
  Sparkles, ArrowRight, ShieldCheck, Boxes,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AgentAssistantDock } from '../ontology/AgentAssistantDock';
import './QaAssistantPage.scss';

const ANLI_KB_ID = 'a3ca4923-ff1e-4798-864b-d52eb8903996';

type Skill = {
  icon: LucideIcon; tone: string; name: string; skillId: string;
  desc: string; example: string;
};

const SKILLS: Skill[] = [
  {
    icon: Network, tone: '#2563eb', name: '图谱问答', skillId: 'ontology',
    desc: '把自然语言问题翻译成 Cypher,在安利知识图谱上查询产品·成分·健康主题·人群及其关系,返回结构化答案。',
    example: '叶黄素对应哪些健康主题?哪些产品含有它?',
  },
  {
    icon: ListTree, tone: '#7c3aed', name: '文档章节定位', skillId: 'page_index',
    desc: 'Page Index 技能:面对上百页大文档,先读目录树,再精准取对应章节,避免把全文倒灌进上下文。',
    example: '《产品手册》里益之源净水器的技术规格在第几章?',
  },
  {
    icon: Search, tone: '#059669', name: '知识库混合检索', skillId: 'kb-hybrid-search',
    desc: 'BM25 + 向量 + RRF 融合 + 交叉编码重排,在安利大健康知识库里召回最相关的片段与 FAQ。',
    example: '母乳期妈妈补充蛋白质有什么建议?',
  },
  {
    icon: BookMarked, tone: '#d97706', name: '来源溯源', skillId: 'sources',
    desc: '每条回答都附带引用的文档 / 证据链接,可一键回看原文,让答案可核查、可追溯。',
    example: '这个结论出自哪篇文章?给我原文链接。',
  },
  {
    icon: Workflow, tone: '#0d9488', name: '工具编排', skillId: 'langgraph',
    desc: '基于 LangGraph,按问题自动编排图谱 / 检索 / 文档等工具,并把调用过程实时可视化(工具行)。',
    example: '综合图谱和文档,帮我梳理眼健康相关的产品与证据。',
  },
];

const QUICK = [
  '叶黄素对应哪些健康主题?',
  '母乳期妈妈补充蛋白质有什么建议?',
  '益之源净水器的核心技术是什么?',
  '植物营养素和长寿的关系?',
];

const PIPELINE = ['理解意图', '编排工具', '图谱/检索/文档', '生成答案', '附来源'];

export function QaAssistantPage() {
  return (
    <div className="qaa">
      <header className="qaa__head">
        <div>
          <div className="qaa__crumb">平台运维 / AI 问答助手</div>
          <h1><Bot size={22} strokeWidth={2} /> AI 问答助手</h1>
          <p>基于 LangGraph 的知识 Agent:编排图谱查询、知识库检索与文档定位,面向人与 Agent 提供带来源的问答。以下是它当前具备的技能,右下角可直接试用。</p>
        </div>
        <span className="qaa-demobadge">连接:安利大健康知识库</span>
      </header>

      <div className="qaa-stats">
        <div className="qaa-stat"><Sparkles size={16} /><span className="qaa-stat__n">{SKILLS.length}</span><span className="qaa-stat__l">技能</span></div>
        <div className="qaa-stat"><Boxes size={16} /><span className="qaa-stat__n">1</span><span className="qaa-stat__l">接入知识库</span></div>
        <div className="qaa-stat"><ShieldCheck size={16} /><span className="qaa-stat__n">100%</span><span className="qaa-stat__l">答案带来源</span></div>
      </div>

      <section className="qaa-pipe">
        <div className="qaa-pipe__title">回答流程</div>
        <div className="qaa-pipe__flow">
          {PIPELINE.map((s, i) => (
            <div key={s} className="qaa-pipe__step">
              <span className="qaa-pipe__dot">{i + 1}</span>
              <span>{s}</span>
              {i < PIPELINE.length - 1 && <ArrowRight size={14} className="qaa-pipe__arrow" />}
            </div>
          ))}
        </div>
      </section>

      <section className="qaa-skills">
        <div className="qaa-section-title">技能</div>
        <div className="qaa-skills__grid">
          {SKILLS.map((s) => {
            const Icon = s.icon;
            return (
              <article key={s.skillId} className="qaa-card">
                <div className="qaa-card__head">
                  <span className="qaa-card__icon" style={{ background: s.tone + '18', color: s.tone }}><Icon size={18} /></span>
                  <div>
                    <div className="qaa-card__name">{s.name}</div>
                    <code className="qaa-card__id">{s.skillId}</code>
                  </div>
                </div>
                <p className="qaa-card__desc">{s.desc}</p>
                <div className="qaa-card__example"><span>示例</span>{s.example}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="qaa-try">
        <div>
          <div className="qaa-section-title">立即试用</div>
          <p>点击右下角「AI 知识助手」气泡,基于已审核的安利大健康知识库直接提问——回答会实时展示调用了哪些技能,并附来源。</p>
        </div>
        <div className="qaa-try__chips">
          {QUICK.map((q) => <span key={q} className="qaa-try__chip">{q}</span>)}
        </div>
      </section>

      {/* 内嵌真实可用的问答 dock(浮动在右下角,连安利 KB) */}
      <AgentAssistantDock
        kbId={ANLI_KB_ID}
        title="AI 知识助手"
        greeting="你好,我是安利企业知识助手,可基于已审核的知识库回答产品、成分、健康方案与合规等问题,并给出来源。"
        quickPrompts={QUICK}
      />
    </div>
  );
}
