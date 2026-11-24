import { ICON_SIZE, typeName } from '../constants'
import SiteTypeIcon from './SiteTypeIcon'

/**
 * 移动端站点卡片（单站点）
 *
 * 布局铁律（实现细节见 theme.css 顶部注释，两处必须一致）：
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [图标26px] │ 行1：站点名称        编码   │
 *   │ (跨2行)    │ 行2：类型 / 载具 / 地图     │
 *   │ (居中)     │                            │
 *   └──────────────────────────────────────────┘
 *       col 1              col 2 (1fr)
 *
 *  · 卡片是 grid：grid-template-columns: 26px 1fr
 *  · 图标 grid-column:1 / grid-row:1 / span 2 + align-self:center
 *    → 与「两行文字」整体垂直居中，且不受文字行数变化影响
 *  · 两行文字都 grid-column:2
 *    → 左边界由 Grid 列严格保证一致，杜绝缩进错位
 *  · 图标尺寸来自 ICON_SIZE.CARD（26px），硬编码 px
 *
 * 展示内容（6 项齐全）：站点类型(图标) / 站点编码 / 站点名称 / 载具编号 / 地图名称 / 载具类型
 */
export default function SiteCard({ site }) {
  const {
    site_code,
    site_name,
    site_type,
    carrier_display,
    carrier_flag,
    carrier_type,
    map_name,
    map_code,
    siteStatus
  } = site

  return (
    <div className={`sm-card is-${siteStatus}`}>
      {/* 图标：第 1 列，跨 2 行，单元格内居中 */}
      <SiteTypeIcon type={site_type} size={ICON_SIZE.CARD} className="sm-card__icon" />

      {/* 行 1：站点名称 + 站点编码（第 2 列） */}
      <div className="sm-card__line1">
        <span className="sm-card__name">{site_name || site_code}</span>
        <span className="sm-card__code">{site_code}</span>
      </div>

      {/* 行 2：类型 / 载具 / 地图（第 2 列，与行 1 左边界严格对齐） */}
      <div className="sm-card__line2">
        <span className="sm-card__item">
          <b>类型</b>
          {typeName(site_type)}
        </span>
        <span className="sm-card__item">
          <b>载具</b>
          {carrier_flag ? (
            <span>{carrier_display}</span>
          ) : (
            <span className="sm-card__none">无载具</span>
          )}
        </span>
        <span className="sm-card__item">
          <b>地图</b>
          {map_name || map_code}
        </span>
        <span className="sm-card__item">
          <b>载具类型</b>
          {carrier_flag ? carrier_type || '-' : '-'}
        </span>
      </div>
    </div>
  )
}
