/**
 * 站点监控 · 接口层
 *
 * 与旧 Vue 版使用完全相同的后端接口，保证业务行为一致、可平滑替换：
 *   GET  /api/agv/site-codes            → 站点基础信息（编码/名称/地图/类型）
 *   GET  /api/agv/site-status?limit=N   → 站点实时状态（carrier_code / ind_lock）
 *   POST /api/agv/reload-cache          → 刷新服务端缓存（工具栏「刷新」调用）
 *
 * 这里用原生 fetch 自行封装，不依赖 Vue 的 src/api/client.js，
 * 使 React 版站点监控可独立运行/迁移。
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

/** 站点基础信息列表 */
export const getSiteCodes = () => request('/api/agv/site-codes')

/** 站点实时状态；limit 需足够大以覆盖全部站点 */
export const getSiteStatus = (params) => request('/api/agv/site-status', { params })

/** 刷新服务端站点/地图缓存 */
export const reloadCache = () => request('/api/agv/reload-cache', { method: 'POST' })
