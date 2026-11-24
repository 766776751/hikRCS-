// 统一 fetch 封装：
// - 业务失败（{success:false}，含 HTTP 200 的 cancel-task 失败）抛 ApiError(message)
// - /api/db-config、/api/service-config 等裸对象响应原样返回
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export function buildQuery(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    q.append(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function request(path, { method = 'GET', params, body } = {}) {
  let res
  try {
    res = await fetch(path + buildQuery(params), {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch (e) {
    throw new ApiError('网络请求失败，请检查服务是否可达', 0, null)
  }
  let json = null
  try {
    json = await res.json()
  } catch (e) {
    /* 非 JSON 响应（如二进制导出） */
  }
  if (json && json.success === false) {
    throw new ApiError(json.message || json.error || '操作失败', res.status, json)
  }
  if (!res.ok) {
    throw new ApiError((json && (json.message || json.error)) || `请求失败（${res.status}）`, res.status, json)
  }
  return json
}
