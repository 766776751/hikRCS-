/**
 * src-alarm/PushConfigApp.jsx — webhook push config (parity w/ PushConfigView.vue)
 * Modals use global .mask/.box classes (loaded by Vue shell) via createPortal.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import '../src-ui/base.css'
import './alarm.css'
import { getPushConfig, insertTestAlarm, savePushConfig } from '../src/api/admin'
import { alertDialog, confirmDialog } from '../src/composables/confirm'
import { toast } from '../src/composables/toast'
import Icon from '../src-ui/components/Icon'
import Button from '../src-ui/components/Button'
import { InputClear } from '../src-task/controls'

const PLATFORMS = [
  { key: 'wecom', name: '企业微信', icon: 'link', urlKey: 'webhookUrls', enableKey: 'pushEnabled', hue: '#2563eb' },
  { key: 'dingtalk', name: '钉钉', icon: 'send', urlKey: 'dingtalkWebhookUrls', enableKey: 'dingtalkPushEnabled', hue: '#06b6d4' },
  { key: 'feishu', name: '飞书', icon: 'zap', urlKey: 'feishuWebhookUrls', enableKey: 'feishuPushEnabled', hue: '#8b5cf6' },
  { key: 'wechatOa', name: '微信公众号', icon: 'users', enableKey: 'wechatOaEnabled', hue: '#10b981' }
]
const LEVELS = [
  { value: 1, label: '低' },
  { value: 2, label: '中' },
  { value: 3, label: '严重' }
]
const WEBHOOK_HELP = 'https://www.wangsu.com/document/3130/webhook'
// 钉钉推送正文开头强制插入的关键词，必须与钉钉群机器人安全设置里的「自定义关键词」一致
const DINGTALK_KEYWORD = '告警'

const EMPTY_CFG = {
  projectName: '', pushEnabled: false, dingtalkPushEnabled: false, feishuPushEnabled: false,
  wechatOaEnabled: false, pushLevels: [], webhookUrls: [], dingtalkWebhookUrls: [],
  feishuWebhookUrls: [], wechatOaAppId: '', wechatOaAppSecret: '', wechatOaTemplateId: '',
  wechatOaOpenIds: []
}

export default function PushConfigApp() {
  const [cfg, setCfg] = useState(EMPTY_CFG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // edit dialog: platform key | null; urls for webhook platforms, oaForm for wechat OA
  const [editPlatform, setEditPlatform] = useState(null)
  const [editUrls, setEditUrls] = useState([])
  const [oaForm, setOaForm] = useState({ appId: '', appSecret: '', templateId: '', openIds: '' })

  useEffect(() => {
    ;(async () => {
      try {
        const j = await getPushConfig()
        const d = j.data || {}
        setCfg({
          projectName: d.projectName || '',
          pushEnabled: !!d.pushEnabled,
          dingtalkPushEnabled: !!d.dingtalkPushEnabled,
          feishuPushEnabled: !!d.feishuPushEnabled,
          wechatOaEnabled: !!d.wechatOaEnabled,
          pushLevels: Array.isArray(d.pushLevels) ? d.pushLevels.map(Number) : [],
          webhookUrls: Array.isArray(d.webhookUrls) ? d.webhookUrls : [],
          dingtalkWebhookUrls: Array.isArray(d.dingtalkWebhookUrls) ? d.dingtalkWebhookUrls : [],
          feishuWebhookUrls: Array.isArray(d.feishuWebhookUrls) ? d.feishuWebhookUrls : [],
          wechatOaAppId: d.wechatOaAppId || '',
          wechatOaAppSecret: d.wechatOaAppSecret || '',
          wechatOaTemplateId: d.wechatOaTemplateId || '',
          wechatOaOpenIds: Array.isArray(d.wechatOaOpenIds) ? d.wechatOaOpenIds : []
        })
      } catch (e) {
        toast.error(e.message || '配置加载失败')
      }
      setLoading(false)
    })()
  }, [])

  const toggleLevel = (n) =>
    setCfg((s) => ({
      ...s,
      pushLevels: s.pushLevels.includes(n) ? s.pushLevels.filter((x) => x !== n) : [...s.pushLevels, n]
    }))

  const platformDesc = (p) =>
    p.key === 'wechatOa'
      ? `${cfg.wechatOaOpenIds.length} 个 OpenID`
      : `${(cfg[p.urlKey] || []).length} 个 Webhook`

  function openEdit(p) {
    setEditPlatform(p.key)
    if (p.key === 'wechatOa') {
      setOaForm({
        appId: cfg.wechatOaAppId,
        appSecret: cfg.wechatOaAppSecret,
        templateId: cfg.wechatOaTemplateId,
        openIds: cfg.wechatOaOpenIds.join('\n')
      })
    } else {
      setEditUrls([...(cfg[p.urlKey] || [])])
    }
  }

  function saveEdit() {
    const p = PLATFORMS.find((x) => x.key === editPlatform)
    if (!p) return
    if (p.key === 'wechatOa') {
      setCfg((s) => ({
        ...s,
        wechatOaAppId: oaForm.appId.trim(),
        wechatOaAppSecret: oaForm.appSecret.trim(),
        wechatOaTemplateId: oaForm.templateId.trim(),
        wechatOaOpenIds: oaForm.openIds.split('\n').map((x) => x.trim()).filter(Boolean)
      }))
    } else {
      setCfg((s) => ({ ...s, [p.urlKey]: editUrls.map((x) => x.trim()).filter(Boolean) }))
    }
    setEditPlatform(null)
    toast.success('已保存到表单，点击「保存配置」生效')
  }

  async function save() {
    setSaving(true)
    try {
      const j = await savePushConfig({
        projectName: cfg.projectName,
        pushEnabled: cfg.pushEnabled,
        pushLevels: cfg.pushLevels,
        webhookUrls: cfg.webhookUrls,
        dingtalkPushEnabled: cfg.dingtalkPushEnabled,
        dingtalkWebhookUrls: cfg.dingtalkWebhookUrls,
        dingtalkKeyword: '告警',
        feishuPushEnabled: cfg.feishuPushEnabled,
        feishuWebhookUrls: cfg.feishuWebhookUrls,
        wechatOaEnabled: cfg.wechatOaEnabled,
        wechatOaAppId: cfg.wechatOaAppId,
        wechatOaAppSecret: cfg.wechatOaAppSecret,
        wechatOaTemplateId: cfg.wechatOaTemplateId,
        wechatOaOpenIds: cfg.wechatOaOpenIds
      })
      toast.success(j.message || '配置已保存')
    } catch (e) {
      toast.error(e.message || '保存失败')
    }
    setSaving(false)
  }

  async function testInsert() {
    const ok = await confirmDialog({
      title: '插入测试告警',
      message: '将向数据库插入一条随机类型的测试告警，并按当前配置触发推送，是否继续？',
      type: 'warn',
      okText: '插入并推送'
    })
    if (!ok) return
    try {
      const j = await insertTestAlarm()
      alertDialog(j.message || '测试告警已插入', { title: '测试告警', type: 'success' })
    } catch (e) {
      toast.error(e.message || '插入失败')
    }
  }

  async function pasteToRow(i) {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setEditUrls((s) => s.map((v, idx) => (idx === i ? text.trim() : v)))
    } catch (e) {
      toast.error('读取剪贴板失败，请手动粘贴')
    }
  }

  const editP = PLATFORMS.find((p) => p.key === editPlatform)

  return (
    <div>
      {loading ? (
        <div className="pc-loading">正在加载配置…</div>
      ) : (
        <>
          <div className="pc-grid">
            <div className="field">
              <label>项目名称</label>
              <InputClear value={cfg.projectName} onChange={(v) => setCfg((s) => ({ ...s, projectName: v }))} placeholder="项目名称" />
            </div>
            <div className="field">
              <label>推送等级（多选）</label>
              <div className="pc-levels">
                {LEVELS.map((l) => (
                  <button key={l.value} type="button"
                    className={'btn-chip' + (cfg.pushLevels.includes(l.value) ? ' active' : '')}
                    onClick={() => toggleLevel(l.value)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pc-platforms">
            {PLATFORMS.map((p) => {
              const on = !!cfg[p.enableKey]
              return (
                <section key={p.key} className="panel pc-tile">
                  <div className="pc-tile-icon" style={{ background: p.hue + '14', color: p.hue }}>
                    <Icon name={p.icon} size={21} />
                  </div>
                  <div className="pc-tile-main">
                    <div className="pc-tile-name">{p.name}</div>
                    <div className="pc-tile-desc">{platformDesc(p)}</div>
                  </div>
                  <button type="button" className={'switch' + (on ? ' on' : '')}
                    title={on ? '已开启' : '已关闭'}
                    onClick={() => setCfg((s) => ({ ...s, [p.enableKey]: !s[p.enableKey] }))} />
                  <Button variant="ghost" size="sm" icon="edit" onClick={() => openEdit(p)}>配置</Button>
                </section>
              )
            })}
          </div>

          <p className="pc-help">不会配置 Webhook 可以参考：<a href={WEBHOOK_HELP} target="_blank" rel="noreferrer">{WEBHOOK_HELP}</a></p>

          <div className="pc-actions">
            <Button variant="ghost" icon="zap" onClick={testInsert}>插入测试告警</Button>
            <Button variant="primary" icon="save" loading={saving} onClick={save}>保存配置</Button>
          </div>
        </>
      )}

      {/* webhook edit modal */}
      {editPlatform && editPlatform !== 'wechatOa' && createPortal(
        <div className="mask" style={{ zIndex: 3000 }} onClick={(e) => e.target === e.currentTarget && setEditPlatform(null)}>
          <div className="box" style={{ maxWidth: 640, maxHeight: '80vh' }}>
            <div className="box-head">
              <div className="box-title">{editP?.name} Webhook 配置</div>
              <button className="box-close" onClick={() => setEditPlatform(null)}><Icon name="close" size={15} /></button>
            </div>
            <div className="box-body">
              {editPlatform === 'dingtalk' && (
                <p className="pc-notice">
                  <strong>钉钉关键词提醒：</strong>系统推送时会在消息开头自动加上「{DINGTALK_KEYWORD}」。
                  请务必在钉钉群机器人的「安全设置 → 自定义关键词」里添加「{DINGTALK_KEYWORD}」，
                  否则即使 Webhook 正确也会推送失败（提示没有匹配到关键词）。
                </p>
              )}
              {editUrls.map((u, i) => (
                <div key={i} className="url-row">
                  <input className="ipt" value={u}
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    onChange={(e) => setEditUrls((s) => s.map((v, idx) => (idx === i ? e.target.value : v)))} />
                  <button className="btn btn-ghost btn-sm" title="粘贴" onClick={() => pasteToRow(i)}>
                    <Icon name="clipboard" size={14} />
                  </button>
                  <button className="btn btn-ghost btn-sm" title="删除"
                    onClick={() => setEditUrls((s) => s.filter((_, idx) => idx !== i))}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }}
                onClick={() => setEditUrls((s) => [...s, ''])}>
                <Icon name="plus" size={14} /> 添加 Webhook
              </button>
              <p className="pc-tip">支持配置多个 Webhook，推送时将依次发送到所有地址。</p>
              <p className="pc-help">不会配置 Webhook 可以参考：<a href={WEBHOOK_HELP} target="_blank" rel="noreferrer">{WEBHOOK_HELP}</a></p>
            </div>
            <div className="box-foot">
              <Button variant="ghost" onClick={() => setEditPlatform(null)}>取消</Button>
              <Button variant="primary" onClick={saveEdit}>确定</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* wechat OA modal */}
      {editPlatform === 'wechatOa' && createPortal(
        <div className="mask" style={{ zIndex: 3000 }} onClick={(e) => e.target === e.currentTarget && setEditPlatform(null)}>
          <div className="box" style={{ maxWidth: 560, maxHeight: '84vh' }}>
            <div className="box-head">
              <div className="box-title">微信公众号推送配置</div>
              <button className="box-close" onClick={() => setEditPlatform(null)}><Icon name="close" size={15} /></button>
            </div>
            <div className="box-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <label>AppID</label>
                <InputClear value={oaForm.appId} onChange={(v) => setOaForm((s) => ({ ...s, appId: v }))} placeholder="wx..." />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>AppSecret</label>
                <InputClear value={oaForm.appSecret} onChange={(v) => setOaForm((s) => ({ ...s, appSecret: v }))} placeholder="公众号密钥" />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>模板 ID</label>
                <InputClear value={oaForm.templateId} onChange={(v) => setOaForm((s) => ({ ...s, templateId: v }))} placeholder="消息模板 ID" />
              </div>
              <div className="field">
                <label>OpenID 列表（每行一个）</label>
                <textarea className="ipt" rows={5} placeholder="oXXXX...（每行一个）"
                  value={oaForm.openIds}
                  onChange={(e) => setOaForm((s) => ({ ...s, openIds: e.target.value }))} />
              </div>
            </div>
            <div className="box-foot">
              <Button variant="ghost" onClick={() => setEditPlatform(null)}>取消</Button>
              <Button variant="primary" onClick={saveEdit}>确定</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
