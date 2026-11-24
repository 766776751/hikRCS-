import { SITE_STATUS, STATUS_ORDER } from '../constants'

/**
 * 站点状态图例（只读展示，非筛选器）
 * 顺序与语义：无货(绿) / 有货(黄) / 锁定(灰)
 */
export default function StatusLegend() {
  return (
    <div className="sm-status-legend">
      {STATUS_ORDER.map((key) => (
        <span key={key} className="sm-slg">
          <i className="sm-sdot" style={{ background: SITE_STATUS[key].color }} />
          {SITE_STATUS[key].label}
        </span>
      ))}
    </div>
  )
}
