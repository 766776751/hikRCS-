import { useEffect, useState } from 'react'

/**
 * 监听 CSS 媒体查询（响应式断点）
 * @param {string} query 媒体查询字符串，如 '(max-width: 640px)'
 * @returns {boolean} 当前是否命中
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  )

  useEffect(() => {
    if (!window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)

    setMatches(mql.matches)
    // Safari < 14 仅支持 addListener
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
