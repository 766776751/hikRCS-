/**
 * src-alarm/PushLogApp.jsx — push history (parity w/ PushLogView.vue)
 * Note: range/status filters auto-reload (parity w/ Vue @update:model-value),
 * passing explicit filters to avoid stale-closure reads.
 */
import { useEffect, useState } from 'react'
import '../src-ui/base.css'
import '../src-task/task.css'
import './alarm.css'
import { clearPushHistory, getPushHistory } from '../src/api/admin'
import { confirmDialog } from '../src/composables/confirm'
import { toast } from '../src/composables/toast'
import { todayRange } from '../src/utils/format'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import { AlarmLevelBadge } from './badges'
import { DateRangeField, EmptyState, FilterPanel, Pagination, PickerSelect, useIsMobile } from '../src-task/controls'

const STATUS_OPTS = [
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' }
]
const TARGET_CLS = { 企微: 'badge-info', 钉钉: 'badge-warning', 飞书: 'badge-violet', 公众号: 'badge-success' }
const PAGE_SIZE = 20

const fmtTime = (t, from = 0) => (t || '').replace('T', ' ').slice(from, 19)

export default function PushLogApp() {
  const isMobile = useIsMobile()
  const [f, setF] = useState({ status: '', range: null })
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(p = 1, filters = f) {
    setPage(p)
    setLoading(true)
    setError('')
    try {
      const j = await getPushHistory({
        page: p,
        page_size: PAGE_SIZE,
        start_date: filters.range?.start,
        end_date: filters.range?.end,
        status: filters.status
      })
      setRows(j.data || [])
      setTotal(j.total ?? 0)
      setTotalPages(j.total_pages ?? 1)
    } catch (e) {
      setError(e.message || '加载失败')
      setRows([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    // default range = today (parity w/ Vue onMounted)
    const range = todayRange()
    setF({ status: '', range })
    load(1, { status: '', range })
  }, [])

  const onRange = (range) => { setF((s) => ({ ...s, range })); load(1, { ...f, range }) }
  const onStatus = (status) => { setF((s) => ({ ...s, status })); load(1, { ...f, status }) }

  async function clearAll() {
    const ok = await confirmDialog({
      title: '清空推送历史',
      message: '将删除全部推送历史记录，且不可恢复，是否继续？',
      type: 'danger',
      okText: '确认清空'
    })
    if (!ok) return
    try {
      await clearPushHistory()
      toast.success('推送历史已清空')
      load(1)
    } catch (e) {
      toast.error(e.message || '清空失败')
    }
  }

  return (
    <div>
      <FilterPanel title="筛选条件">
        <div className="filter-bar">
          <div className="field" style={{ minWidth: 380, flex: '1 1 380px' }}>
            <label>推送时间</label>
            <DateRangeField value={f.range} onChange={onRange} />
          </div>
          <div className="field">
            <label>推送状态</label>
            <PickerSelect value={f.status} onChange={onStatus} options={STATUS_OPTS} title="推送状态" placeholder="全部" />
          </div>
          <div className="filter-actions">
            <button className="btn btn-danger" onClick={clearAll}>
              <Icon name="trash" size={14} /> 清空历史
            </button>
            <Button variant="primary" icon="search" loading={loading} onClick={() => load(1)}>查询</Button>
          </div>
        </div>
      </FilterPanel>

      {error && (
        <div className="pl-error">
          <Icon name="alert-circle" size={15} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => load(page)}>重试</Button>
        </div>
      )}

      {!isMobile && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>推送时间</th>
                  <th style={{ width: '7%' }}>耗时</th>
                  <th style={{ width: '7%' }}>状态</th>
                  <th style={{ width: '8%' }}>推送目标</th>
                  <th style={{ width: '8%' }}>设备编号</th>
                  <th style={{ width: '6%' }}>等级</th>
                  <th style={{ width: '34%' }}>推送消息详情</th>
                  <th style={{ width: '18%' }}>失败原因</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{fmtTime(r.push_time)}</td>
                    <td className="num">{r.duration_ms !== undefined ? r.duration_ms + 'ms' : '-'}</td>
                    <td>
                      <span className={'badge ' + (r.status === 'success' ? 'badge-success' : 'badge-danger')}>
                        {r.status === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                    <td><span className={'badge ' + (TARGET_CLS[r.push_target] || 'badge-gray')}>{r.push_target || '-'}</span></td>
                    <td className="num">{r.source_code || '-'}</td>
                    <td><AlarmLevelBadge level={r.log_level} /></td>
                    <td className="pl-detail" style={{ whiteSpace: 'normal' }}>{r.message_detail || '-'}</td>
                    <td className="pl-detail" style={{ whiteSpace: 'normal', color: 'var(--err)' }}>{r.error_msg || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !rows.length && <EmptyState icon="file" text="暂无推送记录" />}
            {loading && <div className="pl-loading"><span className="spinner" /> 正在加载…</div>}
          </div>
          <div style={{ padding: '0 14px' }}>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => load(p)} />
          </div>
        </div>
      )}

      {isMobile && (
        <div className="pl-cards">
          {rows.map((r, i) => (
            <div key={i} className={'panel pl-item ' + (r.status === 'success' ? 'ok' : 'fail')}>
              <div className="pi-head">
                <span className={'badge ' + (TARGET_CLS[r.push_target] || 'badge-gray')}>{r.push_target || '-'}</span>
                <span className={'badge ' + (r.status === 'success' ? 'badge-success' : 'badge-danger')}>
                  {r.status === 'success' ? '成功' : '失败'}
                </span>
                <span className="pi-time num">{fmtTime(r.push_time, 5)}</span>
              </div>
              <div className="pi-meta">
                <span className="num">{r.source_code || '-'}</span>
                <AlarmLevelBadge level={r.log_level} />
                <span className="num">{r.duration_ms !== undefined ? r.duration_ms + 'ms' : ''}</span>
              </div>
              {r.message_detail && <div className="pi-detail">{r.message_detail}</div>}
              {r.error_msg && <div className="pi-error">{r.error_msg}</div>}
            </div>
          ))}
          {!loading && !rows.length && <EmptyState icon="file" text="暂无推送记录" />}
          {loading && <div className="pl-loading"><span className="spinner" /> 正在加载…</div>}
          <Pagination page={page} totalPages={totalPages} total={total} onChange={(p) => load(p)} />
        </div>
      )}
    </div>
  )
}
