/**
 * src-shell/hosts.jsx — global toast + confirm dialog hosts.
 * Render from the pub/sub stores in src/composables/{toast,confirm}.js.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toastState, subscribeToast } from '../src/composables/toast'
import { confirmState, subscribeConfirm, resolveConfirm } from '../src/composables/confirm'
import Icon from '../src-ui/components/Icon'

const TOAST_ICON = { success: 'check-circle', error: 'alert-circle', info: 'info' }
const CONFIRM_ICON = { warn: 'warning', danger: 'warning', info: 'info', success: 'check-circle' }

function useSubscribed(subscribe) {
  const [, tick] = useState(0)
  useEffect(() => subscribe(() => tick((v) => v + 1)), [subscribe])
}

export function ToastHost() {
  useSubscribed(subscribeToast)
  return createPortal(
    <div className="toast-host">
      {toastState.items.map((t) => (
        <div key={t.id} className={'toast ' + t.type + (t.out ? ' out' : '')}>
          <Icon name={TOAST_ICON[t.type] || 'info'} size={15} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body
  )
}

export function ConfirmHost() {
  useSubscribed(subscribeConfirm)
  if (!confirmState.open) return null
  return createPortal(
    <div className="dlg-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) resolveConfirm(false) }}>
      <div className="dlg">
        <div className={'dlg-icon ' + confirmState.type}>
          <Icon name={CONFIRM_ICON[confirmState.type] || 'info'} size={20} />
        </div>
        <div className="dlg-title">{confirmState.title}</div>
        <div className="dlg-msg">
          {confirmState.message}
          {confirmState.detail && <span className="dlg-detail">{confirmState.detail}</span>}
        </div>
        <div className="dlg-btns">
          {!confirmState.hideCancel && (
            <button className="btn btn-ghost" onClick={() => resolveConfirm(false)}>{confirmState.cancelText}</button>
          )}
          <button className={'btn ' + (confirmState.type === 'danger' ? 'btn-danger' : 'btn-primary')}
            onClick={() => resolveConfirm(true)}>
            {confirmState.okText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
