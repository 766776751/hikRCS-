import { ICON_SIZE, getSiteType } from '../constants'

/**
 * 站点类型图标
 *
 * 【铁律 · 图标尺寸】——这是本组件存在的全部意义，改动前先看 constants.js
 *   · 尺寸必须来自 ICON_SIZE 常量（px 绝对值），禁止 em / rem / %
 *   · 同时设置 width/height 的 HTML 属性 与 inline style，
 *     双重锁定，任何外部 CSS（包括历史遗留的 width:1em）都无法覆盖
 *   · object-fit: contain 保证不同分辨率的 PNG 都不会溢出或拉伸
 *
 * 之所以内联而非纯 CSS 类：历史上正是因为图标尺寸被全局 CSS 的 `1em`
 * 劫持，导致图标随父级字号放大、与文字错位。内联样式优先级最高，可根治。
 *
 * @param {number|string} type 站点类型 ID
 * @param {number} size  边长（px），默认取 ICON_SIZE.CARD（26）
 */
export default function SiteTypeIcon({ type, size = ICON_SIZE.CARD, className = '' }) {
  const { icon, name } = getSiteType(type)

  return (
    <img
      className={className}
      src={`/site-types/${icon}.png`}
      alt={name}
      width={size}
      height={size}
      draggable="false"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        display: 'block',
        objectFit: 'contain',
        flex: 'none'
      }}
    />
  )
}
