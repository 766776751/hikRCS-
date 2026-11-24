/**
 * src-shell/App.jsx — app root: bootstrap db-config check + layout switch.
 * Page registry lazy-loads the React page components directly (no bridges).
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { RouterProvider, useRouter } from './router'
import { ToastHost, ConfirmHost } from './hosts'
import { initStore, store } from '../src/stores/app'
import Icon from '../src-ui/components/Icon'
import './shell.css'

// Lazy page registry (element components live in src-* dirs)
const PAGES = {
  home: { Comp: lazy(() => import('../src-home/HomeApp')), props: (nav) => ({ onNavigate: nav }) },
  site: { Comp: lazy(() => import('../src-site/SiteMonitorApp')), props: (nav) => ({ onNavigateToDb: () => nav('db', true) }) },
  rack: { Comp: lazy(() => import('../src-rack/RackApp')), props: () => ({}) },
  boxcode: { Comp: lazy(() => import('../src-boxcode/BoxCodeApp')), props: () => ({}) },
  task: { Comp: lazy(() => import('../src-task/TaskQueryApp')), props: () => ({}) },
  cancel: { Comp: lazy(() => import('../src-task/TaskCancelApp')), props: () => ({}) },
  alarm: { Comp: lazy(() => import('../src-alarm/AlarmQueryApp')), props: () => ({}) },
  report: { Comp: lazy(() => import('../src-report/DailyReportApp')), props: () => ({}) },
  dashboard: { Comp: lazy(() => import('../src-report/DashboardApp')), props: () => ({}) },
  config: { Comp: lazy(() => import('../src-alarm/PushConfigApp')), props: () => ({}) },
  pushlog: { Comp: lazy(() => import('../src-alarm/PushLogApp')), props: () => ({}) },
  db: { Comp: lazy(() => import('../src-db/DbApp')), props: (nav) => ({ onNavigate: nav }) }
}

export function PageOutlet() {
  const { name, navigate } = useRouter()
  const page = PAGES[name] || PAGES.home
  const Comp = page.Comp
  return (
    <Suspense fallback={<div className="page-loading">加载中…</div>}>
      <Comp {...page.props(navigate)} />
    </Suspense>
  )
}

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const fn = (e) => setM(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return m
}

function Shell() {
  const isMobile = useIsMobile()
  const { navigate } = useRouter()

  useEffect(() => {
    // bootstrap: db not configured -> force db page (parity w/ App.vue)
    initStore().then(() => {
      if (!store.configured) navigate('db', true)
    })
  }, [])

  return (
    <>
      {isMobile ? <MobileShell /> : <DesktopShell />}
      <ToastHost />
      <ConfirmHost />
    </>
  )
}

function DesktopShell() {
  const { name, meta, navigate } = useRouter()
  const isModule = !!name && name !== 'home'
  const modalWidth = meta.width || (meta.wide ? '1800px' : '1500px')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isModule) navigate('home') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isModule, navigate])

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* 与 app-main 同宽同内边距，标题与下方内容左边缘对齐（参考料箱码页 header-content） */}
        <div className="hd-inner">
          <div className="hd-left">
            <img src="/favicon.ico" className="hd-logo" alt="logo" />
            <div className="hd-text">
              <div className="hd-title">海康机器人RCS工具拓展平台</div>
              <div className="hd-sub">AGV 调度 · 任务管理 · 告警推送 一体化运维控制台</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm hd-db-btn" onClick={() => navigate('db')}>
            <Icon name="database" size={14} /> 数据库配置
          </button>
        </div>
      </header>

      <main className="app-main">
        {name === 'home' && <PageOutlet />}
      </main>

      {isModule && (
        <div className="mask" onMouseDown={(e) => { if (e.target === e.currentTarget) navigate('home') }}>
          <div className="box" style={{ maxWidth: modalWidth, maxHeight: '86vh' }}>
            <div className="box-head">
              <div className="box-title">
                {meta.icon && <Icon name={meta.icon} size={17} style={{ color: 'var(--brand-500)' }} />}
                {meta.title}
              </div>
              <button className="box-close" title="关闭" onClick={() => navigate('home')}>
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="box-body">
              <PageOutlet />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { name: 'site', label: '站点', icon: 'map-pin' },
  { name: 'task', label: '任务', icon: 'list' },
  { name: 'cancel', label: '取消', icon: 'x-circle' },
  { name: 'alarm', label: '告警', icon: 'bell' },
  { name: 'report', label: '报表', icon: 'bar-chart' }
]
const MORE = [
  { name: 'dashboard', label: '数据看板', icon: 'gauge' },
  { name: 'rack', label: '货架监控（堆高车或CTU）', icon: 'box' },
  { name: 'boxcode', label: '料箱码/托盘码管理', icon: 'package' },
  { name: 'config', label: '推送配置', icon: 'send' },
  { name: 'pushlog', label: '推送日志', icon: 'file' },
  { name: 'db', label: '数据库配置', icon: 'database' }
]

function MobileShell() {
  const { name, meta, navigate } = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const isTab = TABS.some((t) => t.name === name)
  const title = meta?.title || 'RCS工具拓展'

  function goBack() {
    if (window.history.length > 1) history.back()
    else navigate('site', true)
  }

  return (
    <div className="m-shell">
      <header className="m-header">
        {!isTab && (
          <button className="m-back" title="返回" onClick={goBack}>
            <Icon name="arrow-left" size={18} />
          </button>
        )}
        <div className="m-title-wrap">
          <div className="m-title">{title}</div>
          <div className="m-tag">移动端 · 海康机器人RCS拓展工具</div>
        </div>
        <button className="m-more" title="更多" onClick={() => setMoreOpen(true)}>
          <Icon name="more" size={18} />
        </button>
      </header>

      <main className="m-main" key={name}>
        <PageOutlet />
      </main>

      <nav className="m-nav">
        {TABS.map((t) => (
          <button key={t.name} className={'m-nav-item' + (name === t.name ? ' active' : '')}
            onClick={() => navigate(t.name)}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {moreOpen && createPortal(
        <>
          <div className="picker-sheet-mask" onClick={() => setMoreOpen(false)} />
          <div className="m-more-sheet">
            <div className="picker-head">
              <span>更多功能</span>
              <button type="button" onClick={() => setMoreOpen(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className="m-more-list">
              {MORE.map((it) => (
                <button key={it.name} className="m-more-item"
                  onClick={() => { setMoreOpen(false); navigate(it.name) }}>
                  <Icon name={it.icon} size={18} />
                  <span>{it.label}</span>
                  <Icon name="chevron-right" size={15} className="m-more-arrow" />
                </button>
              ))}
              <a className="m-more-item" href="/mobile-tutorial.html" target="_blank" rel="noreferrer">
                <Icon name="info" size={18} />
                <span>使用指南</span>
                <Icon name="chevron-right" size={15} className="m-more-arrow" />
              </a>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  )
}
