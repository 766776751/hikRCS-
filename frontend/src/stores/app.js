/**
 * stores/app.js — shared app store (plain JS, no Vue reactivity).
 * site/map/alarm-area caches + db-config login state.
 */
import { getAlarmAreas, getSiteCodes, reloadCache } from '../api/agv'
import { getDbConfig } from '../api/admin'

export const store = {
  ready: false,
  dbInfo: null,
  configured: false,
  siteCodes: [],
  siteCodesAt: 0,
  alarmAreas: [],
  alarmAreasAt: 0
}

export async function initStore() {
  try {
    const d = await getDbConfig()
    store.dbInfo = d
    store.configured = !!(d && d.host)
  } catch (e) {
    store.configured = false
  }
  store.ready = true
}

export function setConfigured(info) {
  store.dbInfo = info || store.dbInfo
  store.configured = true
}

export async function loadSiteCodes(force = false) {
  if (!force && store.siteCodes.length) return store.siteCodes
  const j = await getSiteCodes()
  store.siteCodes = j.data || []
  store.siteCodesAt = Date.now()
  return store.siteCodes
}

export async function loadAlarmAreas(force = false) {
  if (!force && store.alarmAreas.length) return store.alarmAreas
  const j = await getAlarmAreas()
  store.alarmAreas = j.data || []
  store.alarmAreasAt = Date.now()
  return store.alarmAreas
}

// map dropdown options (value = map_code; plain function now, was Vue computed)
export function mapOptions() {
  const seen = new Map()
  for (const s of store.siteCodes) {
    if (s.map_code && !seen.has(s.map_code)) {
      seen.set(s.map_code, s.map_name || s.map_code)
    }
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label: `${label}（${value}）` }))
}

export function siteCodeNameMap() {
  const m = new Map()
  for (const s of store.siteCodes) m.set(s.site_code, s.site_name)
  return m
}

export async function refreshServerCache() {
  await reloadCache()
  await Promise.all([loadSiteCodes(true), loadAlarmAreas(true)])
}
