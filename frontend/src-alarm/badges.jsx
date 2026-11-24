/**
 * src-alarm/badges.jsx — alarm level / status badges (parity w/ Vue versions)
 */
export function AlarmLevelBadge({ level, text = '' }) {
  if (text) return <span className="badge badge-gray">{text}</span>
  const map = { 1: ['badge-info', '低'], 2: ['badge-warning', '中'], 3: ['badge-danger', '严重'] }
  const hit = map[String(level)]
  return hit
    ? <span className={'badge ' + hit[0]}>{hit[1]}</span>
    : <span className="badge badge-gray">-</span>
}

export function AlarmStatusBadge({ resolved = false }) {
  return resolved
    ? <span className="badge badge-success">已恢复</span>
    : <span className="badge badge-danger pulse">告警中</span>
}
