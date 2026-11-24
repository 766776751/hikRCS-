/**
 * src-alarm/AlarmQueryApp.jsx — alarm history query (parity w/ AlarmQueryView.vue)
 * Reuses Vue plain-JS modules: api/agv.js, stores/app.js, composables/confirm.js.
 */
import { useEffect, useState } from 'react'
import '../src-ui/base.css'
import '../src-task/task.css' // shared control styles (fp/dr-*/picker-*)
import './alarm.css'
import { alarmExportUrl, getAlarmHistory } from '../src/api/agv'
import { loadAlarmAreas } from '../src/stores/app'
import { confirmDialog } from '../src/composables/confirm'
import { fmtDT, lastDaysRange } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import { AlarmLevelBadge, AlarmStatusBadge } from './badges'
import {
  DateRangeField, EmptyState, FilterPanel, InputClear,
  Pagination, PickerSelect, useIsMobile
} from '../src-task/controls'

const LEVEL_OPTS = [
  { value: '1', label: '低' },
  { value: '2', label: '中' },
  { value: '3', label: '严重' }
]
const PAGE_SIZE = 10

const EMPTY_F = { range: null, sourceCode: '', level: '', area: '', content: '' }

const typeText = (r) => [r.main_type_text, r.minor_type_text].filter(Boolean).join(' - ') || '-'
const dash = (v) => (v === undefined || v === null || v === '' ? '-' : v)

export default function AlarmQueryApp() {
  const isMobile = useIsMobile()
  const [f, setF] = useState(EMPTY_F)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const [areaOpts, setAreaOpts] = useState([])
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function search(p = 1, filters = f) {
    setPage(p)
    setLoading(true)
    setError('')
    try {
      const j = await getAlarmHistory({
        source_code: filters.sourceCode,
        log_level: filters.level,
        elc_map_code: filters.area,
        alarm_content: filters.content,
        begin_date: filters.range?.start,
        end_date: filters.range?.end,
        page: p,
        pageSize: PAGE_SIZE
      })
      setRows(j.data || [])
      setTotal(j.total ?? 0)
      setTotalPages(j.pagination?.total_pages ?? j.pagination?.totalPages ?? 1)
    } catch (e) {
      setError(e.message || '查询失败')
      setRows([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    // default range = last 7 days (parity w/ Vue onMounted)
    const range = lastDaysRange(7)
    setF((s) => ({ ...s, range }))
    search(1, { ...EMPTY_F, range })
    let alive = true
    loadAlarmAreas().then((areas) => {
      if (alive) setAreaOpts(areas.map((a) => ({ value: a.code, label: `${a.name || a.code}（${a.code}）` })))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  function reset() {
    setF(EMPTY_F)
    search(1, EMPTY_F)
  }

  async function exportAlarms() {
    const ok = await confirmDialog({
      title: '导出告警',
      message: '将按当前筛选条件导出全部告警记录（XLS），可能数据量较大，是否继续？',
      type: 'info',
      okText: '开始导出'
    })
    if (!ok) return
    window.open(alarmExportUrl({
      source_code: f.sourceCode,
      log_level: f.level,
      elc_map_code: f.area,
      alarm_content: f.content,
      begin_date: f.range?.start,
      end_date: f.range?.end
    }), '_blank')
  }

  const seq = (i) => (page - 1) * PAGE_SIZE + i + 1

  return (
    <div>
      <FilterPanel title="筛选条件">
        <div className="filter-bar">
          <div className="field" style={{ minWidth: 220 }}>
            <label>告警时间</label>
            <DateRangeField value={f.range} onChange={set('range')} />
          </div>
          <div className="field"><label>设备编号</label>
            <InputClear value={f.sourceCode} onChange={set('sourceCode')} placeholder="设备编号" /></div>
          <div className="field"><label>告警等级</label>
            <PickerSelect value={f.level} onChange={set('level')} options={LEVEL_OPTS} title="告警等级" placeholder="全部等级" /></div>
          <div className="field"><label>告警区域</label>
            <PickerSelect value={f.area} onChange={set('area')} options={areaOpts} title="告警区域" placeholder="全部区域" /></div>
          <div className="field"><label>告警内容</label>
            <InputClear value={f.content} onChange={set('content')} placeholder="关键词（支持逗号分隔多词）" /></div>
          <div className="filter-actions">
            <Button variant="ghost" onClick={reset}>重置筛选</Button>
            <Button variant="ghost" icon="download" onClick={exportAlarms}>导出 XLS</Button>
            <Button variant="primary" icon="search" loading={loading} onClick={() => search(1)}>查询</Button>
          </div>
        </div>
      </FilterPanel>

      {error && (
        <div className="aq-error">
          <Icon name="alert-circle" size={15} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => search(page)}>重试</Button>
        </div>
      )}

      {!isMobile && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>序号</th>
                  <th style={{ width: '9%' }}>设备编号</th>
                  <th style={{ width: '7%' }}>等级</th>
                  <th style={{ width: '9%' }}>状态</th>
                  <th style={{ width: '13%' }}>开始时间</th>
                  <th style={{ width: '13%' }}>结束时间</th>
                  <th style={{ width: '9%' }}>持续时间</th>
                  <th style={{ width: '11%' }}>告警区域</th>
                  <th style={{ width: '10%' }}>区域坐标</th>
                  <th style={{ width: '15%' }}>告警类型</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.source_code + r.begin_date + i}>
                    <td className="num">{seq(i)}</td>
                    <td className="num">{r.source_code || '-'}</td>
                    <td><AlarmLevelBadge level={r.log_level} text={r.level_text} /></td>
                    <td><AlarmStatusBadge resolved={!!r.end_date} /></td>
                    <td className="num">{fmtDT(r.begin_date_formatted || r.begin_date)}</td>
                    <td className="num">{r.end_date ? fmtDT(r.end_date_formatted || r.end_date) : '-'}</td>
                    <td>{r.duration || '-'}</td>
                    <td>{r.elc_map_code_text || '-'}</td>
                    <td className="num">X:{dash(r.alarm_x)} Y:{dash(r.alarm_y)}</td>
                    <td style={{ whiteSpace: 'normal' }}>{typeText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !rows.length && <EmptyState icon="bell" text="未查询到告警记录" />}
            {loading && <div className="aq-loading"><span className="spinner" /> 正在查询…</div>}
          </div>
          <div style={{ padding: '0 14px' }}>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => search(p)} />
          </div>
        </div>
      )}

      {isMobile && (
        <div className="aq-cards">
          {rows.map((r, i) => (
            <div key={r.source_code + r.begin_date + i}
              className={'panel alarm-item' + (r.end_date ? ' resolved' : '')}>
              <div className="ai-head">
                <span className="ai-source num">{r.source_code || '-'}</span>
                <AlarmLevelBadge level={r.log_level} text={r.level_text} />
                <AlarmStatusBadge resolved={!!r.end_date} />
              </div>
              <div className="ai-type">{typeText(r)}</div>
              <div className="ai-meta">
                <span>{fmtDT(r.begin_date_formatted || r.begin_date)}</span>
                {r.duration && <span>{r.duration}</span>}
                {r.elc_map_code_text && <span>{r.elc_map_code_text}</span>}
              </div>
            </div>
          ))}
          {!loading && !rows.length && <EmptyState icon="bell" text="未查询到告警记录" />}
          {loading && <div className="aq-loading"><span className="spinner" /> 正在查询…</div>}
          <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => search(p)} />
        </div>
      )}
    </div>
  )
}
