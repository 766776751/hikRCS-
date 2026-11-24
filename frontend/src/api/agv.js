import { buildQuery, request } from './client'

export const getSiteCodes = () => request('/api/agv/site-codes')
export const getSiteStatus = (params) => request('/api/agv/site-status', { params })
export const getAlarmAreas = () => request('/api/agv/alarm-areas')
export const reloadCache = () => request('/api/agv/reload-cache', { method: 'POST' })
export const getRcsTasks = (params) => request('/api/agv/rcs-tasks', { params })
export const cancelTask = (task_chain_code) =>
  request('/api/agv/cancel-task', { method: 'POST', body: { task_chain_code } })
export const getAlarmHistory = (params) => request('/api/agv/alarm-history', { params })
export const getDailyTaskReport = (params) => request('/api/agv/daily-task-report', { params })

// ============ 手动任务链接（存于后端数据库） ============
export const getManualTaskUrl = () => request('/api/manual-task-url')
export const saveManualTaskUrlApi = (url) =>
  request('/api/manual-task-url', { method: 'POST', body: { url } })
export const alarmExportUrl = (params) => '/api/agv/alarm-history/export' + buildQuery(params)

// ============ 货架监控（独立数据库连接） ============
export const getRackConfig = () => request('/api/rack/config')
export const getRackMapCodes = () => request('/api/rack/map-codes')
export const getRackRacks = (params) => request('/api/rack/racks', { params })
export const getRackBins = (params) => request('/api/rack/bins', { params })
export const getRackSummary = (params) => request('/api/rack/summary', { params })

// ============ 料箱码/托盘码管理（本地 JSON 存储，独立的码值体系） ============
export const getBoxcodeConfig = () => request('/api/boxcode/config')
export const getBoxcodeStats = () => request('/api/boxcode/stats')
export const generateBoxcode = (body) => request('/api/boxcode/generate', { method: 'POST', body })
export const reduceBoxcode = (body) => request('/api/boxcode/reduce', { method: 'POST', body })
export const changeBoxcodeRule = (body) => request('/api/boxcode/change-rule', { method: 'POST', body })
export const getBoxcodeHistory = (params) => request('/api/boxcode/history', { params })
export const saveBoxcodePrintedCount = (body) => request('/api/boxcode/save-printed-count', { method: 'POST', body })
// 导出为二进制下载，返回 URL 供 <a download> 使用
export const boxcodeExportUrl = (params) => '/api/boxcode/export' + buildQuery(params)
export const boxcodePrintTemplateUrl = (params) => '/api/boxcode/print-template' + buildQuery(params)
