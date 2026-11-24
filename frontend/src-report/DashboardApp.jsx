/**
 * src-report/DashboardApp.jsx — data dashboard (parity w/ DashboardView.vue)
 * Segmented range (today/7d/30d/custom) + map filter + KPI + 3 charts + 2 ranks.
 */
import { useEffect, useMemo, useState } from 'react'
import '../src-ui/base.css'
import '../src-task/task.css'
import './report.css'
import { getAlarmHistory, getDailyTaskReport } from '../src/api/agv'
import { loadSiteCodes, mapOptions } from '../src/stores/app'
import { lastDaysRange, sumStatus, todayRange } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import KpiCard from './KpiCard'
import { EmptyState, DateRangeField, PickerSelect, useMapOptions } from '../src-task/controls'
import { baseChartOpts, gridScaleOpts, legendOpts, useChartJs } from './useChartJs'

const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f97316']
const SEG = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'custom', label: '自定义' }
]

function resolveRange(seg, custom) {
  if (seg === '7d') return { ...lastDaysRange(7), label: '近7天' }
  if (seg === '30d') return { ...lastDaysRange(30), label: '近30天' }
  if (seg === 'custom' && custom && custom.start) return { start: custom.start, end: custom.end, label: '自定义' }
  return { ...todayRange(), label: '今天' }
}

export default function DashboardApp() {
  const mapOpts = useMapOptions()
  const [seg, setSeg] = useState('today')
  const [customRange, setCustomRange] = useState(null)
  const [mapCode, setMapCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [lastUpdate, setLastUpdate] = useState('')
  const [rep, setRep] = useState(null)
  const [alarmTotal, setAlarmTotal] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [alarmRows, setAlarmRows] = useState([])
  const [version, setVersion] = useState(0)

  async function load(s = seg, custom = customRange, map = mapCode) {
    setLoading(true)
    setError(false)
    try {
      const range = resolveRange(s, custom)
      const common = { begin_date: range.start, end_date: range.end }
      const [repJ, alarmJ, activeJ] = await Promise.all([
        getDailyTaskReport({ start_date: range.start, end_date: range.end, map_code: map }),
        getAlarmHistory({ ...common, page: 1, pageSize: 500 }),
        getAlarmHistory({ ...common, alarm_status: 1, page: 1, pageSize: 1 })
      ])
      setRep(repJ.data || {})
      setAlarmRows(alarmJ.data || [])
      setAlarmTotal(alarmJ.total ?? 0)
      setActiveCount(activeJ.total ?? 0)
      setLastUpdate(new Date().toTimeString().slice(0, 8))
      setVersion((v) => v + 1)
    } catch (e) {
      setError(true)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function segClick(s) {
    setSeg(s)
    const custom = s === 'custom' && !customRange ? lastDaysRange(7) : customRange
    if (s === 'custom' && !customRange) setCustomRange(custom)
    if (s !== 'custom') load(s, custom, mapCode)
    // custom: wait for user to pick a range (parity w/ Vue)
  }
  const onCustomRange = (r) => { setCustomRange(r); load('custom', r, mapCode) }
  const onMap = (m) => { setMapCode(m); load(seg, customRange, m) }

  const dist = rep?.statusDistribution || []
  const kTotal = sumStatus(dist, ['0', '1', '2', '5', '9'])
  const kDone = sumStatus(dist, ['9'])
  const kRate = kTotal ? ((kDone / kTotal) * 100).toFixed(1) + '%' : '-'
  const kCancel = sumStatus(dist, ['5'])
  const kRunning = sumStatus(dist, ['1', '2'])
  const carrierStats = rep?.carrierStats || []
  const kAmr = carrierStats.length
  const kAvg = kAmr ? (kTotal / kAmr).toFixed(1) + ' 单' : '-'

  const statusRef = useChartJs(() => {
    const get = (s) => Number((dist.find((x) => String(x.status) === s) || {}).count || 0)
    return {
      type: 'doughnut',
      data: {
        labels: ['未执行', '执行中', '已取消', '已完成'],
        datasets: [{
          data: [get('0'), get('1') + get('2'), get('5'), get('9')],
          backgroundColor: ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: baseChartOpts({ cutout: '58%' })
    }
  }, [version])

  const mapRef = useChartJs(() => {
    const list = [...(rep?.mapTaskCounts || [])].sort((a, b) => b.task_count - a.task_count).slice(0, 10)
    return {
      type: 'bar',
      data: {
        labels: list.map((m) => m.map_name || m.map_code),
        datasets: [{
          data: list.map((m) => m.task_count),
          backgroundColor: list.map((_, i) => PALETTE[i % PALETTE.length] + 'cc'),
          borderRadius: 6, maxBarThickness: 34
        }]
      },
      options: baseChartOpts({
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ...gridScaleOpts(), beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
        }
      })
    }
  }, [version])

  const trendRef = useChartJs(() => {
    const trend = rep?.hourlyTrend || {}
    const entries = Object.entries(trend)
      .map(([name, hours]) => ({
        name, hours: hours || {},
        total: Object.values(hours || {}).reduce((a, b) => a + Number(b || 0), 0)
      }))
      .sort((a, b) => b.total - a.total).slice(0, 6)
    return {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
        datasets: entries.map(({ name, hours }, i) => ({
          label: name,
          data: Array.from({ length: 24 }, (_, h) => Number(hours[h] ?? hours[String(h)] ?? 0)),
          borderColor: PALETTE[i % PALETTE.length],
          backgroundColor: PALETTE[i % PALETTE.length],
          tension: 0.35, pointRadius: 2, borderWidth: 2
        }))
      },
      options: baseChartOpts({
        plugins: { legend: legendOpts() },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: gridScaleOpts(),
          y: { ...gridScaleOpts(), beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' } }
        }
      })
    }
  }, [version])

  const amrRank = useMemo(() => [...carrierStats].sort((a, b) => b.task_count - a.task_count).slice(0, 10), [rep])
  const amrMax = amrRank[0]?.task_count || 1

  const alarmRank = useMemo(() => {
    const c = new Map()
    for (const r of alarmRows) {
      const key = r.main_type_text || r.main_type_code || '未知'
      c.set(key, (c.get(key) || 0) + 1)
    }
    return [...c.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [alarmRows])
  const alarmMax = alarmRank[0]?.count || 1
  const alarmCapHint = alarmTotal > 500 ? '基于最近 500 条告警统计' : ''

  return (
    <div className="dash">
      <div className="dash-toolbar">
        <div className="dash-seg">
          {SEG.map((s) => (
            <button key={s.key} className={'seg-btn' + (seg === s.key ? ' active' : '')} onClick={() => segClick(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        {seg === 'custom' && (
          <div style={{ maxWidth: 300 }}>
            <DateRangeField value={customRange} onChange={onCustomRange} />
          </div>
        )}
        <div style={{ width: 190 }}>
          <PickerSelect value={mapCode} onChange={onMap} options={mapOpts} title="选择地图" placeholder="全部地图" />
        </div>
        {lastUpdate && <span className="dash-updated">更新于 {lastUpdate} · {resolveRange(seg, customRange).label}</span>}
      </div>

      {error && (
        <div className="dash-error">
          <Icon name="alert-circle" size={16} />
          <span>数据加载失败，数据库可能未连接</span>
          <Button variant="ghost" size="sm" onClick={() => load()}>重试</Button>
        </div>
      )}

      <div className="dash-kpis">
        <KpiCard label="任务总量" value={kTotal} icon="list" accent="#2563eb" tint="#eff6ff" />
        <KpiCard label="已完成" value={kDone} icon="check-circle" accent="#10b981" tint="#d1fae5" />
        <KpiCard label="完成率" value={kRate} icon="trending-up" accent="#06b6d4" tint="#cffafe" />
        <KpiCard label="已取消" value={kCancel} sub={`执行中 ${kRunning} 单`} icon="x-circle" accent="#f59e0b" tint="#fef3c7" />
        <KpiCard label="告警数" value={loading ? '-' : alarmTotal} sub={`未恢复 ${activeCount} 条`} icon="bell" accent="#ef4444" tint="#fee2e2" />
        <KpiCard label="活跃车辆" value={kAmr} sub={`车均 ${kAvg}`} icon="truck" accent="#8b5cf6" tint="#ede9fe" />
      </div>

      <div className="dash-grid">
        <section className="panel dash-panel">
          <h3 className="dash-panel-title">任务状态分布</h3>
          <div className="dash-chart"><canvas ref={statusRef} /></div>
        </section>
        <section className="panel dash-panel">
          <h3 className="dash-panel-title">各地图任务量 TOP10</h3>
          <div className="dash-chart tall"><canvas ref={mapRef} /></div>
        </section>
        <section className="panel dash-panel span-2">
          <h3 className="dash-panel-title">任务量逐时趋势（TOP6 地图）</h3>
          <div className="dash-chart"><canvas ref={trendRef} /></div>
        </section>
        <section className="panel dash-panel">
          <h3 className="dash-panel-title">车辆任务量 TOP10</h3>
          {amrRank.length ? (
            <div className="dash-rank">
              {amrRank.map((r, i) => (
                <div key={r.amr_code} className="rank-row">
                  <span className="rank-no num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rank-name num">{r.amr_code}</span>
                  <div className="rank-track">
                    <div className="rank-fill" style={{ width: (r.task_count / amrMax) * 100 + '%' }} />
                  </div>
                  <span className="rank-val num">{r.task_count} 单</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </section>
        <section className="panel dash-panel">
          <h3 className="dash-panel-title">告警类型 TOP8</h3>
          {alarmRank.length ? (
            <div className="dash-rank">
              {alarmRank.map((r, i) => (
                <div key={r.name} className="rank-row">
                  <span className="rank-no num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rank-name" style={{ width: 150, flex: 'none' }}>{r.name}</span>
                  <div className="rank-track">
                    <div className="rank-fill"
                      style={{ width: (r.count / alarmMax) * 100 + '%', background: 'linear-gradient(90deg, #f87171, #ef4444)' }} />
                  </div>
                  <span className="rank-val num">{r.count} 次</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
          {alarmCapHint && <p className="dash-footnote">统计范围：{alarmCapHint}</p>}
        </section>
      </div>
    </div>
  )
}
