/**
 * composables/confirm.js — framework-agnostic confirm/alert dialog store.
 * confirmDialog() returns a Promise; host UI subscribes via subscribeConfirm().
 */

export const confirmState = {
  open: false,
  title: '',
  message: '',
  detail: '',
  type: 'warn',
  okText: '确定',
  cancelText: '取消',
  hideCancel: false
}

let resolver = null
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribeConfirm(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    confirmState.open = true
    confirmState.title = opts.title || '确认操作'
    confirmState.message = opts.message || ''
    confirmState.detail = opts.detail || ''
    confirmState.type = opts.type || 'warn'
    confirmState.okText = opts.okText || '确定'
    confirmState.cancelText = opts.cancelText || '取消'
    confirmState.hideCancel = !!opts.hideCancel
    resolver = resolve
    emit()
  })
}

export function alertDialog(message, opts = {}) {
  return confirmDialog({
    title: opts.title || '提示',
    message,
    detail: opts.detail || '',
    type: opts.type || 'info',
    okText: opts.okText || '知道了',
    hideCancel: true
  })
}

export function resolveConfirm(v) {
  confirmState.open = false
  emit()
  if (resolver) {
    resolver(v)
    resolver = null
  }
}
