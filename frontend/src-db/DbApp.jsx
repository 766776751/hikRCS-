/**
 * src-db/DbApp.jsx — database connection config (parity w/ DbLoginView.vue)
 * Prefills saved params from shared store (password never echoed; empty = keep old).
 */
import { useEffect, useState } from 'react'
import '../src-ui/base.css'
import './db.css'
import { getDbConfig, saveDbConfig, testDbConfig } from '../src/api/admin'
import { setConfigured, store } from '../src/stores/app'
import { toast } from '../src/composables/toast'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import { useIsMobile } from '../src-task/controls'

export default function DbApp({ onNavigate }) {
  const isMobile = useIsMobile()
  const [form, setForm] = useState({ host: '', port: '5432', database: '', user: '', password: '' })
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    // prefill saved params (never echo password)
    if (store.dbInfo) {
      setForm((s) => ({
        ...s,
        host: store.dbInfo.host || '',
        port: String(store.dbInfo.port || '5432'),
        database: store.dbInfo.database || '',
        user: store.dbInfo.user || ''
      }))
    }
  }, [])

  async function test() {
    setTesting(true)
    setMsg({ type: '', text: '' })
    try {
      const j = await testDbConfig({ ...form })
      setMsg({ type: 'ok', text: j.message || '数据库连接成功！' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '连接失败' })
    }
    setTesting(false)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      const body = { ...form }
      if (!body.password) delete body.password // empty = keep saved password
      const j = await saveDbConfig(body)
      setConfigured({ host: form.host, port: form.port, database: form.database, user: form.user })
      setMsg({ type: 'ok', text: j.message || '数据库配置已保存并生效' })
      toast.success('数据库连接成功')
      setTimeout(() => onNavigate?.(isMobile ? 'site' : 'home'), 600)
    } catch (err) {
      setMsg({ type: 'err', text: err.message || '保存失败' })
    }
    setSaving(false)
  }

  return (
    <div className="db-login in-modal">
      <div className="dl-icon"><Icon name="database" size={28} /></div>
      <h2 className="dl-title">数据库连接配置</h2>
      <p className="dl-sub">连接 RCS PostgreSQL 数据库后即可使用全部功能</p>

      <form className="dl-form" onSubmit={save}>
        <div className="field">
          <label>主机地址</label>
          <input className="ipt" value={form.host} onChange={set('host')} placeholder="例如 192.168.1.100" autoComplete="off" />
        </div>
        <div className="dl-row">
          <div className="field">
            <label>端口</label>
            <input className="ipt" value={form.port} onChange={set('port')} placeholder="5432" autoComplete="off" />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>数据库名</label>
            <input className="ipt" value={form.database} onChange={set('database')} placeholder="cms_web" autoComplete="off" />
          </div>
        </div>
        <div className="field">
          <label>用户名</label>
          <input className="ipt" value={form.user} onChange={set('user')} placeholder="数据库用户名" autoComplete="off" />
        </div>
        <div className="field">
          <label>密码</label>
          <input className="ipt" type="password" value={form.password} onChange={set('password')}
            placeholder="留空则沿用已保存的密码" autoComplete="new-password" />
        </div>

        {msg.text && (
          <div className={'dl-msg ' + (msg.type === 'ok' ? 'ok' : 'err')}>
            <Icon name={msg.type === 'ok' ? 'check-circle' : 'alert-circle'} size={15} />
            <span>{msg.text}</span>
          </div>
        )}

        <div className="dl-actions">
          <Button variant="ghost" icon="zap" disabled={testing || saving} loading={testing} onClick={test}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <button type="submit" className="btn btn-primary" disabled={testing || saving}>
            <Icon name="save" size={14} /> {saving ? '保存中…' : '保存并连接'}
          </button>
        </div>
      </form>
    </div>
  )
}
