/**
 * ============================================================================
 * src-task/TaskCancelApp.jsx — 任务取消页（React 版）
 * ----------------------------------------------------------------------------
 * 与旧 Vue 版 TaskCancelView.vue 业务行为完全一致：
 *   · 只查执行中任务（task_status 固定 '1,2'）
 *   · 单个取消 / 批量取消（confirmDialog 二次确认，danger 红头）
 *   · 批量逐个调用、失败汇总 alertDialog；成功 toast
 * 复用 Vue 侧纯 JS 单例：api/agv.js、composables/toast.js、composables/confirm.js
 * （ToastHost / ConfirmHost 由 Vue 外壳全局渲染，跨框架共享同一弹窗体系）。
 * ============================================================================
 */
import { useEffect, useState } from 'react'
import '../src-ui/base.css'
import './task.css'
import { cancelTask, getRcsTasks } from '../src/api/agv'
import { loadSiteCodes, mapOptions } from '../src/stores/app'
import { alertDialog, confirmDialog } from '../src/composables/confirm'
import { toast } from '../src/composables/toast'
import { fmtDT } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import {
  EmptyState, FilterPanel, InputClear, Pagination, PickerSelect,
  TaskStatusBadge, useIsMobile
} from './controls'

const STATUS_OPTS = [{ value: '1,2', label: '执行中' }]
const PAGE_SIZE = 10

const EMPTY_F = {
  carrier: '', taskCode: '', amr: '', startSite: '', endSite: '', startMap: '', endMap: ''
}

function routeText(row, kind) {
  const name = kind === 'start' ? row.start_route_name : row.end_route_name
  const code = kind === 'start' ? row.start_route_code : row.end_route_code
  const mapName = kind === 'start' ? row.start_map_name : row.end_map_name
  return { main: name || code || '-', map: mapName || '' }
}

export default function TaskCancelApp() {
  const isMobile = useIsMobile()
  const [mapOpts, setMapOpts] = useState([])

  const [f, setF] = useState(EMPTY_F)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [cancelling, setCancelling] = useState(false)

  async function search(p = 1, filters = f) {
    setPage(p)
    setLoading(true)
    setError('')
    try {
      const j = await getRcsTasks({
        carrier_code: filters.carrier,
        task_chain_code: filters.taskCode,
        amr_code: filters.amr,
        start_route_code: filters.startSite,
        end_route_code: filters.endSite,
        task_status: '1,2',
        start_map_code: filters.startMap,
        end_map_code: filters.endMap,
        page: p,
        pageSize: PAGE_SIZE
      })
      const data = j.data || []
      setRows(data)
      setTotal(j.total ?? 0)
      setTotalPages(j.totalPages ?? 1)
      // 清掉不在当前结果里的选中项
      const codes = new Set(data.map((r) => r.task_chain_code))
      setSelected((prev) => new Set([...prev].filter((c) => codes.has(c))))
    } catch (e) {
      setError(e.message || '查询失败')
      setRows([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    search(1)
    let alive = true
    loadSiteCodes().catch(() => {}).then(() => { if (alive) setMapOpts(mapOptions()) })
    return () => { alive = false }
  }, [])

  function reset() {
    setF(EMPTY_F)
    setSelected(new Set())
    search(1, EMPTY_F)
  }

  function toggleSelect(code) {
    setSelected((prev) => {
      const s = new Set(prev)
      if (s.has(code)) s.delete(code)
      else s.add(code)
      return s
    })
  }

  async function cancelOne(row) {
    const ok = await confirmDialog({
      title: '取消任务',
      message: `确定取消任务 ${row.task_chain_code} 吗？`,
      detail: '取消操作直接发送到 RCS，请谨慎操作。',
      type: 'danger',
      okText: '确认取消'
    })
    if (!ok) return
    setCancelling(true)
    try {
      await cancelTask(row.task_chain_code)
      toast.success('任务已取消：' + row.task_chain_code)
    } catch (e) {
      toast.error(e.message || '取消失败')
    }
    setCancelling(false)
    await search(page)
  }

  async function batchCancel() {
    const codes = [...selected]
    if (!codes.length) return
    const ok = await confirmDialog({
      title: '批量取消任务',
      message: `确定取消选中的 ${codes.length} 个任务吗？`,
      detail: '取消操作直接发送到 RCS，请谨慎操作。',
      type: 'danger',
      okText: '批量取消'
    })
    if (!ok) return
    setCancelling(true)
    const fails = []
    for (const code of codes) {
      try {
        await cancelTask(code)
      } catch (e) {
        fails.push(`${code}：${e.message || '失败'}`)
      }
    }
    setCancelling(false)
    setSelected(new Set())
    await search(page)
    if (fails.length) {
      alertDialog(`取消完成，${codes.length - fails.length} 成功 / ${fails.length} 失败：`, {
        title: '批量取消结果',
        type: 'warn',
        detail: fails.join('\n')
      })
    } else {
      toast.success(`已成功取消 ${codes.length} 个任务`)
    }
  }

  const seq = (i) => (page - 1) * PAGE_SIZE + i + 1

  return (
    <div>
      <div className="cancel-banner">
        <Icon name="warning" size={16} />
        <span>本页只显示未执行 / 执行中的任务，取消操作直接发送到 RCS，请谨慎操作。有设备编号 = AGV 执行中，无设备编号 = 排队中。</span>
      </div>

      <FilterPanel title="筛选条件">
        <div className="filter-bar">
          <div className="field"><label>载具编号</label>
            <InputClear value={f.carrier} onChange={set('carrier')} placeholder="载具编号" /></div>
          <div className="field"><label>任务链编号</label>
            <InputClear value={f.taskCode} onChange={set('taskCode')} placeholder="任务链编号" /></div>
          <div className="field"><label>设备编号</label>
            <InputClear value={f.amr} onChange={set('amr')} placeholder="车号" /></div>
          <div className="field"><label>任务状态</label>
            <PickerSelect value="1,2" options={STATUS_OPTS} title="任务状态" disabled /></div>
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

      {/* 批量操作条 */}
      <div className={'batch-bar' + (selected.size > 0 ? ' active' : '')}>
        <span><b className="num">{selected.size}</b> 个任务已选中</span>
        <button className="btn btn-danger btn-sm" disabled={!selected.size || cancelling} onClick={batchCancel}>
          <Icon name="x-circle" size={14} /> 批量取消{selected.size ? `（${selected.size}）` : ''}
        </button>
      </div>

      {/* 桌面端表格 */}
      {!isMobile && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="tbl tbl-cancel">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}></th>
                  <th style={{ width: '5%' }}>#</th>
                  <th style={{ width: '15%' }}>任务链编号</th>
                  <th style={{ width: '11%' }}>载具编号</th>
                  <th style={{ width: '9%' }}>设备编号</th>
                  <th style={{ width: '13%' }}>起点</th>
                  <th style={{ width: '13%' }}>终点</th>
                  <th style={{ width: '8%' }}>状态</th>
                  <th style={{ width: '12%' }}>创建时间</th>
                  <th style={{ width: '16%' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = routeText(r, 'start')
                  const en = routeText(r, 'end')
                  return (
                  <tr key={r.task_chain_code} className={selected.has(r.task_chain_code) ? 'checked' : ''}>
                    <td>
                      <input type="checkbox" className="cb"
                        checked={selected.has(r.task_chain_code)}
                        onChange={() => toggleSelect(r.task_chain_code)} />
                    </td>
                    <td className="num">{seq(i)}</td>
                    <td className="num">{r.task_chain_code}</td>
                    <td className="num">{r.carrier_code || '-'}</td>
                    <td>
                      {r.amr_code
                        ? <span className="num" style={{ color: 'var(--brand-600)', fontWeight: 700 }}>{r.amr_code}</span>
                        : <span style={{ color: 'var(--err)', fontWeight: 600 }}>无</span>}
                    </td>
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
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-danger btn-sm" disabled={cancelling} onClick={() => cancelOne(r)}>
                        <Icon name="x-circle" size={14} /> 取消任务
                      </button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && !rows.length && <EmptyState icon="x-circle" text="未查询到执行中的任务" />}
            {loading && <div className="q-loading"><span className="spinner" /> 正在查询…</div>}
          </div>
          <div style={{ padding: '0 14px' }}>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => search(p)} />
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
            <div key={r.task_chain_code}
              className={'panel task-item' + (selected.has(r.task_chain_code) ? ' cancel-checked' : '')}
              onClick={() => toggleSelect(r.task_chain_code)}>
              <div className="ti-head">
                <input type="checkbox" className="cb"
                  checked={selected.has(r.task_chain_code)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(r.task_chain_code)} />
                <span className="ti-seq num">{seq(i)}</span>
                <span className="ti-code num">{r.task_chain_code}</span>
                <TaskStatusBadge status={r.task_status} />
              </div>
              <div className="ti-row">
                <span className="ti-label">载具</span><span className="ti-value num">{r.carrier_code || '无'}</span>
                <span className="ti-label" style={{ marginLeft: 14 }}>设备</span>
                <span className={'ti-value num' + (r.amr_code ? '' : ' red')}>{r.amr_code || '无'}</span>
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
              <div className="ti-foot">
                <span className="ti-time num">{fmtDT(r.create_time)}</span>
                <button className="btn btn-danger btn-sm" disabled={cancelling}
                  onClick={(e) => { e.stopPropagation(); cancelOne(r) }}>
                  取消任务
                </button>
              </div>
            </div>
            )
          })}
          {!loading && !rows.length && <EmptyState icon="x-circle" text="未查询到执行中的任务" />}
          {loading && <div className="q-loading"><span className="spinner" /> 正在查询…</div>}
          <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => search(p)} />
        </div>
      )}
    </div>
  )
}
