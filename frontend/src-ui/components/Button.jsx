/**
 * src-ui/components/Button.jsx — 统一按钮（DESIGN-SPEC 第三章）
 *
 * variant: primary | secondary | ghost | glow | gradient | push | glass
 * size:    '' | 'sm'
 * 全部自带四态（hover/active/focus-visible/disabled），样式见 base.css。
 */
import Icon from './Icon'

export default function Button({
  variant = 'secondary',
  size = '',
  icon = null,
  iconSize = 15,
  loading = false,
  children,
  className = '',
  ...rest
}) {
  const cls = ['ui-btn', `ui-btn--${variant}`]
  if (size) cls.push(`ui-btn--${size}`)
  if (className) cls.push(className)
  return (
    <button type="button" className={cls.join(' ')} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
    </button>
  )
}

/** 行内加载圈（SPEC 5.2 spinner-14） */
export function Spinner({ size = 14 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,.35)',
        borderTopColor: '#fff',
        display: 'inline-block',
        animation: 'ui-spin .8s linear infinite'
      }}
      aria-hidden="true"
    />
  )
}
