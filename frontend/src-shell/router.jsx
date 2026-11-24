/**
 * src-shell/router.jsx — minimal hash router (replaces vue-router)
 * Hash routes: #/name. Mobile redirect: home -> site (parity w/ beforeEach).
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export const ROUTES = [
  { name: 'home', path: '/', title: '海康机器人RCS工具拓展平台' },
  { name: 'site', path: '/site', title: '站点监控（叉车或潜伏车）', icon: 'map-pin', desc: '站点状态 · 载具状态 · 地图分布（叉车 / 潜伏车）' },
  { name: 'rack', path: '/rack', title: '货架监控（堆高车或CTU）', icon: 'box', desc: '货位状态 · 列聚合 · 任务查询（堆高车 / CTU）', wide: true },
  { name: 'boxcode', path: '/boxcode', title: '料箱码/托盘码管理', icon: 'package', desc: '码值生成 · 增减管理 · 规则设置 · 导出打印', wide: true },
  { name: 'task', path: '/task', title: '任务查询', icon: 'list', desc: 'AGV 任务记录 · 多条件筛选' },
  { name: 'cancel', path: '/cancel', title: '任务取消', icon: 'x-circle', desc: '批量/单个取消未执行或执行中任务' },
  { name: 'alarm', path: '/alarm', title: '告警查询', icon: 'bell', desc: '告警历史 · 等级筛选 · 导出' },
  { name: 'report', path: '/report', title: '今日任务报表', icon: 'bar-chart', desc: '任务状态 · 地图分布 · 逐时趋势' },
  { name: 'dashboard', path: '/dashboard', title: '数据看板', icon: 'gauge', desc: '任务量 / 完成率 / 告警分布 / 车辆产出排行', wide: true },
  { name: 'config', path: '/config', title: '配置告警推送', icon: 'send', desc: '企微 / 钉钉 / 飞书 / 公众号 Webhook 配置', width: '900px' },
  { name: 'pushlog', path: '/pushlog', title: '推送告警日志', icon: 'file', desc: '推送时间 / 耗时 / 状态 / 失败原因' },
  { name: 'db', path: '/db', title: '数据库连接配置', icon: 'database', desc: '连接 RCS PostgreSQL 数据库', width: '560px' }
]

export const MOBILE_TABS = ['site', 'task', 'cancel', 'alarm', 'report']

const byName = (n) => ROUTES.find((r) => r.name === n)
const isMobileNow = () => window.innerWidth < 768

function parseHash() {
  const h = (location.hash || '').replace(/^#/, '') || '/'
  const hit = ROUTES.find((r) => r.path === h)
  return hit ? hit.name : 'home'
}

const Ctx = createContext(null)

export function RouterProvider({ children }) {
  const [name, setName] = useState(() => {
    const n = parseHash()
    return n === 'home' && isMobileNow() ? 'site' : n
  })

  useEffect(() => {
    const onHash = () => {
      const n = parseHash()
      if (n === 'home' && isMobileNow()) {
        location.hash = '#/site' // redirect (fires hashchange again)
        return
      }
      setName(n)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((to, replace = false) => {
    let target = to
    if (target === 'home' && isMobileNow()) target = 'site'
    const path = (byName(target) || byName('home')).path
    const hash = '#' + path
    if (location.hash === hash) return
    if (replace) {
      history.replaceState(null, '', hash)
      setName(target)
    } else {
      location.hash = hash // hashchange updates state
    }
  }, [])

  return <Ctx.Provider value={{ name, meta: byName(name) || {}, navigate }}>{children}</Ctx.Provider>
}

export function useRouter() {
  return useContext(Ctx)
}
