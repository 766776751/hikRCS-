/**
 * components/charts/useChart.js — pure Chart.js config helpers + no-data plugin.
 * (Vue useChart lifecycle wrapper removed; React uses src-report/useChartJs.)
 */
import { Chart } from 'chart.js'

// Draw "no data" when every dataset is empty/zero
export const noDataPlugin = {
  id: 'noData',
  afterDraw(chart) {
    const datasets = (chart.data && chart.data.datasets) || []
    const has = datasets.some((ds) => (ds.data || []).some((v) => Number(v) > 0))
    if (has) return
    const { ctx, width, height } = chart
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#94a3b8'
    ctx.font = '13px Inter, "Microsoft YaHei", sans-serif'
    ctx.fillText('暂无数据', width / 2, height / 2)
    ctx.restore()
  }
}
Chart.register(noDataPlugin)

export function baseChartOpts(extra = {}) {
  return { responsive: true, maintainAspectRatio: false, ...extra }
}

export function legendOpts(position = 'bottom') {
  return {
    position,
    labels: {
      boxWidth: 10,
      boxHeight: 10,
      usePointStyle: true,
      pointStyle: 'circle',
      font: { size: 11, family: 'Inter, "Microsoft YaHei", sans-serif' },
      color: '#64748b',
      padding: 14
    }
  }
}

export function gridScaleOpts() {
  return {
    grid: { color: 'rgba(148, 163, 184, 0.16)' },
    border: { display: false },
    ticks: { color: '#94a3b8', font: { size: 11 } }
  }
}
