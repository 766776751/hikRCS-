import { ICON_SIZE, SITE_TYPES } from '../constants'
import SiteTypeIcon from './SiteTypeIcon'

/**
 * 站点类型图例（兼筛选器）
 *
 * · 3 列网格；每格：图标 + 名称（上）/ 数量（下，位于名称正下方）
 * · 图标固定 20px（ICON_SIZE.LEGEND）
 * · 点击切换筛选：选中描蓝边 + 淡蓝底；再次点击取消（value → null）
 */
export default function TypeLegend({ value, counts, onChange }) {
  return (
    <div className="sm-type-legend">
      {SITE_TYPES.map((t) => {
        const active = value != null && Number(value) === t.id
        return (
          <button
            key={t.id}
            type="button"
            className={`sm-tl-item${active ? ' is-active' : ''}`}
            onClick={() => onChange(active ? null : t.id)}
          >
            <SiteTypeIcon type={t.id} size={ICON_SIZE.LEGEND} className="sm-tl-icon" />
            <span className="sm-tl-text">
              <span className="sm-tl-name">{t.name}</span>
              <span className="sm-tl-count">{counts[t.id] || 0}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
