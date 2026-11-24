/**
 * ============================================================================
 * src-rack/RackApp.jsx — rack/bin monitor (parity w/ RackMonitorView.vue)
 * ----------------------------------------------------------------------------
 * Kept identical: bin code layout inference (formula/exact/heuristic),
 * column aggregation (locked > full > partial > empty), 10s polling,
 * bin/carrier search, column detail modal, search modal.
 * Legend dot classes use rk- safe prefixed modifiers (see rack.css).
 * ============================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import '../src-ui/base.css'
import './rack.css'
import {
  getRackBins, getRackConfig, getRackMapCodes, getRackRacks, getRackSummary
} from '../src/api/agv'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import Modal from '../src-ui/components/Modal'
import KpiCard from '../src-report/KpiCard'
import { EmptyState, InputClear, useIsMobile } from '../src-task/controls'

/* ---------------- bin code layout inference (ported 1:1) ---------------- */
function binCodePrefix(rackCode) {
  return 'R' + String(rackCode) + 'A'
}
function inferBinLayout(rackBins, rack) {
  if (!rackBins || !rackBins.length) return null
  const expectLayer = rack && rack.layer ? Number(rack.layer) : 0
  const expectCol = rack && rack.col ? Number(rack.col) : 0
  // 1) formula: R + rack + A + layer(2) + col(2) + 1
  if (rack && rack.rack_code) {
    const prefix = binCodePrefix(rack.rack_code)
    const p = prefix.length
    const hit = rackBins.some((b) => {
      const c = String((b && b.bin_code) || '')
      return c.length === p + 5 && c.indexOf(prefix) === 0 && c.charAt(p + 4) === '1'
    })
    if (hit) return { layerPos: p, colPos: p + 2, layerCount: expectLayer, colCount: expectCol, mode: 'formula', prefix }
  }
  // 2) statistical scan of 2-char windows
  const codes = []
  for (let i = 0; i < rackBins.length; i++) {
    const c = String((rackBins[i] && rackBins[i].bin_code) || '')
    if (c.length >= 2) codes.push(c)
  }
  if (codes.length < 2) return null
  const lenCount = {}
  codes.forEach((c) => { lenCount[c.length] = (lenCount[c.length] || 0) + 1 })
  const stdLen = parseInt(Object.keys(lenCount).sort((a, b) => lenCount[b] - lenCount[a])[0], 10)
  const sample = codes.filter((c) => c.length === stdLen)
  if (sample.length < 2) return null
  const stats = []
  for (let i = 0; i < stdLen - 1; i++) {
    const vals = []
    let numeric = true
    for (let k = 0; k < sample.length; k++) {
      const v = parseInt(sample[k].substr(i, 2), 10)
      if (isNaN(v)) { numeric = false; break }
      vals.push(v)
    }
    if (!numeric) { stats.push(null); continue }
    stats.push({ pos: i, size: new Set(vals).size, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) })
  }
  const rangeOk = (s, expect) => s.max === expect || s.max === expect - 1
  const findByCount = (expect, excludePos, avoidNear) => {
    if (!expect) return -1
    const usable = (s) => {
      if (!s) return false
      if (s.pos === excludePos) return false
      if (avoidNear >= 0 && Math.abs(s.pos - avoidNear) <= 1) return false
      return true
    }
    for (let i = 0; i < stats.length; i++) {
      if (usable(stats[i]) && stats[i].size === expect && rangeOk(stats[i], expect)) return stats[i].pos
    }
    for (let i = 0; i < stats.length; i++) {
      if (usable(stats[i]) && stats[i].size === expect) return stats[i].pos
    }
    return -1
  }
  const colPos = findByCount(expectCol, -1, -1)
  const layerPos = findByCount(expectLayer, colPos, colPos)
  if (colPos >= 0 && layerPos >= 0) {
    return { layerPos, colPos, layerCount: expectLayer, colCount: expectCol, mode: 'exact' }
  }
  // 3) heuristic fallback
  const candidates = stats.filter((s) => s && s.size >= 2).sort((a, b) => b.size - a.size)
  if (candidates.length < 2) return null
  const hCol = candidates[0]
  const hLayer = candidates.find((s) => Math.abs(s.pos - hCol.pos) >= 2) || candidates[1]
  return { layerPos: hLayer.pos, colPos: hCol.pos, layerCount: expectLayer || hLayer.size, colCount: expectCol || hCol.size, mode: 'heuristic' }
}
function parseBinMeta(code, layout) {
  if (!layout) return null
  return { layer: parseInt(code.substr(layout.layerPos, 2), 10), col: parseInt(code.substr(layout.colPos, 2), 10) }
}
function buildColumnAggregation(rack, rb, layout) {
  const colData = {}
  rb.forEach((b) => {
    const meta = parseBinMeta(b.bin_code, layout)
    if (!meta) return
    const c = meta.col
    if (!colData[c]) colData[c] = { layers: [], occupied: 0, locked: 0, total: 0, status: 'empty' }
    colData[c].total++
    colData[c].layers.push(Object.assign({}, b, { _layer: meta.layer }))
    if (b.has_goods) colData[c].occupied++
    if (b.is_locked) colData[c].locked++
  })
  Object.values(colData).forEach((col) => {
    col.layers.sort((a, b) => a._layer - b._layer)
    // column status: locked takes precedence; else green/amber/red by occupancy
    if (col.locked > 0) col.status = 'locked'
    else if (col.occupied === 0) col.status = 'empty'
    else if (col.occupied >= col.total) col.status = 'full'
    else col.status = 'partial'
  })
  return colData
}

const STATUS_LABEL = { full: '满货', partial: '有货未满', empty: '无货', locked: '锁定' }
function binStatus(b) {
  if (b.is_locked) return { s: 'locked', label: '锁定' }
  if (b.has_goods) return { s: 'full', label: '有货' }
  return { s: 'empty', label: '无货' }
}
function layerToChinese(n) {
  const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n === 0) return '零层'
  if (n < 10) return CN[n] + '层'
  if (n === 10) return '十层'
  if (n < 20) return '十' + (n - 10 ? CN[n - 10] : '') + '层'
  return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '') + '层'
}
function formatDateTime(t) {
  if (!t) return '-'
  try {
    const d = new Date(t)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch (e) { return t }
}
function rackMetaParts(rack) {
  const parts = []
  if (rack.rackLength) parts.push(`长 ${rack.rackLength}mm`)
  if (rack.rackWidth) parts.push(`宽 ${rack.rackWidth}mm`)
  if (rack.legHeight) parts.push(`腿高 ${rack.legHeight}mm`)
  parts.push(`${rack.layer || 0} 层 × ${rack.col || 0} 列`)
  return parts.join(' / ')
}

export default function RackApp() {
  const isMobile = useIsMobile()
  const [config, setConfig] = useState({ systemName: '货架仓位监控', mapCode: '' })
  const [mapOptions, setMapOptions] = useState([])
  const [selectedMap, setSelectedMap] = useState('')
  const [racks, setRacks] = useState([])
  const [bins, setBins] = useState([])
  const [summary, setSummary] = useState({ total: 0, occupied: 0, empty: 0, locked: 0, occRate: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [detail, setDetail] = useState(null) // { rack, col, colData }

  const selectedMapRef = useRef(selectedMap)
  selectedMapRef.current = selectedMap

  /* ---- board: racks × bins → per-rack layout + column aggregation ---- */
  const board = useMemo(() => {
    const byRack = {}
    for (const b of bins) {
      const key = b.storage_code || b.map_code
      if (!byRack[key]) byRack[key] = []
      byRack[key].push(b)
    }
    return racks.map((rack) => {
      const rb = byRack[rack.rack_code] || []
      const layout = inferBinLayout(rb, rack)
      const colData = layout ? buildColumnAggregation(rack, rb, layout) : {}
      return { ...rack, bins: rb, layout, colData }
    })
  }, [racks, bins])

  const boardRef = useRef(board)
  boardRef.current = board

  /* ---- data loading ---- */
  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [racksRes, binsRes] = await Promise.all([
        getRackRacks({ map_code: selectedMapRef.current }),
        getRackBins({ map_code: selectedMapRef.current })
      ])
      setRacks(racksRes.data || [])
      setBins(binsRes.data || [])
      try {
        const sum = await getRackSummary({ map_code: selectedMapRef.current })
        if (sum.data) setSummary(sum.data)
      } catch (e) { /* summary failure is non-blocking */ }
      setLastUpdate(new Date().toTimeString().slice(0, 8))
    } catch (e) {
      setError(e.message || '加载货架数据失败')
    }
    setLoading(false)
  }

  /* ---- init: config + map list + first load ---- */
  useEffect(() => {
    ;(async () => {
      let cfg = { systemName: '货架仓位监控', mapCode: '' }
      try {
        const c = await getRackConfig()
        if (c.data) { cfg = c.data; setConfig(c.data) }
      } catch (e) { /* ignore */ }
      try {
        const mc = await getRackMapCodes()
        const opts = (mc.data || []).map((m) => ({ value: m.map_code, label: m.map_name || m.map_code }))
        setMapOptions(opts)
        const hit = opts.find((o) => o.value === cfg.mapCode)
        setSelectedMap(hit ? hit.value : (opts[0] ? opts[0].value : ''))
      } catch (e) {
        setError(e.message || '加载地图列表失败')
      }
    })()
  }, [])

  /* ---- 选中地图变化时立即加载 + 每 10 秒静默轮询 ---- */
  useEffect(() => {
    if (!selectedMap) return
    load()
    const t = setInterval(() => load(true), 10000)
    return () => clearInterval(t)
  }, [selectedMap])

  /* ---- search ---- */
  function runSearch() {
    const t = searchTerm.trim().toLowerCase()
    if (!t) { setSearchOpen(false); return }
    const res = bins.filter((b) =>
      b.bin_code.toLowerCase().includes(t) ||
      (b.carrier_code && b.carrier_code.toLowerCase().includes(t))
    )
    setSearchResults(res.map((b) => {
      const rack = boardRef.current.find((r) => r.rack_code === (b.storage_code || b.map_code))
      const meta = rack && rack.layout ? parseBinMeta(b.bin_code, rack.layout) : null
      return {
        bin_code: b.bin_code, carrier_code: b.carrier_code,
        rack_code: rack ? rack.rack_code : '',
        col: meta ? meta.col : '', layer: meta ? meta.layer : '',
        status: binStatus(b)
      }
    }))
    setSearchOpen(true)
  }

  function openColumnDetail(rackCode, col) {
    const rack = board.find((r) => r.rack_code === rackCode)
    if (!rack || !rack.colData[col]) return
    setDetail({ rack, col, colData: rack.colData[col] })
  }

  return (
    <div className="rk-root">
      {/* KPI */}
      <div className="rk-kpis">
        <KpiCard label="仓位总数" value={summary.total} icon="box" accent="#60a5fa" />
        <KpiCard label="有货" value={summary.occupied} icon="package" accent="#34d399" />
        <KpiCard label="无货" value={summary.empty} icon="square" accent="#94a3b8" />
        <KpiCard label="锁定" value={summary.locked} icon="lock" accent="#f472b6" />
        <KpiCard label="占用率" value={summary.occRate + '%'} icon="gauge" accent="#fbbf24" />
      </div>

      {/* toolbar */}
      <div className="rk-toolbar">
        <div className="rt-field rt-search">
          <InputClear value={searchTerm} onChange={setSearchTerm} placeholder="料箱 / 仓位号 查询" />
          <Button variant="primary" size="sm" icon="search" onClick={runSearch}>查询</Button>
        </div>
        <div className="radio-pill-group">
          {mapOptions.map((o) => (
            <label key={o.value} className={'radio-pill' + (String(o.value) === String(selectedMap) ? ' active' : '')}>
              <input type="radio" name="rk-map" value={o.value}
                checked={String(o.value) === String(selectedMap)}
                onChange={() => setSelectedMap(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <div className="rt-actions">
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => load()}>刷新</Button>
        </div>
      </div>

      {/* legend — unified 12px dots (rk- prefixed modifiers) */}
      <div className="rk-legend">
        <span className="lg"><i className="dot dot-empty" />无货</span>
        <span className="lg"><i className="dot dot-partial" />有货未满</span>
        <span className="lg"><i className="dot dot-full" />满货</span>
        <span className="lg"><i className="dot dot-locked" />锁定</span>
        {lastUpdate && <span className="rk-updated">更新于 {lastUpdate} · 每 10 秒自动刷新</span>}
      </div>

      {error && (
        <div className="rk-error">
          <Icon name="alert-circle" size={16} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load()}>重试</Button>
        </div>
      )}

      {loading ? (
        <div className="rk-loading"><span className="spinner" /> 正在加载货架数据…</div>
      ) : !board.length ? (
        <div className="rk-empty"><EmptyState icon="box" text="当前地图暂无货架配置（cms_rack 为空）" /></div>
      ) : (
        board.map((rack) => (
          <div key={rack.rack_code} className="panel rk-card">
            <header className="rk-card-head">
              <div>
                <span className="rk-code">{rack.rack_code}</span>
                <span className="rk-meta">{rackMetaParts(rack)}</span>
              </div>
              <div className="rk-stats">
                占用 <b className="occ">{rack.bins.filter((b) => b.has_goods).length}</b> / {rack.bins.length}
                ({rack.bins.length ? Math.round(rack.bins.filter((b) => b.has_goods).length / rack.bins.length * 100) : 0}%)
              </div>
            </header>
            <div className="rk-grid" style={{ '--cols': rack.col || 1 }}>
              {Array.from({ length: rack.col || 0 }, (_, idx) => idx + 1).map((c) =>
                rack.colData[c] ? (
                  <div key={c}
                    className={'col-cell col-' + rack.colData[c].status}
                    title={`${rack.rack_code} 第 ${c} 列：${STATUS_LABEL[rack.colData[c].status]}（${rack.colData[c].occupied}/${rack.colData[c].total}）` + (rack.colData[c].locked ? `，${rack.colData[c].locked} 锁定` : '') + '（点击查看层详情）'}
                    onClick={() => openColumnDetail(rack.rack_code, c)}>
                    <span className="col-num">{c}</span>
                  </div>
                ) : (
                  <div key={c} className="col-cell col-none" title={`${rack.rack_code} 第 ${c} 列：无仓位数据`} />
                )
              )}
            </div>
          </div>
        ))
      )}

      {/* column detail modal */}
      {detail && (
        <Modal title={`货架 ${detail.rack?.rack_code} · 第 ${detail.col} 列`} icon="layers"
          width="min(1060px, 96vw)" fit onClose={() => setDetail(null)}>
          {detail.colData && (
            <div className="col-detail">
              <div className={'cd-summary status-' + detail.colData.status}>
                <span>列号 <b>{detail.col}</b></span>
                <span>占用 <b className="occ">{detail.colData.occupied}</b> / {detail.colData.total}</span>
                {!!detail.colData.locked && <span>锁定 <b>{detail.colData.locked}</b></span>}
                <span>状态 <b className={'stx-' + detail.colData.status}>{STATUS_LABEL[detail.colData.status]}</b></span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 64 }}>层</th>
                      <th>仓位编码</th>
                      <th>料箱号</th>
                      <th style={{ width: 90 }}>状态</th>
                      <th style={{ width: 80 }}>入库容量</th>
                      <th style={{ width: 80 }}>出库容量</th>
                      <th className="col-update" style={{ width: 180 }}>更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.colData.layers.slice().reverse().map((l) => {
                      const st = binStatus(l)
                      return (
                        <tr key={l.bin_code} className={'row-' + st.s}>
                          <td>{l._layer}</td>
                          <td className="num">{l.bin_code}</td>
                          <td>{l.carrier_code || '-'}</td>
                          <td><span className={'status-badge status-' + st.s}>{st.label}</span></td>
                          <td className="num">{l.in_capacity != null ? l.in_capacity : '-'}</td>
                          <td className="num">{l.out_capacity != null ? l.out_capacity : '-'}</td>
                          <td className="num col-update">{formatDateTime(l.update_time)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* search results modal */}
      {searchOpen && (
        <Modal title="搜索结果" icon="search" fit onClose={() => setSearchOpen(false)}>
          {!searchResults.length ? (
            <div className="rk-empty"><EmptyState icon="search" text="未找到匹配的料箱或仓位" /></div>
          ) : (
            <ul className="search-list">
              {searchResults.map((r, i) => (
                <li key={i} className="search-item"
                  onClick={() => { if (r.rack_code) { setSearchOpen(false); openColumnDetail(r.rack_code, r.col) } }}>
                  <span className={'status-badge status-' + r.status.s}>{r.status.label}</span>
                  <div className="si-main">
                    <div className="si-bin num">{r.bin_code}</div>
                    <div className="si-sub">
                      <span>料箱：{r.carrier_code || '无'}</span>
                      {r.rack_code && <span>位置：{r.rack_code} · 第 {r.col} 列 · {layerToChinese(r.layer)}</span>}
                    </div>
                  </div>
                  <Icon name="chevron-right" size={15} className="si-arrow" />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}
