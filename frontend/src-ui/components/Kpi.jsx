/**
 * src-ui/components/Kpi.jsx — 统计卡（DESIGN-SPEC 4.4 stat-card）
 *
 * 骨架屏加载（非转圈）；数字 tabular-nums 防跳动；
 * hero 变体 = 深蓝 hero 区内的玻璃卡（对应旧 KpiCard hero）。
 */
import Icon from './Icon'

export default function Kpi({ label, value = '-', icon, accent, loading = false, hero = false }) {
  return (
    <div className={hero ? 'ui-kpi ui-kpi--hero' : 'ui-kpi'} style={{ '--kpi-accent': accent }}>
      <div className="ui-kpi__label">
        <Icon name={icon} size={13} />
        {label}
      </div>
      {loading ? (
        <div className="ui-skeleton ui-kpi__skel" aria-label="加载中" />
      ) : (
        <div className="ui-kpi__value">{value}</div>
      )}
    </div>
  )
}
