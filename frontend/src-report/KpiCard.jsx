/**
 * src-report/KpiCard.jsx — dashboard KPI card
 * Uses global .kpi classes from base.css (visual parity w/ Vue KpiCard),
 * supports label/value/sub/icon/accent/tint.
 */
import Icon from '../src-ui/components/Icon'

export default function KpiCard({ label, value = '-', sub = '', icon = 'activity', accent, tint, loading = false }) {
  return (
    <div className="kpi" style={{ '--kpi-accent': accent, '--kpi-tint': tint }}>
      <div className="kpi-label">
        <Icon name={icon} size={13} />
        {label}
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 30, width: 72 }} aria-label="loading" />
      ) : (
        <div className="kpi-value">{value}</div>
      )}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
