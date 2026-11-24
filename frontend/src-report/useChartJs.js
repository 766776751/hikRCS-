/**
 * src-report/useChartJs.js — React wrapper for Chart.js
 * Rebuilds chart when deps change; destroys on unmount (parity w/ Vue useChart).
 * Config helpers (baseChartOpts/legendOpts/gridScaleOpts/noDataPlugin) are pure
 * and reused from src/components/charts/useChart.js.
 */
import { useEffect, useRef } from 'react'
// 'chart.js/auto' auto-registers all controllers (doughnut/bar/line...) —
// plain `import { Chart } from 'chart.js'` is tree-shaken and throws
// "doughnut is not a registered controller" in prod builds.
import Chart from 'chart.js/auto'
import { noDataPlugin } from '../src/components/charts/useChart'

Chart.register(noDataPlugin)

export { baseChartOpts, gridScaleOpts, legendOpts } from '../src/components/charts/useChart'

export function useChartJs(buildConfig, deps) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = new Chart(el, buildConfig())
    return () => chart.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
