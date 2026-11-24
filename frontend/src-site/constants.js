/**
 * 站点监控 · 业务常量与设计尺寸单一来源
 *
 * 本文件是「业务语义」与「UI 尺寸」的唯一真源（single source of truth）。
 * 任何组件都从这里取值，禁止在组件里硬编码魔数。
 */

/* ============================================================================
 * 【图标尺寸 · 铁律】
 * 旧 Vue 版用 `width: 1em` 导致图标随父级 font-size 浮动，反复出现
 * 「图标偏大、与文字不对齐」的问题。此处统一用 px 绝对值固化：
 *
 *   CARD   26px —— 移动端站点卡片（左侧跨两行、垂直居中）
 *   TABLE  16px —— PC 表格「类型」列（与右侧文字徽章同高）
 *   LEGEND 20px —— 站点类型图例
 *
 * 修改这三个值即可全局生效；禁止改用 em / rem / % 等相对单位。
 * 对应的 CSS 在 theme.css，两处必须保持一致。
 * ========================================================================== */
export const ICON_SIZE = {
  CARD: 26,
  TABLE: 16,
  LEGEND: 20
}

/** 移动端断点：≤640px 走卡片，>640px 走表格
 *  （旧版用全局 767px，导致分屏/系统缩放的 PC 窗口被误判成手机） */
export const MOBILE_BREAKPOINT = 640

/** 自动刷新间隔（毫秒）——与旧版一致，30 秒 */
export const POLL_INTERVAL = 30000

/** 站点状态拉取上限：需覆盖全部站点（当前库内 778 个） */
export const SITE_STATUS_LIMIT = 2000

/* ============================================================================
 * 站点类型（ID → 名称 / 图标文件名）
 * 图标文件位于 public/site-types/{icon}.png
 * ========================================================================== */
export const SITE_TYPES = [
  { id: 1, name: '储位', icon: 'storage' },
  { id: 10, name: '工作点', icon: 'workstation' },
  { id: 22, name: '电梯停靠点', icon: 'elevator' },
  { id: 53, name: '巷道头', icon: 'aisle-head' },
  { id: 54, name: '巷道尾', icon: 'aisle-tail' },
  { id: 55, name: '缓冲区', icon: 'buffer' }
]

export const SITE_TYPE_MAP = SITE_TYPES.reduce((m, t) => {
  m[t.id] = t
  return m
}, {})

export function getSiteType(t) {
  return SITE_TYPE_MAP[Number(t)] || { id: t, name: `类型${t}`, icon: 'storage' }
}

export function typeName(t) {
  return getSiteType(t).name
}

/* ============================================================================
 * 站点状态语义（业务规则，勿随意改动）
 *
 * 数据源：cms_web.public.tas_site_status
 *   · ind_lock = 1            → 锁定（灰色），优先级最高
 *   · carrier_code 非空        → 有货（黄色）
 *   · 其余                     → 无货（绿色）
 *
 * 这与货架监控的配色原则同源：无货绿 / 有货黄 / 锁定灰。
 * ========================================================================== */
export const SITE_STATUS = {
  empty: { key: 'empty', label: '无货', color: '#22c55e' },
  occupied: { key: 'occupied', label: '有货', color: '#f59e0b' },
  locked: { key: 'locked', label: '锁定', color: '#94a3b8' }
}

/** 状态顺序（用于图例展示） */
export const STATUS_ORDER = ['empty', 'occupied', 'locked']

/** 判断站点是否「有载具/有货」
 *  '无载具'、'空台车' 是 RCS 返回的空态文案，等同无货 */
export function hasCarrier(disp) {
  return !!disp && disp !== '无载具' && disp !== '空台车'
}

/** 由原始状态数据推导站点状态：locked > occupied > empty */
export function resolveSiteStatus({ ind_lock, carrier_display }) {
  if (ind_lock) return 'locked'
  if (hasCarrier(carrier_display)) return 'occupied'
  return 'empty'
}

/** 载具筛选选项 */
export const CARRIER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'yes', label: '有载具' },
  { value: 'no', label: '无载具' }
]
