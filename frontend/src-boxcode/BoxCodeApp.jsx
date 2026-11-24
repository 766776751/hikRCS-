/**
 * ============================================================================
 * src-boxcode/BoxCodeApp.jsx — 料箱码 / 托盘码管理（React 版）
 * ----------------------------------------------------------------------------
 * 由独立工具「3030 料箱码通用版」迁移而来，作为拓展平台的一个弹窗模块。
 * 两类码（料箱码 / 托盘码）各自独立的前缀、后缀位数、序号与统计。
 * 功能：增加 / 减少码值、规则设置（管理员密码）、导出 Excel、
 *       自定义序号范围打印模板（每个码打印两遍）。
 * 遵循 design tokens；图标统一 Icon、提示统一 toast、确认统一 confirmDialog。
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react'
import '../src-ui/base.css'
import './boxcode.css'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import Modal from '../src-ui/components/Modal'
import { toast } from '../src/composables/toast'
import { confirmDialog } from '../src/composables/confirm'
import {
  getBoxcodeConfig, getBoxcodeStats, generateBoxcode, reduceBoxcode,
  changeBoxcodeRule, boxcodeExportUrl, boxcodePrintTemplateUrl
} from '../src/api/agv'

const TYPE_META = {
  box: { label: '料箱码', icon: 'box', accent: '#2563eb' },
  pallet: { label: '托盘码', icon: 'package', accent: '#8b5cf6' }
}

function fileNameFrom(response, fallback) {
  const d = response.headers.get('Content-Disposition') || ''
  const m = d.match(/filename\*=UTF-8''([^;]+)/i)
  if (m) { try { return decodeURIComponent(m[1]) } catch (e) { /* noop */ } }
  const p = d.match(/filename="?([^";]+)"?/i)
  return p ? p[1] : fallback
}

async function download(url, fallback) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const href = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = fileNameFrom(res, fallback)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(href)
}

export default function BoxCodeApp() {
  const [activeType, setActiveType] = useState('box')
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  // forms
  const [count, setCount] = useState('1')
  const [password, setPassword] = useState('')
  const [reduceCount, setReduceCount] = useState('1')
  const [reducePassword, setReducePassword] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [reduceLoading, setReduceLoading] = useState(false)

  // modals
  const [ruleOpen, setRuleOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState({ adminPassword: '', prefix: '', suffixLength: '5', label: '', syncExisting: false })
  const [ruleSaving, setRuleSaving] = useState(false)
  const [tplStart, setTplStart] = useState('')
  const [tplEnd, setTplEnd] = useState('')
  const [tplLoading, setTplLoading] = useState(false)

  const typeInfo = types.find((t) => t.key === activeType) || null
  const meta = TYPE_META[activeType]

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await getBoxcodeStats()
      const list = res.data?.types || []
      setTypes(list)
      setLastUpdate(new Date().toLocaleTimeString('zh-CN'))
    } catch (e) {
      toast.error(e.message || '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  // reset per-type forms when switching
  function switchType(key) {
    if (key === activeType) return
    setActiveType(key)
    setPassword('')
    setReducePassword('')
  }

  const current = () => types.find((t) => t.key === activeType)

  async function handleGenerate(e) {
    e?.preventDefault()
    const n = parseInt(count)
    if (!Number.isInteger(n) || n < 1 || n > 500) { toast.error('生成数量必须在1-500之间'); return }
    if (!password) { toast.error('请输入密码'); return }
    setGenLoading(true)
    try {
      const res = await generateBoxcode({ codeType: activeType, count: n, password })
      await loadStats(true)
      toast.success(`成功生成 ${res.count} 个${res.label || meta.label}`)
      setPassword('')
    } catch (e) {
      if (e.status === 401) toast.error('密码错误，请重新输入')
      else toast.error(e.message || '生成失败')
    } finally {
      setGenLoading(false)
    }
  }

  async function handleReduce(e) {
    e?.preventDefault()
    const n = parseInt(reduceCount)
    if (!Number.isInteger(n) || n < 1 || n > 100) { toast.error('减少数量必须在1-100之间'); return }
    if (!reducePassword) { toast.error('请输入密码'); return }
    const label = current()?.label || meta.label
    const ok = await confirmDialog({
      title: `减少${label}`,
      message: `确定减少 ${n} 个${label}吗？`,
      detail: '将按序号从大到小移除，操作不可撤销。',
      type: 'danger', okText: '确定减少'
    })
    if (!ok) return
    setReduceLoading(true)
    try {
      const res = await reduceBoxcode({ codeType: activeType, count: n, password: reducePassword })
      await loadStats(true)
      toast.success(`成功减少 ${res.count} 个${label}`)
      setReducePassword('')
    } catch (e) {
      if (e.status === 401) toast.error('密码错误，请重新输入')
      else toast.error(e.message || '减少失败')
    } finally {
      setReduceLoading(false)
    }
  }

  function openRule() {
    const t = current() || {}
    setRuleForm({
      adminPassword: '',
      prefix: t.prefix || '',
      suffixLength: String(t.suffixLength ?? 5),
      label: t.label || meta.label,
      syncExisting: false
    })
    setRuleOpen(true)
  }

  async function submitRule() {
    const { adminPassword, prefix, suffixLength, label, syncExisting } = ruleForm
    if (!adminPassword) { toast.error('请输入管理员密码'); return }
    if (!/^\d{1,20}$/.test(String(prefix).trim())) { toast.error('前缀必须为 1-20 位数字'); return }
    if (String(suffixLength).trim() !== '') {
      const n = parseInt(suffixLength, 10)
      if (!Number.isInteger(n) || n < 1 || n > 9) { toast.error('后缀位数必须为 1-9 之间的整数'); return }
    }
    setRuleSaving(true)
    try {
      const res = await changeBoxcodeRule({
        codeType: activeType, adminPassword, prefix: String(prefix).trim(),
        suffixLength, label: label.trim(), syncExisting
      })
      await loadStats(true)
      const sample = res.type?.sampleFirst || ''
      let msg = `规则已更新：前缀 ${res.prefix}、后缀 ${res.suffixLength} 位${sample ? `，序号1 = ${sample}` : ''}`
      if (res.synced > 0) msg += `（已同步 ${res.synced} 条）`
      toast.success(msg)
      setRuleOpen(false)
    } catch (e) {
      if (e.status === 401) toast.error('管理员密码错误')
      else toast.error(e.message || '更改失败')
    } finally {
      setRuleSaving(false)
    }
  }

  function openTpl() { setTplStart(''); setTplEnd(''); setTplOpen(true) }

  async function submitTpl() {
    const start = parseInt(tplStart), end = parseInt(tplEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end)) { toast.error('请输入起始和结束序号'); return }
    if (start < 1) { toast.error('起始序号必须大于0'); return }
    if (start > end) { toast.error('起始序号不能大于结束序号'); return }
    const max = current()?.maxSequence ?? 99999
    if (end > max) { toast.error(`序号不能超过 ${max}`); return }
    setTplLoading(true)
    try {
      const url = boxcodePrintTemplateUrl({ codeType: activeType, startNumber: start, endNumber: end })
      await download(url, `${activeType}_template_${start}-${end}.xls`)
      toast.success('打印模板生成成功')
      setTplOpen(false)
    } catch (e) {
      toast.error(e.message || '生成失败')
    } finally {
      setTplLoading(false)
    }
  }

  async function handleExport() {
    try {
      await download(boxcodeExportUrl({ codeType: activeType }), `${activeType}_codes.xls`)
      toast.success('导出成功')
    } catch (e) {
      toast.error(e.message || '导出失败')
    }
  }

  const sample = (t) => {
    if (!t) return '-'
    if (t.nextSequence > t.maxSequence) return '已达上限'
    return t.prefix + String(t.nextSequence).padStart(t.suffixLength, '0')
  }

  return (
    <div className="bc-root">
      {/* ===== header: type switch + stats ===== */}
      <div className="bc-top">
        <div className="bc-type-switch" role="tablist">
          {['box', 'pallet'].map((k) => (
            <button key={k} type="button" role="tab"
              className={'bc-type-tab' + (activeType === k ? ' active' : '')}
              style={{ '--bc-accent': TYPE_META[k].accent }}
              aria-selected={activeType === k}
              onClick={() => switchType(k)}>
              <Icon name={TYPE_META[k].icon} size={17} />
              <span>{TYPE_META[k].label}</span>
              <span className="bc-type-count">{types.find((t) => t.key === k)?.count ?? '-'}</span>
            </button>
          ))}
        </div>
        <div className="bc-top-actions">
          <Button variant="ghost" size="sm" icon="settings" onClick={openRule}>规则设置</Button>
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => loadStats(true)}>刷新</Button>
        </div>
      </div>

      {/* ===== rule strip ===== */}
      <div className="bc-rule-strip">
        <span className="bc-rule-item">前缀 <b>{typeInfo?.prefix ?? '-'}</b></span>
        <span className="bc-sep" />
        <span className="bc-rule-item">后缀 <b>{typeInfo?.suffixLength ?? '-'}</b> 位</span>
        <span className="bc-sep" />
        <span className="bc-rule-item">下一个码值 <b className="num">{sample(typeInfo)}</b></span>
        <span className="bc-rule-item bc-rule-hint">码值 = 前缀 + 序号（按后缀位数补零）</span>
      </div>

      {/* ===== three columns ===== */}
      <div className="bc-grid">
        {/* add */}
        <section className="panel bc-card bc-add">
          <header className="bc-card-head"><span className="bc-card-ico add"><Icon name="plus" size={19} /></span><h3>增加{meta.label}</h3></header>
          <form onSubmit={handleGenerate} className="bc-form">
            <label className="field">生成数量
              <input className="ipt" type="number" min="1" max="500" value={count}
                onChange={(e) => setCount(e.target.value)} required />
            </label>
            <small className="bc-hint">单次最多生成 500 个</small>
            <label className="field">密码
              <input className="ipt" type="password" placeholder="请输入密码" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <small className="bc-hint">需要密码才能生成{ meta.label}</small>
            <Button variant="primary" type="submit" icon="plus" loading={genLoading}>增加{meta.label}</Button>
          </form>
        </section>

        {/* reduce */}
        <section className="panel bc-card bc-reduce">
          <header className="bc-card-head"><span className="bc-card-ico reduce"><Icon name="trash" size={19} /></span><h3>减少{meta.label}</h3></header>
          <form onSubmit={handleReduce} className="bc-form">
            <label className="field">减少数量
              <input className="ipt" type="number" min="1" max="100" value={reduceCount}
                onChange={(e) => setReduceCount(e.target.value)} required />
            </label>
            <small className="bc-hint">单次最多减少 100 个，按序号从大到小移除</small>
            <label className="field">密码
              <input className="ipt" type="password" placeholder="请输入密码" value={reducePassword}
                onChange={(e) => setReducePassword(e.target.value)} required />
            </label>
            <small className="bc-hint">需要密码才能减少{ meta.label}</small>
            <Button variant="danger" type="submit" icon="trash" loading={reduceLoading}>减少{meta.label}</Button>
          </form>
        </section>

        {/* stats / export */}
        <section className="panel bc-card bc-stats">
          <header className="bc-card-head"><span className="bc-card-ico stats"><Icon name="bar-chart" size={19} /></span><h3>统计与导出</h3></header>
          <div className="bc-stat-big">
            <span className="bc-stat-label">当前{meta.label}总数</span>
            <span className="bc-stat-num num">{loading ? '…' : (typeInfo?.count ?? 0)}</span>
          </div>
          <div className="bc-stat-actions">
            <Button variant="secondary" icon="download" onClick={handleExport}>导出 Excel</Button>
            <Button variant="secondary" icon="file" onClick={openTpl}>自定义导出码值</Button>
          </div>
          <small className="bc-hint bc-hint-block">自定义导出：选择序号范围，系统按前缀+补零生成并每个码打印两遍</small>
          <div className="bc-stat-foot">最后更新：<span>{lastUpdate || '-'}</span></div>
        </section>
      </div>

      {/* ===== rule modal ===== */}
      {ruleOpen && (
        <Modal title={`${meta.label}规则设置`} icon="settings" width="480px" fit onClose={() => setRuleOpen(false)}>
          <div className="bc-modal-form">
            <p className="bc-tip">设置前缀与序号后缀位数。码值 = 前缀 + 序号（按后缀位数左侧补零），序号从 1 递增。</p>
            <label className="field">{meta.label}名称
              <input className="ipt" value={ruleForm.label} maxLength={30}
                onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} />
            </label>
            <label className="field">前缀
              <input className="ipt" value={ruleForm.prefix} placeholder="如 80"
                onChange={(e) => setRuleForm({ ...ruleForm, prefix: e.target.value })} />
            </label>
            <small className="bc-hint">1-20 位数字</small>
            <label className="field">序号后缀位数
              <input className="ipt" type="number" min="1" max="9" value={ruleForm.suffixLength}
                onChange={(e) => setRuleForm({ ...ruleForm, suffixLength: e.target.value })} />
            </label>
            <small className="bc-hint">默认 5 位（1-9）；如 5 位时序号 1 = 00001</small>
            <label className="bc-check">
              <input type="checkbox" checked={ruleForm.syncExisting}
                onChange={(e) => setRuleForm({ ...ruleForm, syncExisting: e.target.checked })} />
              同步更新已生成的{ meta.label}
            </label>
            <small className="bc-hint">勾选后按新规则重刷存量码值；不勾选则只影响之后新生成的</small>
            <label className="field">管理员密码
              <input className="ipt" type="password" placeholder="请输入管理员密码" value={ruleForm.adminPassword}
                onChange={(e) => setRuleForm({ ...ruleForm, adminPassword: e.target.value })} />
            </label>
            <div className="bc-modal-actions">
              <Button variant="ghost" onClick={() => setRuleOpen(false)}>取消</Button>
              <Button variant="primary" loading={ruleSaving} onClick={submitRule}>确认更改</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ===== print-template modal ===== */}
      {tplOpen && (
        <Modal title="自定义导出码值" icon="file" width="480px" fit onClose={() => setTplOpen(false)}>
          <div className="bc-modal-form">
            <p className="bc-tip">选择序号范围，系统按「{typeInfo?.prefix ?? ''} + 序号补零」生成码值，每个码自动打印两遍，方便贴标。</p>
            <label className="field">起始序号
              <span className="bc-prefix-input">
                <span className="bc-prefix-tag num">{typeInfo?.prefix ?? ''}</span>
                <input className="ipt num" type="number" min="1" placeholder="输入序号数字" value={tplStart}
                  onChange={(e) => setTplStart(e.target.value)} />
              </span>
            </label>
            <label className="field">结束序号
              <span className="bc-prefix-input">
                <span className="bc-prefix-tag num">{typeInfo?.prefix ?? ''}</span>
                <input className="ipt num" type="number" min="1" placeholder="输入序号数字" value={tplEnd}
                  onChange={(e) => setTplEnd(e.target.value)} />
              </span>
            </label>
            <small className="bc-hint">后缀 {typeInfo?.suffixLength ?? '-'} 位，最大序号 {typeInfo?.maxSequence ?? '-'}</small>
            <div className="bc-modal-actions">
              <Button variant="ghost" onClick={() => setTplOpen(false)}>取消</Button>
              <Button variant="primary" icon="download" loading={tplLoading} onClick={submitTpl}>生成模板</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
