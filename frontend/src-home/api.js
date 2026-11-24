/**
 * src-home/api.js — 首页接口层
 *
 * 与旧 Vue 版使用完全相同的后端接口，保证业务行为一致：
 *   GET  /api/manual-task-url           → 手动任务链接（存于 service_config.json）
 *   POST /api/manual-task-url {url}     → 保存手动任务链接
 *   GET  /api/agv/daily-task-report     → 今日任务报表（KPI 数据源）
 *   GET  /api/agv/alarm-history         → 今日告警数（KPI 数据源）
 */

async function request(url, { method = 'GET', params, body } = {}) {
  let full = url
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    ).toString()
    if (qs) full += `?${qs}`
  }
  const res = await fetch(full, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`)
  return res.json()
}

export const getManualTaskUrl = () => request('/api/manual-task-url')
export const saveManualTaskUrlApi = (url) =>
  request('/api/manual-task-url', { method: 'POST', body: { url } })
export const getDailyTaskReport = (params) => request('/api/agv/daily-task-report', { params })
export const getAlarmHistory = (params) => request('/api/agv/alarm-history', { params })
