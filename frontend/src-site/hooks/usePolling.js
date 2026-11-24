import { useEffect, useRef } from 'react'

/**
 * 定时轮询。回调变化不会重启计时器（始终用 ref 取最新回调）。
 * @param {Function} fn      每次触发执行的函数
 * @param {number}   interval 间隔毫秒
 * @param {boolean}  enabled  是否启用
 */
export function usePolling(fn, interval, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled || !interval) return
    const timer = setInterval(() => fnRef.current(), interval)
    return () => clearInterval(timer)
  }, [interval, enabled])
}
