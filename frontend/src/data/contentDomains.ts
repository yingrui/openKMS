/**
 * 安利业务全景「三层十二域」域体系 —— 供「内容资产」页 /content 的「按业务」视图使用。
 *
 * 来源:数据地图《安利中国业务全景与数据资产地图》§1 一页结论。
 * 这是有意**独立于**后端 home_hub.py::col_to_domain(那套 6 域聚合仍供首页 cockpit 用),
 * 用更贴招标与真实业务的权威结构组织内容资产,并把未覆盖的业务域显式展示为「缺口」。
 *
 * Demo-branch 模块:内联 zh-CN 文案。
 */
import {
  HeartPulse,
  Sparkles,
  Home,
  ShoppingCart,
  Store,
  UserRound,
  GraduationCap,
  Headphones,
  FlaskConical,
  Truck,
  Landmark,
  Leaf,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type BusinessLayer = '前台价值创造' | '经营赋能' | '后端保障';

// 三层十二域(数据地图 §1)。层内顺序即展示顺序。
export const LAYERS: { layer: BusinessLayer; domains: string[] }[] = [
  {
    layer: '前台价值创造',
    domains: [
      '大健康与营养',
      '美容与个人护理',
      '家庭生活与智能设备',
      '数字商业与会员经营',
      '体验馆与社群服务',
    ],
  },
  {
    layer: '经营赋能',
    domains: ['营销人员创业与顾客服务', '内容、培训、直播与 AI', '客服、售后与合规'],
  },
  {
    layer: '后端保障',
    domains: [
      '植物营养研发与科学实证',
      '供应链、生产、质量与物流',
      '企业品牌与公共事务',
      '公益与可持续发展',
    ],
  },
];

// 12 域按层展开的线性顺序。
export const DOMAIN_ORDER: string[] = LAYERS.flatMap((l) => l.domains);

// 每域一个图标 + 所属层。
export const DOMAIN_META: Record<string, { icon: LucideIcon; layer: BusinessLayer }> = {
  大健康与营养: { icon: HeartPulse, layer: '前台价值创造' },
  美容与个人护理: { icon: Sparkles, layer: '前台价值创造' },
  家庭生活与智能设备: { icon: Home, layer: '前台价值创造' },
  数字商业与会员经营: { icon: ShoppingCart, layer: '前台价值创造' },
  体验馆与社群服务: { icon: Store, layer: '前台价值创造' },
  营销人员创业与顾客服务: { icon: UserRound, layer: '经营赋能' },
  '内容、培训、直播与 AI': { icon: GraduationCap, layer: '经营赋能' },
  '客服、售后与合规': { icon: Headphones, layer: '经营赋能' },
  植物营养研发与科学实证: { icon: FlaskConical, layer: '后端保障' },
  '供应链、生产、质量与物流': { icon: Truck, layer: '后端保障' },
  企业品牌与公共事务: { icon: Landmark, layer: '后端保障' },
  公益与可持续发展: { icon: Leaf, layer: '后端保障' },
};

// 兜底域:任何未映射的频道落到最宽的内容域,保证每条内容都进 canonical 桶。
export const FALLBACK_DOMAIN = '内容、培训、直播与 AI';

// 频道名 → 业务域。demo:按已 seed 内容的频道归域(约 5 域有内容,其余为覆盖缺口)。
// 真实生产应由本体抽取按「件」归域,而非按频道;此处是 demo 简化。
export const CHANNEL_TO_DOMAIN: Record<string, string> = {
  // —— 大健康与营养(产品/营养/健康主题,含健康科普视频跨模态) ——
  产品资讯: '大健康与营养',
  植物营养素: '大健康与营养',
  健康解决方案: '大健康与营养',
  体重管理: '大健康与营养',
  免疫健康: '大健康与营养',
  专项健康: '大健康与营养',
  代谢健康: '大健康与营养',
  '活力焕龄·抗衰': '大健康与营养',
  营养早餐: '大健康与营养',
  健康科普视频: '大健康与营养',
  // —— 植物营养研发与科学实证 ——
  营养与科研: '植物营养研发与科学实证',
  // —— 营销人员创业与顾客服务 ——
  展业话术: '营销人员创业与顾客服务',
  ABO展业: '营销人员创业与顾客服务',
  // —— 内容、培训、直播与 AI ——
  社群运营: '内容、培训、直播与 AI',
  客户故事: '内容、培训、直播与 AI',
  日签: '内容、培训、直播与 AI',
  每日发圈: '内容、培训、直播与 AI',
  每日资讯: '内容、培训、直播与 AI',
  安利内容中心: '内容、培训、直播与 AI',
  专家课程: '内容、培训、直播与 AI',
  社群音频: '内容、培训、直播与 AI',
  安利媒体中心: '内容、培训、直播与 AI',
  // —— 供应链、生产、质量与物流(文档收件箱当前含采购合同样例;demo 简化) ——
  知识接入: '供应链、生产、质量与物流',
};

/** 频道名 → 业务域;未知/空 → 兜底域。 */
export function domainForChannel(name?: string | null): string {
  const key = (name ?? '').trim();
  if (key && CHANNEL_TO_DOMAIN[key]) return CHANNEL_TO_DOMAIN[key];
  return FALLBACK_DOMAIN;
}
