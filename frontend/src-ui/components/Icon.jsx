/**
 * src-ui/components/Icon.jsx — React 图标组件
 *
 * 图标数据直接复用 Vue 侧 icons.js（纯 JS 数据，无框架依赖），避免双份维护。
 * 图标尺寸规则（DESIGN-SPEC 第二章铁律 2）：必须以具体 px（width/height 属性）
 * 传入，禁止 em/1em 之类的相对尺寸——那是历史图标失控的根因。
 */
import { ICONS } from '../../src/components/icons'

export default function Icon({ name, size = 16, className = '', style }) {
  const html = ICONS[name] || ''
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
