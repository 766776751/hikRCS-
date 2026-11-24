/**
 * ============================================================================
 * src-home/HomeApp.jsx — 首页（React 版）
 * ----------------------------------------------------------------------------
 * 与旧 Vue 版 HomeView.vue 业务行为完全一致：
 *   · 实时时钟（1s 刷新）
 *   · 今日 KPI：任务数 / 告警数 / 活跃车辆 / 执行中（骨架屏加载）
 *   · 手动任务：读 /api/manual-task-url（localStorage 离线兜底），
 *     点击新标签页打开；未设置时弹设置窗；保存写回后端
 *   · 三张功能卡：双入口（站点/货架）、三入口（任务，含齿轮设置）、
 *     三入口（告警，告警查询红色强调）
 * UI 规则遵循 docs/DESIGN-SPEC.md；样式类 hm- 前缀 + src-ui 组件。
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react'
import '../src-ui/base.css' // 设计系统：令牌 + ui-btn/ui-kpi/ui-modal 等基础样式
import './home.css'
import Icon from '../src-ui/components/Icon'
import Button, { Spinner } from '../src-ui/components/Button'
import Modal from '../src-ui/components/Modal'
import Kpi from '../src-ui/components/Kpi'
import {
  getAlarmHistory,
  getDailyTaskReport,
  getManualTaskUrl,
  saveManualTaskUrlApi
} from './api'

/* ---------- 工具（与 Vue 版 utils/format.js 语义一致） ---------- */
const pad = (n) => String(n).padStart(2, '0')

function todayRange() {
  const d = new Date()
  const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { start: `${s} 00:00:00`, end: `${s} 23:59:59` }
}

function sumStatus(list, statuses) {
  return (list || [])
    .filter((it) => statuses.includes(String(it.status)))
    .reduce((acc, it) => acc + (Number(it.count) || 0), 0)
}

/** 手动任务链接归一化（与 Vue 版一致） */
function normalizeUrl(raw) {
  let url = (raw || '').trim()
  if (!url) return ''
  if (/^(https?:)?\/\//i.test(url)) return url
  if (/^[\w.-]+(\.[a-z]{2,})?(:\d+)?(\/.*)?$/i.test(url)) return 'http://' + url
  return url
}

const STORAGE_KEY = 'manualTaskUrl'

/* ---------- 功能卡主题色（大红/大蓝/大绿/大橙 · 纯正原色，无调和色） ---------- */
const TONES = {
  blue:   { solid: '#1565c0', soft: '#e3f2fd', glow: 'rgba(21,101,192,.20)' },
  green:  { solid: '#2e7d32', soft: '#e8f5e9', glow: 'rgba(46,125,50,.20)' },
  red:    { solid: '#d32f2f', soft: '#ffebee', glow: 'rgba(211,47,47,.20)' },
  orange: { solid: '#ef6c00', soft: '#fff3e0', glow: 'rgba(239,108,0,.20)' }
}

/* ---------- 功能卡配置（与 Vue 版 FUNCS 一致） ---------- */
const FUNCS = [
  {
    type: 'dual',
    tone: 'blue',
    title: '货位、仓位数据查看',
    icon: 'map-pin',
    desc: '站点状态 · 载具状态 · 地图分布（叉车 / 潜伏车） / 货位状态 · 列聚合 · 任务查询（堆高车 / CTU）',
    a: { name: 'site', title: '站点监控', sub: '（叉车或潜伏车）', icon: 'map-pin' },
    b: { name: 'rack', title: '货架监控', sub: '（堆高车或CTU）', icon: 'box' }
  },
  {
    type: 'task',
    tone: 'green',
    title: '任务查询 / 任务取消 / 手动任务',
    icon: 'list',
    desc: 'AGV 任务记录 · 多条件筛选 / 批量 · 单个取消未执行或执行中任务 / 跳转外部手动任务系统',
    items: [
      { name: 'task', title: '任务查询', icon: 'list' },
      { name: 'cancel', title: '任务取消', icon: 'x-circle' },
      { kind: 'manual', title: '手动任务', icon: 'link' }
    ]
  },
  {
    type: 'task',
    tone: 'red',
    title: '告警推送 / 推送日志 / 告警查询',
    icon: 'send',
    desc: '企微 / 钉钉 / 飞书 / 公众号 Webhook 配置 / 推送历史 · 状态 · 失败原因 / 告警历史 · 等级筛选 · 导出',
    items: [
      { name: 'config', title: '告警推送', icon: 'send' },
      { name: 'pushlog', title: '推送日志', icon: 'file' },
      { name: 'alarm', title: '告警查询', icon: 'bell', tone: 'danger' }
    ]
  },
  {
    type: 'single',
    tone: 'orange',
    title: '料箱码 / 托盘码管理',
    icon: 'package',
    desc: '料箱码 · 托盘码独立编号 / 增减管理 · 规则设置 / 导出 Excel · 自定义打印模板',
    name: 'boxcode'
  }
]

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export default function HomeApp({ onNavigate }) {
  /* ---- 实时时钟 ---- */
  const [clock, setClock] = useState('--:--:--')
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 星期${WEEK[d.getDay()]} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      )
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  /* ---- KPI ---- */
  const [kpis, setKpis] = useState({ task: '-', alarm: '-', amr: '-', running: '-' })
  const [kpiLoading, setKpiLoading] = useState(true)
  const [kpiError, setKpiError] = useState(false)

  async function loadKpis() {
    setKpiLoading(true)
    setKpiError(false)
    try {
      const range = todayRange()
      const [rep, alarm] = await Promise.all([
        getDailyTaskReport({ start_date: range.start, end_date: range.end }),
        getAlarmHistory({ begin_date: range.start, end_date: range.end, page: 1, pageSize: 1 })
      ])
      const dist = rep.data?.statusDistribution || []
      setKpis({
        task: sumStatus(dist, ['0', '1', '2', '5', '9']),
        running: sumStatus(dist, ['1', '2']),
        amr: (rep.data?.carrierStats || []).length,
        alarm: alarm.total ?? '-'
      })
    } catch (e) {
      setKpis({ task: '-', alarm: '-', amr: '-', running: '-' })
      setKpiError(true)
    }
    setKpiLoading(false)
  }
  useEffect(() => { loadKpis() }, [])

  /* ---- 手动任务链接 ---- */
  const [manualTaskUrl, setManualTaskUrl] = useState(
    (localStorage.getItem(STORAGE_KEY) || '').trim()
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const manualUrlRef = useRef(manualTaskUrl)
  manualUrlRef.current = manualTaskUrl

  async function loadManualTaskUrl() {
    try {
      const res = await getManualTaskUrl()
      if (res && res.url) {
        setManualTaskUrl(res.url)
        localStorage.setItem(STORAGE_KEY, res.url)
      }
    } catch (e) {
      console.warn('[手动任务] 服务端链接拉取失败，使用本地缓存：', e.message)
    }
  }
  useEffect(() => { loadManualTaskUrl() }, [])

  function openManualTask() {
    const url = (manualUrlRef.current || '').trim()
    if (!url) {
      setSettingsOpen(true)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function saveManualTaskUrl() {
    const url = normalizeUrl(manualUrlRef.current)
    setManualTaskUrl(url)
    localStorage.setItem(STORAGE_KEY, url) // 离线兜底
    try {
      await saveManualTaskUrlApi(url)
    } catch (e) {
      console.warn('[手动任务] 链接保存至服务端失败，已存本地：', e.message)
    }
    setSettingsOpen(false)
  }

  const go = (name) => () => onNavigate?.(name)

  return (
    <div className="ui-root hm-root">
      {/* ============ 顶部：快捷入口 + 今日指标（统一白底卡片，无渐变蓝块） ============ */}
      <section className="hm-top">
        <div className="hm-topbar">
          {/* 轻量 Tab：默认灰字白底，hover/聚焦时主蓝字 + 底部 2px 蓝线 */}
          <div className="hm-tabs">
            <button className="hm-tab" type="button" onClick={go('dashboard')}>
              <Icon name="gauge" size={16} /> 数据看板
            </button>
            <button className="hm-tab" type="button" onClick={go('report')}>
              <Icon name="bar-chart" size={16} /> 今日任务报表
            </button>
          </div>
          <div className="hm-clock">
            <Icon name="clock" size={13} />
            <span>{clock}</span>
          </div>
        </div>

        <div className="hm-kpis">
          <Kpi label="今日任务" value={kpis.task} icon="list" accent="#1565c0" loading={kpiLoading} />
          <Kpi label="今日告警" value={kpis.alarm} icon="bell" accent="#d32f2f" loading={kpiLoading} />
          <Kpi label="活跃车辆" value={kpis.amr} icon="truck" accent="#2e7d32" loading={kpiLoading} />
          <Kpi label="执行中任务" value={kpis.running} icon="play" accent="#ef6c00" loading={kpiLoading} />
        </div>

        {kpiError && (
          <div className="hm-top__error">
            <Icon name="alert-circle" size={15} />
            <span>数据库连接异常，数据不可用</span>
            <Button variant="ghost" size="sm" onClick={go('db')}>重新配置</Button>
            <Button variant="ghost" size="sm" onClick={loadKpis}>重试</Button>
          </div>
        )}
      </section>

      {/* ============ 功能模块 ============ */}
      <div className="hm-cap">功能模块</div>
      <div className="hm-grid">
        {FUNCS.map((f) => {
          const tone = TONES[f.tone] || TONES.blue
          return (
          <div key={f.title} className="hm-card"
            style={{ '--card-solid': tone.solid, '--card-soft': tone.soft, '--card-glow': tone.glow }}
            role={f.type === 'dual' || f.type === 'task' ? undefined : 'button'}
            tabIndex={f.type === 'dual' || f.type === 'task' ? -1 : 0}
            onClick={f.type === 'dual' || f.type === 'task' ? undefined : go(f.name)}
            onKeyDown={f.type === 'dual' || f.type === 'task' ? undefined : (e) => e.key === 'Enter' && go(f.name)()}
          >
            <div className="hm-card__head">
              <span className="hm-card__icon"><Icon name={f.icon} size={24} /></span>
              <div className="hm-card__headtext">
                <span className="hm-card__title">{f.title}</span>
                <span className="hm-card__desc">{f.desc}</span>
              </div>
            </div>

            {/* 双入口（站点/货架）：主名 + 特征两行，Grid 对齐铁律 */}
            {f.type === 'dual' && (
              <div className="hm-card__entries hm-card__entries--dual">
                {[f.a, f.b].map((it) => (
                  <button key={it.name} className="hm-entry" type="button"
                    onClick={(e) => { e.stopPropagation(); go(it.name)() }}>
                    <span className="hm-entry__icon"><Icon name={it.icon} size={17} /></span>
                    <span className="hm-entry__text">
                      <span className="hm-entry__main">{it.title}</span>
                      {it.sub && <span className="hm-entry__sub">{it.sub}</span>}
                    </span>
                    <Icon name="chevron-right" size={15} className="hm-entry__arrow" />
                  </button>
                ))}
              </div>
            )}

            {/* 三入口（任务/告警） */}
            {f.type === 'task' && (
              <div className="hm-card__entries hm-card__entries--triple">
                {f.items.map((it) => (
                  <div key={it.title}
                    className={'hm-entry hm-entry--flat' + (it.tone === 'danger' ? ' hm-entry--danger' : '')}
                    role="button" tabIndex={0}
                    onClick={it.kind === 'manual' ? openManualTask : go(it.name)}
                    onKeyDown={(e) => e.key === 'Enter' && (it.kind === 'manual' ? openManualTask() : go(it.name)())}
                  >
                    <span className="hm-entry__icon"><Icon name={it.icon} size={17} /></span>
                    <span className="hm-entry__text hm-entry__text--row">{it.title}</span>
                    {it.kind === 'manual' && (
                      <button className="hm-gear" type="button" title="设置任务链接地址"
                        onClick={(e) => { e.stopPropagation(); setSettingsOpen(true) }}>
                        <Icon name="settings" size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>

      {/* ============ 手动任务链接设置弹窗 ============ */}
      {settingsOpen && (
        <Modal title="手动任务链接设置" icon="link" width="440px" fit onClose={() => setSettingsOpen(false)}>
          <div className="hm-mtset">
            <p className="hm-mtset__tip">
              设置手动任务页面网址，保存后存入后端本地文件（多端共用、重启不丢），
              本机浏览器缓存作离线兜底。点击首页「手动任务」自动在新标签页打开；
              未设置时点击会打开此窗口。
            </p>
            <label className="hm-mtset__label">任务页面链接地址</label>
            <textarea
              className="hm-mtset__input"
              rows={4}
              placeholder="http://192.168.x.x/...  例如内网任务系统地址"
              value={manualTaskUrl}
              onChange={(e) => setManualTaskUrl(e.target.value)}
              onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') saveManualTaskUrl() }}
            />
            <div className="hm-mtset__actions">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>取消</Button>
              <Button variant="primary" onClick={saveManualTaskUrl}>保存</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* Spinner 被 Button 内部使用；此处导出避免未使用告警 */
export { Spinner }
