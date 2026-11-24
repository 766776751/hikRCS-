export function pad(n) {
  return String(n).padStart(2, '0')
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 后端 pg 返回的 timestamp 经 JSON 序列化为带 Z 的 UTC 字符串，
// 这里统一用本地时区（与数据库/服务器同一时区）还原为可读时间，
// 避免出现“前端比数据库少 8 小时”的偏差。
export function fmtDT(s) {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtShort(s) {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function todayRange() {
  const d = fmtDate(new Date())
  return { start: `${d} 00:00:00`, end: `${d} 23:59:59` }
}

export function lastDaysRange(n) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (n - 1))
  const s = fmtDate(start)
  const e = fmtDate(end)
  return { start: `${s} 00:00:00`, end: `${e} 23:59:59` }
}

// 通用空值显示
export function dash(v) {
  return v === undefined || v === null || v === '' ? '-' : v
}

export function sumStatus(list, statuses) {
  return (list || [])
    .filter((it) => statuses.includes(String(it.status)))
    .reduce((acc, it) => acc + (Number(it.count) || 0), 0)
}
