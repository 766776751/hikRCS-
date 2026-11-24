import { ICON_SIZE, typeName } from '../constants'
import SiteTypeIcon from './SiteTypeIcon'

/**
 * PC 端站点表格（按地图分组）
 *
 * · 表头 6 列与每行 6 个单元格严格一一对应：
 *   站点名称 / 类型 / 站点编号 / 载具编号 / 载具类型 / 地图
 * · 「类型」列：图标 + 文字徽章，用 inline-flex + align-items:center 垂直居中；
 *   图标固定 16px（ICON_SIZE.TABLE），与右侧徽章同高，不会显得比文字大。
 * · 行状态：首列左侧 4px 色条 + 整行淡底色（无货绿 / 有货黄 / 锁定灰）。
 */
export default function SiteTable({ groups }) {
  if (!groups.length) return null

  return (
    <div className="sm-groups">
      {groups.map(([mapName, list]) => (
        <section key={mapName} className="sm-group">
          <header className="sm-group__head">
            <span className="sm-group__name">{mapName}</span>
            <span className="sm-group__code">{list[0].map_code}</span>
            <span className="sm-group__count">{list.length} 个站点</span>
          </header>

          <div className="sm-tbl-wrap">
            <table className="sm-tbl">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>站点名称</th>
                  <th style={{ width: '12%' }}>类型</th>
                  <th style={{ width: '16%' }}>站点编号</th>
                  <th style={{ width: '22%' }}>载具编号</th>
                  <th style={{ width: '14%' }}>载具类型</th>
                  <th style={{ width: '14%' }}>地图</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.site_code} className={`is-${s.siteStatus}`}>
                    <td className="sm-cell-name">
                      <span className={`sm-status-dot is-${s.siteStatus}`} />
                      {s.site_name || s.site_code}
                    </td>
                    <td>
                      <span className="sm-type-cell">
                        <SiteTypeIcon
                          type={s.site_type}
                          size={ICON_SIZE.TABLE}
                          className="sm-type-cell__icon"
                        />
                        <span className="sm-badge sm-badge-info">{typeName(s.site_type)}</span>
                      </span>
                    </td>
                    <td>{s.site_code}</td>
                    <td style={s.carrier_flag ? undefined : { color: 'var(--sm-ink-400)' }}>
                      {s.carrier_flag ? s.carrier_display : '无载具'}
                    </td>
                    <td>{s.carrier_flag ? s.carrier_type || '-' : '-'}</td>
                    <td>{s.map_name || s.map_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
