/**
 * ============================================================================
 * src-task/controls.jsx — 任务页共享控件（React 版）
 * ----------------------------------------------------------------------------
 * 复刻 Vue 侧同名组件的交互与视觉：FilterPanel / InputClear / PickerSelect /
 * DateRangeField / Pagination / TaskStatusBadge / EmptyState。
 * 公共 CSS 类（panel/tbl/badge/ipt/pager/empty/field…）由全局 base.css 提供；
 * scoped 部分在 task.css 中复刻。桌面/移动判定断点 767px 与 Vue 版一致。
 * ============================================================================
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../src-ui/components/Icon'
import { loadSiteCodes, mapOptions } from '../src/stores/app'

/* ---------- 移动端判定（与 useIsMobile 同断点） ---------- */
export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const fn = (e) => setM(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return m
}

/* ---------- FilterPanel：移动端可折叠（默认收起，用户钦定），桌面端恒展开 ---------- */
export function FilterPanel({ title = '筛选条件', children }) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <section className={'panel fp' + (collapsed ? ' collapsed' : '')}>
      <header className="fp-head" onClick={() => setCollapsed((v) => !v)}>
        <Icon name="filter" size={15} />
        <span>{title}</span>
        <Icon name="chevron-down" size={15} className="fp-arrow" />
      </header>
      <div className="fp-body">{children}</div>
    </section>
  )
}

/* ---------- InputClear：带清空按钮的输入框 ---------- */
export function InputClear({ value = '', onChange, placeholder = '', type = 'text' }) {
  return (
    <div className={'ipt-wrap' + (value ? ' has-value' : '')}>
      <input
        className="ipt"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="ipt-clear" type="button" tabIndex={-1} title="清空"
          onMouseDown={(e) => { e.preventDefault(); onChange('') }}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ---------- PickerSelect：桌面原生下拉 / 移动端底部抽屉 ---------- */
export function PickerSelect({ value = '', options = [], title = '请选择', placeholder = '全部', disabled = false, onChange }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const hit = options.find((o) => String(o.value) === String(value))
  const label = hit ? hit.label : ''

  if (!isMobile) {
    return (
      <select className="ipt picker-native" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }
  return (
    <>
      <button type="button" className="picker-trigger" disabled={disabled} onClick={() => setOpen(true)}>
        {label ? <span>{label}</span> : <span className="pk-ph">{placeholder}</span>}
      </button>
      {open && createPortal(
        <>
          <div className="picker-sheet-mask" onClick={() => setOpen(false)} />
          <div className="picker-sheet">
            <div className="picker-head">
              <span>{title}</span>
              <button type="button" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="picker-list">
              {options.map((o) => {
                const sel = String(o.value) === String(value)
                return (
                  <div key={o.value} className={'picker-item' + (sel ? ' selected' : '')}
                    onClick={() => { onChange(o.value); setOpen(false) }}>
                    <span>{o.label}</span>
                    {sel && <Icon name="check" size={16} className="pk-check" />}
                  </div>
                )
              })}
              {!options.length && <div className="empty" style={{ padding: 26 }}>暂无可选项</div>}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

/* ---------- DateRangeField：快捷项 + 起止日期时间 ---------- */
const QUICK = [
  { key: 'today', label: '今天' },
  { key: 'week', label: '一周内' },
  { key: 'month', label: '最近一月' },
  { key: 'half', label: '最近半年' }
]
const pad2 = (n) => String(n).padStart(2, '0')
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export function DateRangeField({ value, onChange, placeholder = '选择时间范围' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({})
  const rootRef = useRef(null)
  const popRef = useRef(null)
  const [dStart, setDStart] = useState('')
  const [tStart, setTStart] = useState('00:00:00')
  const [dEnd, setDEnd] = useState('')
  const [tEnd, setTEnd] = useState('23:59:59')

  const positionPop = () => {
    const r = rootRef.current?.getBoundingClientRect()
    const el = popRef.current
    if (!r || !el) return
    const w = el.offsetWidth || 340
    const h = el.offsetHeight || 340
    let left = r.left
    let top = r.bottom + 8
    if (left + w > window.innerWidth - 12) left = Math.max(12, window.innerWidth - w - 12)
    if (top + h > window.innerHeight - 12) {
      const above = r.top - h - 8
      top = above >= 12 ? above : Math.max(12, window.innerHeight - h - 12)
    }
    setPos({ top: top + 'px', left: left + 'px' })
  }

  useLayoutEffect(() => {
    if (open && !window.matchMedia('(max-width: 767px)').matches) positionPop()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target) &&
          popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    const onWin = () => {
      if (!window.matchMedia('(max-width: 767px)').matches) positionPop()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open])

  function openPop() {
    const v = value
    if (v && v.start) {
      setDStart(v.start.slice(0, 10))
      setTStart(v.start.slice(11, 19) || '00:00:00')
      setDEnd(v.end ? v.end.slice(0, 10) : v.start.slice(0, 10))
      setTEnd((v.end && v.end.slice(11, 19)) || '23:59:59')
    } else {
      const now = new Date()
      setDStart(fmtDate(now))
      setDEnd(fmtDate(now))
    }
    setOpen(true)
  }

  function applyQuick(key) {
    const end = new Date()
    const start = new Date()
    if (key === 'week') start.setDate(start.getDate() - 6)
    if (key === 'month') start.setMonth(start.getMonth() - 1)
    if (key === 'half') start.setMonth(start.getMonth() - 6)
    onChange({ start: `${fmtDate(start)} 00:00:00`, end: `${fmtDate(end)} 23:59:59` })
    setOpen(false)
  }

  function confirmRange() {
    if (!dStart || !dEnd) return
    onChange({ start: `${dStart} ${tStart || '00:00:00'}`, end: `${dEnd} ${tEnd || '23:59:59'}` })
    setOpen(false)
  }

  const label = value && value.start ? `${value.start} ~ ${value.end || ''}` : placeholder

  return (
    <div ref={rootRef} className="dr-field">
      <button type="button" className="ipt dr-btn"
        style={value && value.start ? undefined : { color: 'var(--ink-400)' }}
        onClick={() => (open ? setOpen(false) : openPop())}>
        <Icon name="calendar" size={14} style={{ marginRight: 6 }} />
        <span className="dr-label">{label}</span>
      </button>
      {open && createPortal(
        <div ref={popRef} className={'daterange-pop dr-pop-base'} style={pos} onClick={(e) => e.stopPropagation()}>
          <div className="daterange-quick">
            {QUICK.map((q) => (
              <button key={q.key} className="btn-chip" type="button" onClick={() => applyQuick(q.key)}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="daterange-grid">
            <div className="field"><span>开始日期</span>
              <input type="date" className="ipt" value={dStart} onChange={(e) => setDStart(e.target.value)} /></div>
            <div className="field"><span>开始时间</span>
              <input type="time" step="1" className="ipt" value={tStart} onChange={(e) => setTStart(e.target.value)} /></div>
            <div className="field"><span>结束日期</span>
              <input type="date" className="ipt" value={dEnd} onChange={(e) => setDEnd(e.target.value)} /></div>
            <div className="field"><span>结束时间</span>
              <input type="time" step="1" className="ipt" value={tEnd} onChange={(e) => setTEnd(e.target.value)} /></div>
          </div>
          <div className="daterange-foot">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(false)}>取消</button>
            <button className="btn btn-primary btn-sm" type="button" onClick={confirmRange}>确定</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, total, onChange }) {
  if (!(total > 0)) return null
  return (
    <div className="pager">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevron-left" size={14} /> 上一页
      </button>
      <span className="pager-info num">共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页 <Icon name="chevron-right" size={14} />
      </button>
    </div>
  )
}

/* ---------- 任务状态徽章 ---------- */
const STATUS_MAP = {
  0: { text: '未执行', cls: 'badge-warning' },
  1: { text: '执行中', cls: 'badge-info' },
  2: { text: '执行中', cls: 'badge-info' },
  5: { text: '已取消', cls: 'badge-gray' },
  9: { text: '已完成', cls: 'badge-success' }
}
export function TaskStatusBadge({ status }) {
  const hit = STATUS_MAP[String(status)] || { text: '执行中', cls: 'badge-info' }
  return <span className={'badge ' + hit.cls}>{hit.text}</span>
}

/* ---------- 空状态 ---------- */
export function EmptyState({ text = '暂无数据', icon = 'info' }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <span>{text}</span>
    </div>
  )
}

/* ---------- 地图选项 hook（复用 Vue 全局缓存的站点数据） ---------- */
export function useMapOptions() {
  const [opts, setOpts] = useState([])
  useEffect(() => {
    let alive = true
    loadSiteCodes().catch(() => {}).then(() => {
      if (alive) setOpts(mapOptions())
    })
    return () => { alive = false }
  }, [])
  return opts
}
