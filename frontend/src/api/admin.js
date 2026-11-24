import { request } from './client'

// 注意：GET /api/db-config 返回裸对象（无 success 信封）
export const getDbConfig = () => request('/api/db-config')
export const saveDbConfig = (body) => request('/api/db-config', { method: 'POST', body })
export const testDbConfig = (body) => request('/api/db-config/test', { method: 'POST', body })
export const getPushConfig = () => request('/api/config')
export const savePushConfig = (body) => request('/api/config', { method: 'POST', body })
export const insertTestAlarm = () => request('/api/test-insert-alarm', { method: 'POST' })
export const getPushHistory = (params) => request('/api/push-history', { params })
export const clearPushHistory = () => request('/api/push-history', { method: 'DELETE' })
