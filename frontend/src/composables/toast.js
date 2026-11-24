/**
 * composables/toast.js — framework-agnostic toast store (pub/sub, no Vue).
 * Host UI subscribes via subscribeToast().
 */

const listeners = new Set()
let seq = 0

export const toastState = { items: [] }

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribeToast(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function toast(msg, type = 'info') {
  const t = { id: ++seq, msg, type, out: false }
  toastState.items.push(t)
  emit()
  setTimeout(() => {
    t.out = true
    emit()
    setTimeout(() => {
      const i = toastState.items.indexOf(t)
      if (i > -1) toastState.items.splice(i, 1)
      emit()
    }, 320)
  }, 2200)
}

toast.success = (m) => toast(m, 'success')
toast.error = (m) => toast(m, 'error')
toast.info = (m) => toast(m, 'info')
