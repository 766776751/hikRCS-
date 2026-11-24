/**
 * ============================================================================
 * src-task/TaskQueryApp.jsx — 任务查询页（React 版）
 * ----------------------------------------------------------------------------
 * 与旧 Vue 版 TaskQueryView.vue 业务行为完全一致：
 *   · 10 个筛选字段 + 重置/查询
 *   · 分页表格（桌面）/ 卡片列表（移动）
 *   · 设备编号缺失红色"无"提示、起终点地图附注
 * 复用 Vue 侧纯 JS 模块：api/agv.js（getRcsTasks）、utils/format.js。
 * ============================================================================
 */
import { useEffect, useState } from 'react'
import '../src-ui/base.css'
import './task.css'
import { getRcsTasks } from '../src/api/agv'
import { fmtDT } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import {
  DateRangeField, EmptyState, FilterPanel, InputClear,
  Pagination, PickerSelect, TaskStatusBadge, useIsMobile, useMapOptions
} from './controls'

const STATUS_OPTS = [
  { value: '0', label: '未执行' },
  { value: '1,2', label: '执行中' },
  { value: '9', label: '已完成' },
  { value: '5', label: '已取消' }
]
const PAGE_SIZE = 10

const EMPTY_F = {
  range: null, carrier: '', taskCode: '', amr: '', startSite: '', endSite: '',
  status: '', taskType: '', startMap: '', endMap: ''
}

function routeText(row, kind) {
  const name = kind === 'start' ? row.start_route_name : row.end_route_name
  const code = kind === 'start' ? row.start_route_code : row.end_route_code
  const mapName = kind === 'start' ? row.start_map_name : row.end_map_name
  return { main: name || code || '-', map: mapName || '' }
}

export default function TaskQueryApp() {
  const isMobile = useIsMobile()
  const mapOpts = useMapOptions()

  const [f, setF] = useState(EMPTY_F)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function search(p = 1) {
    setPage(p)
    setLoading(true)
    setError('')
    try {
      const j = await getRcsTasks({
        start_time: f.range?.start,
        end_time: f.range?.end,
        carrier_code: f.carrier,
        task_chain_code: f.taskCode,
        amr_code: f.amr,
        start_route_code: f.startSite,
        end_route_code: f.endSite,
        task_status: f.status,
        task_chain_type: f.taskType,
        start_map_code: f.startMap,
        end_map_code: f.endMap,
        page: p,
        pageSize: PAGE_SIZE
      })
      setRows(j.data || [])
      setTotal(j.total ?? 0)
      setTotalPages(j.totalPages ?? 1)
    } catch (e) {
      setError(e.message || '查询失败')
      setRows([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => { search(1) }, [])

  function reset() {
    setF(EMPTY_F)
    // 重置后立即用空条件查询：直接发请求，避免闭包拿到旧 f
    ;(async () => {
      setPage(1)
      setLoading(true)
      setError('')
      try {
        const j = await getRcsTasks({ page: 1, pageSize: PAGE_SIZE })
        setRows(j.data || [])
        setTotal(j.total ?? 0)
        setTotalPages(j.totalPages ?? 1)
      } catch (e) {
        setError(e.message || '查询失败')
      }
      setLoading(false)
    })()
  }

  const seq = (i) => (page - 1) * PAGE_SIZE + i + 1

  return (
    <div>
      <FilterPanel title="筛选条件">
        <div className="filter-bar">
          <div className="field" style={{ minWidth: 220 }}>
            <label>任务时间</label>
            <DateRangeField value={f.range} onChange={set('range')} />
          </div>
          <div className="field"><label>载具编号</label>
            <InputClear value={f.carrier} onChange={set('carrier')} placeholder="载具编号" /></div>
          <div className="field"><label>任务链编号</label>
            <InputClear value={f.taskCode} onChange={set('taskCode')} placeholder="任务链编号" /></div>
          <div className="field"><label>设备编号</label>
            <InputClear value={f.amr} onChange={set('amr')} placeholder="车号" /></div>
          <div className="field"><label>任务状态</label>
            <PickerSelect value={f.status} onChange={set('status')} options={STATUS_OPTS} title="任务状态" placeholder="全部状态" /></div>
          <div className="field"><label>任务类型</label>
            <InputClear value={f.taskType} onChange={set('taskType')} placeholder="任务类型编码" /></div>
          <div className="field"><label>起点站点</label>
            <InputClear value={f.startSite} onChange={set('startSite')} placeholder="起点站点编码" /></div>
          <div className="field"><label>终点站点</label>
            <InputClear value={f.endSite} onChange={set('endSite')} placeholder="终点站点编码" /></div>
          <div className="field"><label>起点地图</label>
            <PickerSelect value={f.startMap} onChange={set('startMap')} options={mapOpts} title="起点地图" placeholder="全部" /></div>
          <div className="field"><label>终点地图</label>
            <PickerSelect value={f.endMap} onChange={set('endMap')} options={mapOpts} title="终点地图" placeholder="全部" /></div>
          <div className="filter-actions">
            <Button variant="ghost" onClick={reset}>重置筛选</Button>
            <Button variant="primary" icon="search" loading={loading} onClick={() => search(1)}>查询</Button>
          </div>
        </div>
      </FilterPanel>

      {error && (
        <div className="q-error">
          <Icon name="alert-circle" size={15} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => search(page)}>重试</Button>
        </div>
      )}

      {/* 桌面端表格 */}
      {!isMobile && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>#</th>
                  <th style={{ width: '12%' }}>载具编号</th>
                  <th style={{ width: '15%' }}>任务链编号</th>
                  <th style={{ width: '9%' }}>设备编号</th>
                  <th style={{ width: '11%' }}>任务类型</th>
                  <th style={{ width: '14%' }}>起点</th>
                  <th style={{ width: '14%' }}>终点</th>
                  <th style={{ width: '9%' }}>状态</th>
                  <th style={{ width: '11%' }}>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = routeText(r, 'start')
                  const en = routeText(r, 'end')
                  return (
                    <tr key={r.task_chain_code + i}>
                      <td className="num">{seq(i)}</td>
                      <td className="num">{r.carrier_code || '-'}</td>
                      <td className="num">{r.task_chain_code}</td>
                      <td>
                        {r.amr_code
                          ? <span className="num" style={{ color: 'var(--brand-600)', fontWeight: 700 }}>{r.amr_code}</span>
                          : <span style={{ color: 'var(--err)', fontWeight: 600 }}>无</span>}
                      </td>
                      <td>{r.task_chain_type_name || r.task_chain_type || '-'}</td>
                      <td>
                        {st.main}
                        {st.map && <span style={{ color: 'var(--ink-400)', fontSize: '0.76rem' }}> [{st.map}]</span>}
                      </td>
                      <td>
                        {en.main}
                        {en.map && <span style={{ color: 'var(--ink-400)', fontSize: '0.76rem' }}> [{en.map}]</span>}
                      </td>
                      <td><TaskStatusBadge status={r.task_status} /></td>
                      <td className="num">{fmtDT(r.create_time)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && !rows.length && <EmptyState icon="list" text="未查询到任务" />}
            {loading && <div className="q-loading"><span className="spinner" /> 正在查询…</div>}
          </div>
          <div style={{ padding: '0 14px' }}>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={search} />
          </div>
        </div>
      )}

      {/* 移动端卡片 */}
      {isMobile && (
        <div className="m-cards">
          {rows.map((r, i) => {
            const st = routeText(r, 'start')
            const en = routeText(r, 'end')
            return (
              <div key={r.task_chain_code + i}
                className={'panel task-item ' + (r.amr_code ? 'has-device' : 'no-device')}>
                <div className="ti-head">
                  <span className="ti-seq num">{seq(i)}</span>
                  <span className="ti-code num">{r.task_chain_code}</span>
                  <TaskStatusBadge status={r.task_status} />
                </div>
                <div className="ti-row">
                  <span className="ti-label">载具</span><span className="ti-value num">{r.carrier_code || '无'}</span>
                  <span className="ti-label" style={{ marginLeft: 14 }}>设备</span>
                  <span className={'ti-value num' + (r.amr_code ? '' : ' red')}>{r.amr_code || '无'}</span>
                  <span className="ti-label" style={{ marginLeft: 14 }}>类型</span>
                  <span className="ti-value num">{r.task_chain_type_name || r.task_chain_type || '无'}</span>
                </div>
                <div className="ti-route">
                  <div className="ti-route-point">
                    <span className="ti-route-tag start">起点</span>
                    <span>{st.main}</span>
                    {st.map && <span className="ti-route-map">[{st.map}]</span>}
                  </div>
                  <Icon name="arrow-right" size={15} className="ti-route-arrow" />
                  <div className="ti-route-point">
                    <span className="ti-route-tag end">终点</span>
                    <span>{en.main}</span>
                    {en.map && <span className="ti-route-map">[{en.map}]</span>}
                  </div>
                </div>
                <div className="ti-time num">{fmtDT(r.create_time)}</div>
              </div>
            )
          })}
          {!loading && !rows.length && <EmptyState icon="list" text="未查询到任务" />}
          {loading && <div className="q-loading"><span className="spinner" /> 正在查询…</div>}
          <Pagination page={page} totalPages={totalPages} total={total} onChange={search} />
        </div>
      )}
    </div>
  )
}
