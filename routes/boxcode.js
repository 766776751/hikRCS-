/**
 * routes/boxcode.js — 料箱码 / 托盘码管理（自包含模块）
 * ----------------------------------------------------------------------------
 * Migrated from the standalone "3030 料箱码通用版" tool. Key changes:
 *   - Two independent code types (box / pallet), each with own prefix,
 *     suffix length, sequence and printed count.
 *   - Data persisted in a local JSON file (boxcode_data.json) next to server.js.
 *     NEVER writes to the customer's PostgreSQL business DB.
 *   - Fresh start: no legacy boxcodes.json import.
 * Mounted at /api/boxcode in server.js.
 */
const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')

const XLSX = (() => {
  try { return require('xlsx') } catch (e) { return null }
})()

const DATA_FILE = path.join(__dirname, '..', 'boxcode_data.json')
const PASSWORD = '123456'         // generate / reduce password
const ADMIN_PASSWORD = 'SC123456' // change-rule password

// code type definitions — each type owns a full independent rule set
const TYPES = {
  box: { key: 'box', label: '料箱码', prefix: '80', suffixLength: 5 },
  pallet: { key: 'pallet', label: '托盘码', prefix: '90', suffixLength: 5 }
}
const typeKeys = Object.keys(TYPES)
const isType = (t) => Object.prototype.hasOwnProperty.call(TYPES, t)

const freshTypeState = (def) => ({
  label: def.label,
  prefix: def.prefix,
  suffixLength: def.suffixLength,
  nextSequence: 1,
  printedCount: 0
})

function freshData() {
  const types = {}
  typeKeys.forEach((k) => { types[k] = freshTypeState(TYPES[k]) })
  return { types, codes: { box: [], pallet: [] }, operations: [] }
}

let data = freshData()

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      const base = freshData()
      // merge persisted types with defaults to stay forward-compatible
      typeKeys.forEach((k) => {
        if (raw.types && raw.types[k]) base.types[k] = Object.assign(base.types[k], raw.types[k])
      })
      base.codes = { box: (raw.codes && raw.codes.box) || [], pallet: (raw.codes && raw.codes.pallet) || [] }
      base.operations = raw.operations || []
      data = base
    }
  } catch (e) {
    console.error('[boxcode] 加载数据失败，使用空数据:', e.message)
    data = freshData()
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('[boxcode] 保存数据失败:', e.message)
  }
}

const stateOf = (t) => data.types[t]
const maxSeqOf = (t) => Math.pow(10, stateOf(t).suffixLength) - 1
const buildCode = (t, seq) => stateOf(t).prefix + String(seq).padStart(stateOf(t).suffixLength, '0')

const seqOf = (item) => (item && typeof item.sequence === 'number')
  ? item.sequence
  : parseInt(String(item.code || '').slice(-(stateOf(item.code_type).suffixLength)), 10) || 0

function addOperation(type, action, code, description) {
  data.operations.push({
    id: Date.now() + Math.random(),
    code_type: type,
    action,
    code,
    description,
    created_at: new Date().toISOString()
  })
  // keep operations bounded
  if (data.operations.length > 5000) data.operations.splice(0, data.operations.length - 5000)
}

function typePublic(t) {
  const s = stateOf(t)
  return {
    key: t,
    label: s.label,
    prefix: s.prefix,
    suffixLength: s.suffixLength,
    nextSequence: s.nextSequence,
    maxSequence: maxSeqOf(t),
    count: data.codes[t].length,
    sampleFirst: s.nextSequence <= maxSeqOf(t) ? buildCode(t, s.nextSequence) : '',
    printedCount: s.printedCount
  }
}

// ---------- exporters ----------
function sendExport(res, rows, sheetName, baseFilename) {
  const date = new Date().toISOString().split('T')[0]
  const wantCsv = String(res.req?.query?.format || '').toLowerCase() === 'csv' || !XLSX
  const filename = `${baseFilename}_${date}.${wantCsv ? 'csv' : 'xls'}`
  const encoded = encodeURIComponent(filename)

  if (wantCsv) {
    const BOM = '\uFEFF'
    const csv = BOM + [['码值'], ...rows].map((r) =>
      r.map((cell) => {
        let s = String(cell).replace(/"/g, '""')
        if (/^\d{12,}$/.test(s)) s = '\t' + s
        return `"${s}"`
      }).join(',')
    ).join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`)
    return res.send(csv)
  }

  const aoa = [['码值'], ...rows.map((r) => r.map((c) => String(c)))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      if (!cell) continue
      if (cell.t !== 's') { cell.t = 's'; cell.v = String(cell.v) }
      cell.z = '@'
    }
  }
  ws['!cols'] = [{ wch: 22 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { bookType: 'xls', type: 'buffer' })
  res.setHeader('Content-Type', 'application/vnd.ms-excel')
  res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`)
  res.send(buf)
}

loadData()

/* ============ GET /config — current rules for both types ============ */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: { types: typeKeys.map(typePublic) }
  })
})

/* ============ GET /stats — counts + rules ============ */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      types: typeKeys.map(typePublic),
      total: data.codes.box.length + data.codes.pallet.length,
      timestamp: Date.now(),
      lastModified: new Date().toISOString(),
      dataVersion: data.codes.box.length + data.codes.pallet.length
    }
  })
})

/* ============ POST /generate ============ */
router.post('/generate', (req, res) => {
  const { codeType, count = 1, password } = req.body || {}
  if (password !== PASSWORD) return res.status(401).json({ success: false, error: '密码错误', message: '密码错误' })
  if (!isType(codeType)) return res.status(400).json({ success: false, error: '无效的码类型', message: '无效的码类型' })
  const n = parseInt(count)
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    return res.status(400).json({ success: false, error: '生成数量必须在1-500之间', message: '生成数量必须在1-500之间' })
  }

  const s = stateOf(codeType)
  const maxSeq = maxSeqOf(codeType)
  const generated = []
  const errors = []
  for (let i = 0; i < n; i++) {
    const seq = s.nextSequence
    if (seq > maxSeq) {
      errors.push(`序号已达上限：后缀 ${s.suffixLength} 位时最大序号为 ${maxSeq}，请到设置中增大后缀位数`)
      break
    }
    const code = buildCode(codeType, seq)
    if (data.codes[codeType].some((c) => c.code === code)) {
      errors.push(`${s.label} ${code} 已存在`)
      s.nextSequence = seq + 1
      continue
    }
    data.codes[codeType].unshift({
      id: Date.now() + i + Math.random(),
      code_type: codeType,
      code,
      sequence: seq,
      created_at: new Date().toISOString()
    })
    s.nextSequence = seq + 1
    generated.push(code)
    addOperation(codeType, 'generate', code, `生成${s.label}: ${code}`)
  }
  if (generated.length) saveData()
  res.json({ success: true, generatedCodes: generated, codeType, count: generated.length, errors, label: s.label })
})

/* ============ POST /reduce ============ */
router.post('/reduce', (req, res) => {
  const { codeType, count = 1, password } = req.body || {}
  if (password !== PASSWORD) return res.status(401).json({ success: false, error: '密码错误', message: '密码错误' })
  if (!isType(codeType)) return res.status(400).json({ success: false, error: '无效的码类型', message: '无效的码类型' })
  const n = parseInt(count)
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    return res.status(400).json({ success: false, error: '减少数量必须在1-100之间', message: '减少数量必须在1-100之间' })
  }
  const s = stateOf(codeType)
  const list = data.codes[codeType]
  if (!list.length) return res.status(400).json({ success: false, error: `暂无${s.label}`, message: `暂无${s.label}` })

  const sorted = list.slice().sort((a, b) => seqOf(b) - seqOf(a))
  const removed = []
  for (let i = 0; i < Math.min(n, sorted.length); i++) {
    const idx = list.findIndex((c) => c.id === sorted[i].id)
    if (idx !== -1) {
      const [gone] = list.splice(idx, 1)
      removed.push(gone)
      addOperation(codeType, 'reduce', gone.code, `减少${s.label}: ${gone.code}`)
    }
  }
  if (removed.length) {
    s.nextSequence = list.length ? Math.max(...list.map(seqOf)) + 1 : 1
    saveData()
  }
  res.json({ success: true, reducedCodes: removed.map((c) => c.code), codeType, count: removed.length, label: s.label })
})

/* ============ POST /change-rule — update prefix / suffix / label for one type ============ */
router.post('/change-rule', (req, res) => {
  const { codeType, adminPassword, prefix, suffixLength, syncExisting, label } = req.body || {}
  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: '管理员密码错误', message: '管理员密码错误' })
  }
  if (!isType(codeType)) return res.status(400).json({ success: false, error: '无效的码类型', message: '无效的码类型' })

  const prefixStr = String(prefix ?? '').trim()
  if (!/^\d{1,20}$/.test(prefixStr)) {
    return res.status(400).json({ success: false, error: '前缀必须为 1-20 位数字', message: '前缀必须为 1-20 位数字' })
  }
  const s = stateOf(codeType)
  let newSuffix = s.suffixLength
  if (suffixLength !== undefined && suffixLength !== null && String(suffixLength).trim() !== '') {
    const n = parseInt(suffixLength, 10)
    if (!Number.isInteger(n) || n < 1 || n > 9) {
      return res.status(400).json({ success: false, error: '后缀位数必须为 1-9 之间的整数', message: '后缀位数必须为 1-9 之间的整数' })
    }
    newSuffix = n
  }
  const newMax = Math.pow(10, newSuffix) - 1
  const maxUsed = data.codes[codeType].length ? Math.max(...data.codes[codeType].map(seqOf)) : 0
  if (maxUsed > newMax) {
    return res.status(400).json({
      success: false,
      error: `后缀位数过小：已有最大序号 ${maxUsed}，超过 ${newSuffix} 位上限 ${newMax}`,
      message: `后缀位数过小：已有最大序号 ${maxUsed}，超过 ${newSuffix} 位上限 ${newMax}`
    })
  }

  s.prefix = prefixStr
  s.suffixLength = newSuffix
  if (label !== undefined && label !== null && String(label).trim()) {
    s.label = String(label).trim().slice(0, 30)
  }

  let synced = 0
  if (syncExisting === true || syncExisting === 'true') {
    const map = new Map()
    data.codes[codeType].forEach((c) => {
      const seq = seqOf(c)
      const old = c.code
      c.sequence = seq
      c.code = buildCode(codeType, seq)
      if (old !== c.code) map.set(old, c.code)
      synced++
    })
    if (map.size) {
      data.operations.forEach((op) => { if (op.code && map.has(op.code)) op.code = map.get(op.code) })
    }
  }
  saveData()
  res.json({
    success: true,
    prefix: s.prefix,
    suffixLength: s.suffixLength,
    maxSequence: maxSeqOf(codeType),
    synced,
    label: s.label,
    type: typePublic(codeType)
  })
})

/* ============ POST /save-printed-count ============ */
router.post('/save-printed-count', (req, res) => {
  const { codeType, count } = req.body || {}
  if (!isType(codeType)) return res.status(400).json({ success: false, error: '无效的码类型', message: '无效的码类型' })
  const n = parseInt(count)
  if (!Number.isInteger(n) || n < 0) return res.status(400).json({ success: false, error: '打印数量必须是非负整数', message: '打印数量必须是非负整数' })
  stateOf(codeType).printedCount = n
  saveData()
  res.json({ success: true, codeType, printedCount: n })
})

/* ============ GET /history ============ */
router.get('/history', (req, res) => {
  const { codeType, page = 1, limit = 200 } = req.query
  let rows = data.operations.slice()
  if (codeType && isType(codeType)) rows = rows.filter((o) => o.code_type === codeType)
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const total = rows.length
  const p = parseInt(page), l = parseInt(limit)
  res.json({
    success: true,
    data: rows.slice((p - 1) * l, p * l),
    pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) }
  })
})

/* ============ GET /export — export existing codes ============ */
router.get('/export', (req, res) => {
  const { codeType } = req.query
  const t = isType(codeType) ? codeType : 'box'
  const rows = data.codes[t].slice().sort((a, b) => seqOf(a) - seqOf(b)).map((c) => [c.code])
  sendExport(res, rows, stateOf(t).label, `${t}_codes`)
})

/* ============ GET /print-template — all codes, duplicated for label printing ============ */
router.get('/print-template', (req, res) => {
  const { codeType } = req.query
  const t = isType(codeType) ? codeType : 'box'
  const sorted = data.codes[t].slice().sort((a, b) => seqOf(a) - seqOf(b))
  const rows = []
  sorted.forEach((c) => { rows.push([c.code]); rows.push([c.code]) })
  sendExport(res, rows, '打印模板', `${t}_print_template`)
})

/* ============ POST /print-template-custom — arbitrary sequence range, duplicated ============ */
router.post('/print-template-custom', (req, res) => {
  const { codeType, startNumber, endNumber } = req.body || {}
  if (!isType(codeType)) return res.status(400).json({ success: false, error: '无效的码类型', message: '无效的码类型' })
  const start = parseInt(startNumber), end = parseInt(endNumber)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
    return res.status(400).json({ success: false, error: '序号必须大于0', message: '序号必须大于0' })
  }
  if (start > end) return res.status(400).json({ success: false, error: '起始序号不能大于结束序号', message: '起始序号不能大于结束序号' })
  const max = maxSeqOf(codeType)
  if (end > max) {
    return res.status(400).json({ success: false, error: `序号不能超过 ${max}（当前后缀 ${stateOf(codeType).suffixLength} 位）`, message: `序号不能超过 ${max}` })
  }
  const rows = []
  for (let i = start; i <= end; i++) { const c = buildCode(codeType, i); rows.push([c]); rows.push([c]) }
  sendExport(res, rows, '打印模板', `${codeType}_template_${start}-${end}`)
})

module.exports = router
