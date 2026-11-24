/**
 * src-report/DailyReportApp.jsx — daily task report (parity w/ DailyReportView.vue)
 * Chart.js via useChartJs; config helpers reused from Vue module (pure fns).
 */
import { useEffect, useMemo, useState } from 'react'
import '../src-ui/base.css'
import '../src-task/task.css' // fp/dr-*/picker-* control styles
import './report.css'
import { getDailyTaskReport } from '../src/api/agv'
import { loadSiteCodes, mapOptions } from '../src/stores/app'
import { sumStatus, todayRange } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import { DateRangeField, PickerSelect, useMapOptions } from '../src-task/controls'
import { baseChartOpts, gridScaleOpts, legendOpts, useChartJs } from './useChartJs'

const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#f97316']

export default function DailyReportApp() {
  const mapOpts = useMapOptions()
  const [range, setRange] = useState(todayRange())
  const [mapCode, setMapCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rep, setRep] = useState(null)
  const [version, setVersion] = useState(0)

  async function load(r = range, map = mapCode) {
    setLoading(true)
    setError('')
    try {
      const j = await getDailyTaskReport({ start_date: r.start, end_date: r.end, map_code: map })
      setRep(j.data || {})
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e.message || '报表加载失败')
      setRep(null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const onRange = (r) => { setRange(r); load(r, mapCode) }
  const onMap = (m) => { setMapCode(m); load(range, m) }

  const dist = rep?.statusDistribution || []
  const stat = useMemo(() => {
    const total = sumStatus(dist, ['0', '1', '2', '5', '9'])
    const done = sumStatus(dist, ['9'])
    const cancel = sumStatus(dist, ['5'])
    return { total, done, cancel, rate: total ? ((done / total) * 100).toFixed(1) + '%' : '-' }
  }, [rep])

  const getPie = (s) => Number((dist.find((x) => String(x.status) === s) || {}).count || 0)

  const pieRef = useChartJs(() => ({
    type: 'doughnut',
    data: {
      labels: ['未执行', '执行中', '已取消', '已完成'],
      datasets: [{
        data: [getPie('0'), getPie('1') + getPie('2'), getPie('5'), getPie('9')],
        backgroundColor: ['#facc15', '#2563eb', '#f97316', '#10b981'],
        borderWidth: 2, borderColor: '#fff'
      }]
    },
    options: baseChartOpts({ cutout: '55%' })
  }), [version])

  const barRef = useChartJs(() => {
    const list = [...(rep?.mapTaskCounts || [])].sort((a, b) => b.task_count - a.task_count)
    return {
      type: 'bar',
      data: {
        labels: list.map((m) => m.map_name || m.map_code),
        datasets: [{
          label: '任务量', data: list.map((m) => m.task_count),
          backgroundColor: '#2563ebcc', borderRadius: 6, maxBarThickness: 40
        }]
      },
      options: baseChartOpts({
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const m = list[items[0].dataIndex]
                const parts = []
                if (m.vehicle_count !== undefined) parts.push(`车辆数：${m.vehicle_count}`)
                if (m.avg_per_vehicle !== undefined) parts.push(`车均：${m.avg_per_vehicle} 单`)
                return parts
              }
            }
          }
        },
        scales: {
          x: gridScaleOpts(),
          y: { ...gridScaleOpts(), beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' } }
        }
      })
    }
  }, [version])

  const byDay = rep?.trendGranularity === 'day'

  // 当前查询区间的可读描述：起止日期 + 跨度天数（用于趋势图小字，自解释当前阶段）
  const rangeText = useMemo(() => {
    const s = String(range.start || '').slice(0, 10)
    const e = String(range.end || '').slice(0, 10)
    if (!s) return ''
    const spanMs = new Date(String(range.end).replace(' ', 'T')) - new Date(String(range.start).replace(' ', 'T'))
    const days = Math.max(1, Math.round(spanMs / 86400000))
    const spanTxt = days <= 1 ? '当天' : `跨 ${days} 天`
    return s === e ? `${s}（${spanTxt}）` : `${s} ~ ${e}（${spanTxt}）`
  }, [range])

  const trendLabels = byDay
    ? (rep?.trendLabels || [])
    : Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

  const lineRef = useChartJs(() => {
    const trend = rep?.hourlyTrend || {}
    const entries = Object.entries(trend)
      .map(([name, buckets]) => ({
        name, buckets: buckets || {},
        total: Object.values(buckets || {}).reduce((a, b) => a + Number(b || 0), 0)
      }))
      .sort((a, b) => b.total - a.total).slice(0, 6)
    return {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: entries.map(({ name, buckets }, i) => ({
          label: name,
          data: trendLabels.map((label) =>
            byDay ? Number(buckets[label] ?? 0) : Number(buckets[label] ?? buckets[Number(label)] ?? 0)
          ),
          borderColor: PALETTE[i % PALETTE.length],
          backgroundColor: PALETTE[i % PALETTE.length],
          tension: 0.35,
          pointRadius: trendLabels.length > 31 ? 0 : 2,
          borderWidth: 2
        }))
      },
      options: baseChartOpts({
        plugins: {
          legend: legendOpts(),
          tooltip: {
            callbacks: {
              title: (items) => byDay ? `${items[0].label}` : `${items[0].label}:00`
            }
          }
        },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: gridScaleOpts(),
          y: { ...gridScaleOpts(), beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' } }
        }
      })
    }
  }, [version])

  const carrierRef = useChartJs(() => {
    const list = [...(rep?.carrierStats || [])].sort((a, b) => b.task_count - a.task_count).slice(0, 15)
    return {
      type: 'bar',
      data: {
        labels: list.map((c) => c.amr_code),
        datasets: [{
          label: '完成任务数', data: list.map((c) => c.task_count),
          backgroundColor: '#8b5cf6cc', borderRadius: 6, maxBarThickness: 22
        }]
      },
      options: baseChartOpts({
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => ` 车号 ${it.label}：${it.parsed.x} 单` } } },
        scales: {
          x: { ...gridScaleOpts(), beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
        }
      })
    }
  }, [version])

  return (
    <div>
      <div className="rep-toolbar">
        <div style={{ maxWidth: 360 }}>
          <DateRangeField value={range} onChange={onRange} />
        </div>
        <div style={{ width: 190 }}>
          <PickerSelect value={mapCode} onChange={onMap} options={mapOpts} title="选择地图" placeholder="全部地图" />
        </div>
        <Button variant="primary" icon="search" loading={loading} onClick={() => load()}>查询报表</Button>
      </div>

      {error && (
        <div className="rep-error">
          <Icon name="alert-circle" size={16} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load()}>重试</Button>
        </div>
      )}

      <div className="rep-stats">
        <div className="rs-chip" style={{ '--c': '#2563eb' }}>
          <span className="rs-label">总任务</span><span className="rs-value num">{stat.total}</span>
        </div>
        <div className="rs-chip" style={{ '--c': '#10b981' }}>
          <span className="rs-label">已完成</span><span className="rs-value num">{stat.done}</span>
        </div>
        <div className="rs-chip" style={{ '--c': '#f59e0b' }}>
          <span className="rs-label">已取消</span><span className="rs-value num">{stat.cancel}</span>
        </div>
        <div className="rs-chip" style={{ '--c': '#06b6d4' }}>
          <span className="rs-label">完成率</span><span className="rs-value num">{stat.rate}</span>
        </div>
      </div>

      <div className="rep-grid">
        <section className="panel rep-panel">
          <h3 className="rep-title">任务状态分布</h3>
          <div className="rep-chart"><canvas ref={pieRef} /></div>
        </section>
        <section className="panel rep-panel">
          <h3 className="rep-title">各起点地图任务量</h3>
          <div className="rep-chart"><canvas ref={barRef} /></div>
        </section>
        <section className="panel rep-panel span-2">
          <h3 className="rep-title">
            任务量趋势（按{byDay ? '天' : '小时'}）
            <span className="rep-title-hint">
              {rangeText ? `${rangeText} · ` : ''}{byDay ? '跨天区间按每天汇总' : '单日区间按每小时汇总'} · 按起点地图分线
            </span>
          </h3>
          <div className="rep-chart"><canvas ref={lineRef} /></div>
        </section>
        <section className="panel rep-panel span-2">
          <h3 className="rep-title">设备完成任务数 TOP15</h3>
          <div className="rep-chart tall"><canvas ref={carrierRef} /></div>
        </section>
      </div>
    </div>
  )
}
