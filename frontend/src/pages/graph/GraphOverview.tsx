/**
 * 图谱总览 /kg —— 安利业务知识图谱总览(可拖拽力导图)。
 *
 * 以「安利业务」为中心的 hub-spoke:业务线 → 产品 → 成分 → 健康主题,并接入真实的
 * 「内容频道」节点,点击可深链到对应文章频道(/articles/channels/:id)——证明「结构化抽取
 * → 建本体 → 建图谱」的链路(到频道层,不逐篇铺开)。其余节点点击进入图谱查询。
 * 节点可拖拽、滚轮缩放。演示数据(示意图,非实时)。
 *
 * Demo-branch:内联 zh-CN。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';
import { RotateCcw, Maximize2 } from 'lucide-react';
import './GraphOverview.scss';

type Group = 'center' | 'line' | 'product' | 'nutrient' | 'concern' | 'content' | 'audience';
type GNode = { id: string; name: string; group: Group; val: number; href?: string; x?: number; y?: number };
type GLink = { source: string; target: string; label: string };

const GROUP_COLOR: Record<Group, string> = {
  center: '#16a34a', line: '#d97706', product: '#e4002b', nutrient: '#059669',
  concern: '#2563eb', content: '#7c3aed', audience: '#0d9488',
};
const GROUP_LABEL: Record<Group, string> = {
  center: '中心', line: '业务线', product: '产品', nutrient: '成分',
  concern: '健康主题', content: '内容频道', audience: '人群',
};

const N = (id: string, name: string, group: Group, val = 4, href?: string): GNode => ({ id, name, group, val, href });

// 内容频道节点 → 真实文章频道(/articles/channels/:id),点击进入该频道下的全部文章,
// 证明「结构化抽取 → 建本体 → 建图谱」闭环(到频道层,不逐篇铺开)。
const CH = (id: string) => `/articles/channels/${id}`;

const NODES: GNode[] = [
  N('center', '安利业务', 'center', 14),
  // 业务线
  N('line_health', '大健康与营养', 'line', 9),
  N('line_beauty', '美容与个人护理', 'line', 7),
  N('line_home', '家庭生活与智能设备', 'line', 7),
  N('line_digital', '数字商业与会员', 'line', 6),
  N('line_center', '体验馆与社群', 'line', 6),
  // 产品
  N('p_nutrilite', '纽崔莱', 'product', 6),
  N('p_hanbencui', '汉本萃', 'product', 5),
  N('p_xs', 'XS 运动营养', 'product', 4),
  N('p_artistry', '雅姿', 'product', 5),
  N('p_espring', '益之源净水器', 'product', 5),
  N('p_atmosphere', '逸新空气净化器', 'product', 4),
  // 成分
  N('n_lutein', '叶黄素', 'nutrient', 4),
  N('n_zeaxanthin', '玉米黄质', 'nutrient', 4),
  N('n_phyto', '植物营养素', 'nutrient', 5),
  N('n_protein', '蛋白质', 'nutrient', 4),
  N('n_probiotic', '益生菌', 'nutrient', 4),
  // 健康主题
  N('c_weight', '体重管理', 'concern', 5),
  N('c_brain', '脑健康', 'concern', 5),
  N('c_eye', '眼健康', 'concern', 5),
  N('c_immune', '免疫健康', 'concern', 5),
  N('c_metabolic', '代谢健康', 'concern', 4),
  // 内容频道(真实文章频道,点击进入频道;避开与概念节点同名以免视觉混淆)
  N('ct_antiaging', '活力焕龄·抗衰', 'content', 5, CH('ac_67389503')),
  N('ct_special', '专项健康', 'content', 5, CH('ac_7a772822')),
  N('ct_breakfast', '营养早餐', 'content', 5, CH('ac_4701a4a1')),
  N('ct_product', '产品资讯', 'content', 5, CH('ac_e675e2c9')),
  // 人群
  N('aud_senior', '中老年人群', 'audience', 3),
  N('aud_worker', '上班族', 'audience', 3),
];

const L = (source: string, target: string, label: string): GLink => ({ source, target, label });
const LINKS: GLink[] = [
  // 中心 → 业务线
  L('center', 'line_health', '包含'), L('center', 'line_beauty', '包含'), L('center', 'line_home', '包含'),
  L('center', 'line_digital', '包含'), L('center', 'line_center', '包含'),
  // 业务线 → 产品
  L('line_health', 'p_nutrilite', '产品'), L('line_health', 'p_hanbencui', '产品'), L('line_health', 'p_xs', '产品'),
  L('line_beauty', 'p_artistry', '产品'), L('line_home', 'p_espring', '产品'), L('line_home', 'p_atmosphere', '产品'),
  // 业务线 → 健康主题
  L('line_health', 'c_weight', '覆盖'), L('line_health', 'c_brain', '覆盖'), L('line_health', 'c_eye', '覆盖'),
  L('line_health', 'c_immune', '覆盖'), L('line_health', 'c_metabolic', '覆盖'),
  // 产品 → 成分
  L('p_nutrilite', 'n_lutein', '含有'), L('p_nutrilite', 'n_zeaxanthin', '含有'), L('p_nutrilite', 'n_protein', '含有'),
  L('p_hanbencui', 'n_phyto', '含有'), L('p_nutrilite', 'n_probiotic', '含有'),
  // 成分 → 健康主题
  L('n_lutein', 'c_eye', '改善'), L('n_zeaxanthin', 'c_eye', '改善'), L('n_phyto', 'c_brain', '改善'),
  L('n_probiotic', 'c_immune', '改善'), L('n_protein', 'c_weight', '支持'),
  // 内容频道 → 主题/产品(承载内容)——结构化抽取回连
  L('ct_antiaging', 'c_brain', '内容'), L('ct_special', 'c_eye', '内容'),
  L('ct_breakfast', 'c_weight', '内容'), L('ct_product', 'p_espring', '内容'),
  // 主题 → 人群
  L('c_eye', 'aud_senior', '面向'), L('c_weight', 'aud_worker', '面向'),
];

export function GraphOverview() {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GNode, GLink>>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const data = useMemo(() => ({ nodes: NODES.map((n) => ({ ...n })), links: LINKS.map((l) => ({ ...l })) }), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 调力:加大排斥、拉开连线,减少标签重叠。
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    const charge = g.d3Force('charge');
    if (charge) charge.strength(-520);
    const link = g.d3Force('link') as {
      distance?: (fn: (l: GLink) => number) => void;
    } | undefined;
    if (link?.distance) {
      link.distance((l) => (l.source === 'center' || (l as { source?: { id?: string } }).source?.id === 'center' ? 150 : 78));
    }
    g.d3Force('collide', forceCollide((node: object) => ((node as GNode).val ?? 4) * 1.25 + 24));
    g.d3ReheatSimulation();
    const t = setTimeout(() => graphRef.current?.zoomToFit(500, 36), 1400);
    return () => clearTimeout(t);
  }, [size.width]);

  const legend: Group[] = ['center', 'line', 'product', 'nutrient', 'concern', 'content', 'audience'];

  return (
    <div className="gov2">
      <header className="gov2__head">
        <div>
          <h1>图谱总览</h1>
          <p>以「安利业务」为中心的业务知识图谱：业务线 → 产品 → 成分 → 健康主题，内容频道经结构化抽取回连主题与成分。点击节点可跳转（内容频道进入对应文章频道，其余进入图谱查询），节点可拖拽、滚轮缩放。</p>
        </div>
        <span className="gov2-demobadge">演示数据 · 示意图</span>
      </header>

      <div className="gov2-canvas" ref={wrapRef}>
        <div className="gov2-toolbar">
          <button type="button" title="重置视图" onClick={() => graphRef.current?.zoomToFit(400, 60)}><Maximize2 size={15} /></button>
          <button type="button" title="重排" onClick={() => { graphRef.current?.d3ReheatSimulation(); }}><RotateCcw size={15} /></button>
        </div>
        <div className="gov2-legend">
          {legend.map((g) => (
            <span key={g} className="gov2-legend__item"><i style={{ background: GROUP_COLOR[g] }} /> {GROUP_LABEL[g]}</span>
          ))}
        </div>
        {size.width > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={data}
            width={size.width}
            height={size.height}
            cooldownTicks={140}
            onEngineStop={() => graphRef.current?.zoomToFit(500, 36)}
            nodeLabel={(n) => `${GROUP_LABEL[(n as GNode).group]}：${(n as GNode).name}`}
            linkLabel={(l) => (l as GLink).label}
            linkColor={() => 'rgba(120,130,150,0.4)'}
            linkWidth={1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0.08}
            backgroundColor="#ffffff"
            onNodeClick={(node) => {
              const n = node as GNode;
              navigate(n.href ?? '/object-explorer');
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GNode;
              const color = GROUP_COLOR[n.group];
              const emphasized = n.group === 'center' || n.group === 'line';
              const r = (n.val ?? 4) * 1.25 + (n.group === 'center' ? 6 : emphasized ? 3 : 2);
              const x = n.x ?? 0, y = n.y ?? 0;
              // 外圈光晕
              ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, 2 * Math.PI);
              ctx.fillStyle = color + '22'; ctx.fill();
              // 实心圆点 + 白描边
              ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color; ctx.fill();
              ctx.lineWidth = 1.5 / globalScale; ctx.strokeStyle = '#ffffff'; ctx.stroke();
              // 标签:白底圆角药丸,字号收敛统一
              const fontSize = Math.max(emphasized ? 4.5 : 4, (emphasized ? 12 : 10.5) / globalScale);
              ctx.font = `${emphasized ? '600 ' : '500 '}${fontSize}px system-ui, -apple-system, sans-serif`;
              const label = n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name;
              const tw = ctx.measureText(label).width;
              const padX = 4 / globalScale, padY = 2.5 / globalScale;
              const bw = tw + padX * 2, bh = fontSize + padY * 2;
              const bx = x - bw / 2, by = y + r + 3 / globalScale;
              const rad = 3 / globalScale;
              ctx.beginPath();
              ctx.moveTo(bx + rad, by);
              ctx.arcTo(bx + bw, by, bx + bw, by + bh, rad);
              ctx.arcTo(bx + bw, by + bh, bx, by + bh, rad);
              ctx.arcTo(bx, by + bh, bx, by, rad);
              ctx.arcTo(bx, by, bx + bw, by, rad);
              ctx.closePath();
              ctx.fillStyle = 'rgba(255,255,255,0.92)';
              ctx.fill();
              ctx.lineWidth = 1 / globalScale; ctx.strokeStyle = color + '55'; ctx.stroke();
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillStyle = emphasized ? color : '#334155';
              ctx.fillText(label, x, by + bh / 2);
            }}
                        nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as GNode;
              const x = n.x ?? 0, y = n.y ?? 0;
              const r = (n.val ?? 4) * 1.25 + (n.group === 'center' ? 6 : 2);
              ctx.fillStyle = color;
              // 节点大圆热区
              ctx.beginPath();
              ctx.arc(x, y, r + 14, 0, 2 * Math.PI);
              ctx.fill();
              // 下方标签药丸热区(近似)
              const w = Math.min(n.name.length, 14) * 8 + 14;
              const h = 20;
              ctx.fillRect(x - w / 2, y + r, w, h);
            }}
            onNodeHover={(node) => {
              const c = wrapRef.current?.querySelector('canvas');
              if (c) c.style.cursor = node ? 'pointer' : 'grab';
            }}
          />
        )}
      </div>
    </div>
  );
}
