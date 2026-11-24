import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CARRIER_OPTIONS,
  MOBILE_BREAKPOINT,
  POLL_INTERVAL,
  SITE_STATUS_LIMIT,
  hasCarrier,
  resolveSiteStatus
} from './constants'
import { getSiteCodes, getSiteStatus, reloadCache } from './api/siteApi'
import { useMediaQuery } from './hooks/useMediaQuery'
import { usePolling } from './hooks/usePolling'
import SearchInput from './components/SearchInput'
import SelectField from './components/SelectField'
import SegmentedPills from './components/SegmentedPills'
import TypeLegend from './components/TypeLegend'
import StatusLegend from './components/StatusLegend'
import SiteCard from './components/SiteCard'
import SiteTable from './components/SiteTable'
import EmptyState from './components/EmptyState'
import './theme.css'

/**
 * 站点监控主应用（React）
 *
 * 业务行为与旧 Vue 版完全一致（接口、筛选、分组、状态语义、30 秒轮询），
 * 仅渲染层重写为 React，并用 Grid + 固定 px 图标解决历史对齐问题。
 *
 * @param {Function} [onNavigateToDb] 「重新配置」跳转回调（不传则走 hash 路由 #/db）
 */
export default function SiteMonitorApp({ onNavigateToDb }) {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState('')

  const [search, setSearch] = useState('')
  const [mapCode, setMapCode] = useState('')
  const [carrier, setCarrier] = useState('') // '' 全部 | yes | no
  const [siteType, setSiteType] = useState(null)

  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`)

  /** 拉取站点基础信息 + 实时状态，合并出每个站点的展示字段与状态 */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [siteRes, statusRes] = await Promise.all([
        getSiteCodes(),
        // 状态接口失败不阻断：仍展示站点列表（状态退化为无货）
        getSiteStatus({ limit: SITE_STATUS_LIMIT }).catch(() => ({ data: [] }))
      ])

      // site_code → { carrier_display, carrier_type, ind_lock }
      // 注意：carrier_type（载具类型）只存在于 site-status 接口，
      //       site-codes 里没有该字段。旧版漏合并导致「载具类型」恒为 '-'，
      //       此处补上，使卡片/表格的载具类型能真正显示。
      const statusMap = new Map()
      for (const s of statusRes.data || []) {
        statusMap.set(s.site_code, {
          carrier_display: s.carrier_code_display || s.carrier_code || '',
          carrier_type: s.carrier_type || '',
          ind_lock: s.ind_lock
        })
      }

      const merged = (siteRes.data || []).map((s) => {
        const st = statusMap.get(s.site_code) || {}
        const carrier_display = st.carrier_display || ''
        return {
          ...s,
          carrier_display,
          carrier_type: st.carrier_type || '',
          carrier_flag: hasCarrier(carrier_display),
          siteStatus: resolveSiteStatus({
            ind_lock: st.ind_lock,
            carrier_display
          })
        }
      })

      setSites(merged)
      setLastUpdate(new Date().toTimeString().slice(0, 8))
      setError('')
    } catch (e) {
      setError(e.message || '加载失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 每 30 秒静默刷新（与旧版一致）
  usePolling(() => load(true), POLL_INTERVAL)

  /** 工具栏「刷新」：先刷服务端缓存再重新拉取 */
  const handleRefresh = async () => {
    setLoading(true)
    try {
      await reloadCache()
    } catch (e) {
      /* 缓存刷新失败不阻断，继续拉数据 */
    }
    await load()
  }

  const goToDb = () => {
    if (onNavigateToDb) onNavigateToDb()
    else window.location.hash = '#/db'
  }

  /* ---------- 筛选 ---------- */
  const baseFiltered = useMemo(
    () =>
      sites.filter((s) => {
        // 业务规则：过滤掉 X / TB 开头的无效站点（与旧版一致）
        if (s.site_name && (s.site_name.startsWith('X') || s.site_name.startsWith('TB'))) return false
        if (mapCode && s.map_code !== mapCode) return false
        if (carrier === 'yes' && !s.carrier_flag) return false
        if (carrier === 'no' && s.carrier_flag) return false
        if (search) {
          const k = search.toLowerCase()
          const hay = `${s.site_code || ''} ${s.site_name || ''} ${s.carrier_display || ''}`.toLowerCase()
          if (!hay.includes(k)) return false
        }
        return true
      }),
    [sites, mapCode, carrier, search]
  )

  const filtered = useMemo(
    () =>
      siteType == null
        ? baseFiltered
        : baseFiltered.filter((s) => Number(s.site_type) === Number(siteType)),
    [baseFiltered, siteType]
  )

  const typeCounts = useMemo(() => {
    const c = {}
    for (const s of baseFiltered) {
      const t = Number(s.site_type)
      c[t] = (c[t] || 0) + 1
    }
    return c
  }, [baseFiltered])

  /** 按地图分组（PC 表格使用），中文数字混合排序 */
  const groups = useMemo(() => {
    const m = new Map()
    for (const s of filtered) {
      const key = s.map_name || s.map_code || '未分组'
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(s)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN', { numeric: true }))
  }, [filtered])

  /** 地图下拉选项：由站点数据推导，label 为「地图名（编码）」 */
  const mapOptions = useMemo(() => {
    const seen = new Map()
    for (const s of sites) {
      if (s.map_code && !seen.has(s.map_code)) {
        seen.set(s.map_code, s.map_name || s.map_code)
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label: `${label}（${value}）` }))
  }, [sites])

  return (
    <div className="sm-root">
      {/* 工具栏 */}
      <div className="sm-toolbar">
        <div className="sm-field sm-field-search">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜索站点 / 载具编号"
          />
        </div>
        <div className="sm-field sm-field-select">
          <SelectField
            value={mapCode}
            onChange={setMapCode}
            options={mapOptions}
            placeholder="全部地图"
          />
        </div>
        <SegmentedPills value={carrier} options={CARRIER_OPTIONS} onChange={setCarrier} />
        <div className="sm-actions">
          <button className="sm-btn sm-btn-primary" disabled={loading} onClick={handleRefresh}>
            刷新
          </button>
        </div>
      </div>

      <TypeLegend value={siteType} counts={typeCounts} onChange={setSiteType} />
      <StatusLegend />

      <div className="sm-meta">
        <span>
          共 <b>{sites.length}</b> 个站点 · 当前显示 <b>{filtered.length}</b> 个
        </span>
        {lastUpdate ? <span>更新于 {lastUpdate} · 每 30 秒自动刷新</span> : null}
      </div>

      {error ? (
        <div className="sm-error">
          <span>{error}</span>
          <button className="sm-btn sm-btn-ghost" onClick={() => load()}>
            重试
          </button>
          <button className="sm-btn sm-btn-ghost" onClick={goToDb}>
            重新配置
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="sm-loading">
          <span className="sm-spinner" />
          正在加载站点数据…
        </div>
      ) : isMobile ? (
        <div className="sm-cards">
          {filtered.map((s) => (
            <SiteCard key={s.site_code} site={s} />
          ))}
          {!filtered.length ? <EmptyState text="未找到匹配站点" /> : null}
        </div>
      ) : (
        <>
          <SiteTable groups={groups} />
          {!filtered.length ? <EmptyState text="未找到匹配站点" /> : null}
        </>
      )}
    </div>
  )
}
