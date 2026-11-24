/**
 * src-ui/components/Modal.jsx — 统一弹窗（DESIGN-SPEC 7.5）
 *
 * 特性：Teleport 到 body（createPortal）、fit 按内容收缩（用户钦定）、
 * Esc / 点遮罩关闭、入场 back-out 弹性动画。
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

export default function Modal({ title, icon = '', width = '', fit = false, onClose, children }) {
  // Esc 关闭
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const style = width ? { maxWidth: width } : undefined
  const cls = ['ui-modal']
  if (fit) cls.push('ui-modal--fit')

  return createPortal(
    <div className="ui-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={cls.join(' ')} style={style} role="dialog" aria-modal="true">
        <div className="ui-modal-head">
          <div className="ui-modal-title">
            {icon ? <Icon name={icon} size={17} style={{ color: 'var(--ui-brand-500)' }} /> : null}
            {title}
          </div>
          <button className="ui-modal-close" title="关闭" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
