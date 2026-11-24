const express = require('express');
const router = express.Router();
const http = require('http');
const db = require('../db');
const { getAlarmTypeText } = require('../alarm_types');

/**
 * 中间件：检查数据库是否已连接
 */
function requireLogin(req, res, next) {
  try {
    db.getPool(); // 如果未初始化会抛出错误
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: '数据库未连接，请先登录',
    });
  }
}

/**
 * RCS载具任务查询
 * 支持多条件筛选tas_task_chain_his和tas_task_chain
 * GET /api/rcs-tasks
 * 可选参数：carrier_code, task_chain_code, task_chain_type, task_status, amr_code, start_route_code, end_route_code, start_time, end_time, page, pageSize, table（his/chain/both）
 *
 * task_status 说明：
 *   9 为已结束
 *   0 为未执行
 *   5 为已取消
 *   其他数字为执行中
 */
// 调试接口：查看任务状态分布
router.get('/debug-task-status', requireLogin, async (req, res) => {
  try {
    const chainResult = await db.query(`SELECT task_status, COUNT(*) as cnt FROM tas_task_chain GROUP BY task_status ORDER BY task_status`);
    const hisResult = await db.query(`SELECT task_status, COUNT(*) as cnt FROM tas_task_chain_his GROUP BY task_status ORDER BY task_status`);
    res.json({
      success: true,
      tas_task_chain: chainResult.rows,
      tas_task_chain_his: hisResult.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/rcs-tasks', requireLogin, async (req, res) => {
  try {
    // 参数解析
    const {
      carrier_code, task_chain_code, task_chain_type, task_status, amr_code,
      start_route_code, end_route_code, map_code, start_time, end_time,
      start_map_code, end_map_code,
      page = 1, pageSize = 15, table = 'both'
    } = req.query;
    console.log('[rcs-tasks] 请求参数:', { task_status, table, page, pageSize });

    // 支持分页
    const limit = Math.max(1, Number(pageSize) || 500);
    const offset = (Math.max(1, Number(page)) - 1) * limit;

    // 查询条件
    const params = [];
    const whereParts = [];
    if (carrier_code) { params.push('%' + carrier_code + '%'); whereParts.push(`carrier_code LIKE $${params.length}`); }
    if (task_chain_code) { params.push('%' + task_chain_code + '%'); whereParts.push(`task_chain_code LIKE $${params.length}`); }
    if (task_chain_type) { params.push(task_chain_type); whereParts.push(`task_chain_type = $${params.length}`); }
    if (task_status) {
      const statusList = task_status.split(',').map(Number);
      if (statusList.length === 1) {
        params.push(statusList[0]);
        whereParts.push(`task_status = $${params.length}`);
      } else {
        params.push(statusList);
        whereParts.push(`task_status = ANY($${params.length})`);
      }
    }
    if (amr_code) { params.push('%' + amr_code + '%'); whereParts.push(`amr_code LIKE $${params.length}`); }
    if (start_route_code) { params.push('%' + start_route_code + '%'); whereParts.push(`start_route_code LIKE $${params.length}`); }
    if (end_route_code) { params.push('%' + end_route_code + '%'); whereParts.push(`end_route_code LIKE $${params.length}`); }
    if (map_code) { params.push(map_code); whereParts.push(`map_code = $${params.length}`); }
    if (start_map_code) { params.push(start_map_code); whereParts.push(`map_code = $${params.length}`); }
    if (end_map_code) { params.push(end_map_code); whereParts.push(`map_code = $${params.length}`); }
    if (start_time) { params.push(start_time); whereParts.push(`create_time >= $${params.length}`); }
    if (end_time) { params.push(end_time); whereParts.push(`create_time <= $${params.length}`); }
    const where = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

    // 字段映射
    const fields = [
      'carrier_code',
      'task_chain_code',
      'task_chain_type',
      'task_status',
      'amr_code',
      'start_route_code',
      'end_route_code',
      'map_code',
      'create_time',
      `(SELECT carrier_type FROM tas_site_status WHERE carrier_code = t.carrier_code LIMIT 1) as carrier_type`
    ];

    // 支持his/chain/both
    let sql;
    let countSql;
    
    if (table === 'his') {
      sql = `SELECT ${fields.join(', ')} FROM tas_task_chain_his t ${where} ORDER BY create_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      countSql = `SELECT COUNT(*) as total FROM tas_task_chain_his t ${where}`;
      params.push(limit, offset);
    } else if (table === 'chain') {
      sql = `SELECT ${fields.join(', ')} FROM tas_task_chain t ${where} ORDER BY create_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      countSql = `SELECT COUNT(*) as total FROM tas_task_chain t ${where}`;
      params.push(limit, offset);
    } else {
      // both: 分别查询两个表再合并
      const hisSql = `SELECT ${fields.join(', ')} FROM tas_task_chain_his t ${where}`;
      const chainSql = `SELECT ${fields.join(', ')} FROM tas_task_chain t ${where}`;
      const hisCountSql = `SELECT COUNT(*) as total FROM tas_task_chain_his t ${where}`;
      const chainCountSql = `SELECT COUNT(*) as total FROM tas_task_chain t ${where}`;

      const hisCountResult = await db.query(hisCountSql, params);
      const chainCountResult = await db.query(chainCountSql, params);
      const hisTotal = parseInt(hisCountResult.rows[0].total) || 0;
      const chainTotal = parseInt(chainCountResult.rows[0].total) || 0;
      const total = hisTotal + chainTotal;
      const totalPages = Math.ceil(total / limit) || 1;

      // 合并两个表的结果
      console.log('[rcs-tasks] hisSql:', hisSql, 'params:', params);
      console.log('[rcs-tasks] chainSql:', chainSql, 'params:', params);
      const hisResult = await db.query(hisSql, params);
      const chainResult = await db.query(chainSql, params);
      console.log('[rcs-tasks] hisResult:', hisResult.rows.length, 'chainResult:', chainResult.rows.length);
      const allRows = [...hisResult.rows, ...chainResult.rows];

      // 按create_time降序排序
      allRows.sort((a, b) => {
        const ta = a.create_time ? new Date(a.create_time).getTime() : 0;
        const tb = b.create_time ? new Date(b.create_time).getTime() : 0;
        return tb - ta;
      });

      // 分页
      const pagedRows = allRows.slice(offset, offset + limit);

      // 状态映射
      const statusMap = { '9': '已结束', '0': '未执行', '5': '已取消', '1': '执行中', '2': '执行中' };
      const procdefMap = await loadProcdefMap();
      const { cachedSiteMap } = await loadSiteList();
      const mapNameMap = await loadMapNameMap();
      const extractMapCode = (routeCode) => {
        if (!routeCode || String(routeCode).length < 9) return null;
        return String(routeCode).substring(7, 9);
      };

      const data = pagedRows.map(row => {
        const startMapCode = extractMapCode(row.start_route_code);
        const endMapCode = extractMapCode(row.end_route_code);
        return {
          ...row,
          task_status_display: statusMap[String(row.task_status)] || '执行中',
          task_chain_type_name: row.task_chain_type ? (procdefMap.get(row.task_chain_type) || row.task_chain_type) : '',
          start_route_name: row.start_route_code ? (cachedSiteMap.get(String(row.start_route_code)) || row.start_route_code) : '',
          end_route_name: row.end_route_code ? (cachedSiteMap.get(String(row.end_route_code)) || row.end_route_code) : '',
          map_code: row.map_code,
          map_name: row.map_code ? (mapNameMap[String(row.map_code)] || row.map_code) : '',
          start_map_name: startMapCode ? (mapNameMap[startMapCode] || startMapCode) : '',
          end_map_name: endMapCode ? (mapNameMap[endMapCode] || endMapCode) : ''
        };
      });

      return res.json({
        success: true,
        total: total,
        totalPages: totalPages,
        count: allRows.length,
        data
      });
    }

    // Get total count
    const countResult = await db.query(countSql, params.slice(0, params.length - 2));
    const total = parseInt(countResult.rows[0].total) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const result = await db.query(sql, params);

    // 状态映射
    const statusMap = { '9': '已结束', '0': '未执行', '5': '已取消', '1': '执行中', '2': '执行中' };
    // 任务类型 key_ -> name_ 映射
    const procdefMap = await loadProcdefMap();
    // 站点编号->名称
    const { cachedSiteMap } = await loadSiteList();
    // 地图编号->名称
    const mapNameMap = await loadMapNameMap();
    // Helper: extract map_code from route_code (format: XXXXXXXMMYYYYYYY, map_code at position 8-9)
    const extractMapCode = (routeCode) => {
      if (!routeCode || String(routeCode).length < 9) return null;
      return String(routeCode).substring(7, 9);
    };

    const data = result.rows.map(row => {
      const startMapCode = extractMapCode(row.start_route_code);
      const endMapCode = extractMapCode(row.end_route_code);
      return {
        ...row,
        task_status_display: statusMap[String(row.task_status)] || '执行中',
        task_chain_type_name: row.task_chain_type ? (procdefMap.get(row.task_chain_type) || row.task_chain_type) : '',
        start_route_name: row.start_route_code ? (cachedSiteMap.get(String(row.start_route_code)) || row.start_route_code) : '',
        end_route_name: row.end_route_code ? (cachedSiteMap.get(String(row.end_route_code)) || row.end_route_code) : '',
        map_code: row.map_code,
        map_name: row.map_code ? (mapNameMap[String(row.map_code)] || row.map_code) : '',
        start_map_name: startMapCode ? (mapNameMap[startMapCode] || startMapCode) : '',
        end_map_name: endMapCode ? (mapNameMap[endMapCode] || endMapCode) : ''
      };
    });

    res.json({
      success: true,
      total: total,
      totalPages: totalPages,
      count: result.rowCount,
      data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: '查询失败', message: err.message });
  }
});

/**
 * RCS载具任务取消
 * POST /api/agv/cancel-task
 * Body: { task_chain_code: string }
 * 
 * 调用RCS系统接口取消任务
 * 接口: POST http://<rcs_ip>:80/rcs/rtas/api/robot/controller/task/cancel
 */
router.post('/cancel-task', requireLogin, async (req, res) => {
  try {
    const { task_chain_code } = req.body;
    if (!task_chain_code) {
      return res.status(400).json({ success: false, message: '缺少任务编号 task_chain_code' });
    }

    // 从数据库配置获取RCS服务器IP（每次读取，避免 require 缓存导致 IP 不更新）
    const dbConfig = db.loadDbConfig();
    const rcsHost = dbConfig.host;
    const cancelUrl = `http://${rcsHost}:80/rcs/rtas/api/robot/controller/task/cancel`;

    // 生成X-LR-REQUEST-ID（UUID格式）
    const crypto = require('crypto');
    const requestId = crypto.randomUUID();

    // 调用RCS取消任务接口
    const requestBody = JSON.stringify({ cancelType: 'DROP', robotTaskCode: task_chain_code });
    console.log('[cancel-task] 请求:', cancelUrl, 'body:', requestBody);

    // 使用原生http模块发送请求，确保JSON格式正确
    const rcsResponse = await new Promise((resolve, reject) => {
      const urlObj = new URL(cancelUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'X-LR-REQUEST-ID': requestId
        }
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    console.log('[cancel-task] RCS响应:', JSON.stringify(rcsResponse));
    if (rcsResponse.success !== false) {
      res.json({ success: true, message: '任务已取消：' + task_chain_code, rcsResponse });
    } else {
      res.json({ success: false, message: 'RCS返回失败', rcsResponse });
    }
  } catch (err) {
    console.error('[cancel-task] 错误:', err.message, err.response ? JSON.stringify(err.response.data) : '');
    res.status(500).json({ success: false, error: '取消任务失败', message: err.message, rcsError: err.response ? err.response.data : null });
  }
});

// 站点编号 -> 站点名称（来自 cms_site 表）
const SITE_TYPE_MAP = {
  '1': '储位',
  '10': '工作点',
  '22': '电梯交接点',
  '53': '巷道头',
  '54': '巷道尾',
  '55': '巷道缓冲区',
};
// 从 cms_elc_map 表动态加载 map_code -> map_name 映射
let cachedMapNameMap = null;
async function loadMapNameMap() {
  try {
    const result = await db.query("SELECT map_code, map_name FROM public.cms_elc_map ORDER BY map_code");
    const map = {};
    for (const row of result.rows) {
      if (row.map_code) map[String(row.map_code).trim()] = String(row.map_name || '').trim();
    }
    cachedMapNameMap = map;
    return map;
  } catch (e) {
    console.error('[区域映射] 加载失败:', e.message);
    return {};
  }
}

let cachedSiteList = null;
let cachedSiteMap = null;

async function loadSiteList() {
  if (cachedSiteList && cachedSiteMap) return { cachedSiteList, cachedSiteMap };

  const mapNameMap = await loadMapNameMap();
  const result = await db.query(
    "SELECT site_code, site_name, site_type, map_code FROM cms_site WHERE site_type IN ('1','10','22','53','54','55') ORDER BY map_code, site_code"
  );

  const siteList = [];
  const siteMap = new Map();

  for (const row of result.rows) {
    const code = String(row.site_code || "").trim();
    const name = String(row.site_name || "").trim();
    const stype = String(row.site_type || "").trim();
    const mcode = String(row.map_code || "").trim();
    if (!code) continue;
    const item = {
      site_code: code,
      site_name: name,
      site_type: stype,
      site_type_name: SITE_TYPE_MAP[stype] || stype,
      map_code: mcode,
      map_name: mapNameMap[mcode] || mcode,
    };
    siteList.push(item);
    siteMap.set(code, name);
  }

  cachedSiteList = siteList;
  cachedSiteMap = siteMap;
  return { cachedSiteList, cachedSiteMap };
}

/**
 * 站点状态查询
 * - site_code: 站点编号
 * - carrier_code: 载具编号
 * - node: AGV 用的 node 字段（按你的要求作为过滤条件）
 */
router.get('/site-status', requireLogin, async (req, res) => {
  try {
    const { node, site_code, carrier_code, limit } = req.query;

    const parsedLimit = Number(limit || 200);
    const safeLimit = Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 200, 2000);

    const params = [];
    const whereParts = [];
    if (node) {
      params.push(node);
      whereParts.push(`node = $${params.length}`);
    }
    if (site_code) {
      params.push(site_code);
      whereParts.push(`site_code = $${params.length}`);
    }
    if (carrier_code) {
      params.push(carrier_code);
      whereParts.push(`carrier_code = $${params.length}`);
    }
    const where = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : '';

    // 返回整行数据（你后续可再按需要裁剪字段）
    const sql = `
      SELECT *
      FROM public.tas_site_status
      ${where}
      LIMIT $${params.length + 1}
    `;
    params.push(safeLimit);

    const result = await db.query(sql, params);

    // 展示层字段：carrier_code 为空/NULL 时显示“无载具”
    const data = result.rows.map((row) => {
      const carrierCode = row.carrier_code;
      const hasCarrier = carrierCode !== null && carrierCode !== undefined && String(carrierCode).trim() !== '';
      return {
        ...row,
        carrier_code_display: hasCarrier ? carrierCode : '无载具'
      };
    });

    res.json({
      success: true,
      count: result.rowCount,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '查询失败',
      message: err.message
    });
  }
});

/**
 * 获取 0323.txt 里的站点编号及名称
 * 用于网页下拉框展示
 */
router.get('/site-codes', requireLogin, async (req, res) => {
  try {
    const { cachedSiteList } = await loadSiteList();
    res.json({ success: true, data: cachedSiteList });
  } catch (err) {
    res.status(500).json({ success: false, error: '查询 cms_site 失败', message: err.message });
  }
});

/**
 * 按站点编号 site_code 查询站点状态
 * - carrier_code 有值 -> 显示该值
 * - carrier_code 为 NULL/空 -> 显示“无载具”
 */
router.get('/site-status-by-site-code', requireLogin, async (req, res) => {
  try {
    const { site_code } = req.query;

    if (!site_code) {
      return res.status(400).json({ success: false, error: '缺少参数: site_code' });
    }

    const { cachedSiteMap } = await loadSiteList();
    const site_name = cachedSiteMap.get(String(site_code)) || '';

    const result = await db.query(
      `SELECT *
       FROM public.tas_site_status
       WHERE site_code = $1
       LIMIT 1`,
      [site_code]
    );

    if (result.rowCount === 0) {
      return res.json({
        success: true,
        found: false,
        site_code,
        site_name,
        carrier_code: null,
        carrier_code_display: '无记录'
      });
    }

    const row = result.rows[0];
    const carrierCode = row.carrier_code;
    const hasCarrier =
      carrierCode !== null &&
      carrierCode !== undefined &&
      String(carrierCode).trim() !== '';

    res.json({
      success: true,
      found: true,
      site_code: row.site_code,
      site_name,
      carrier_code: carrierCode,
      carrier_code_display: hasCarrier ? carrierCode : '无载具'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: '查询失败',
      message: err.message
    });
  }
});

// 获取告警区域列表（来自 cms_elc_map 表）
router.get('/alarm-areas', requireLogin, async (req, res) => {
  try {
    const result = await db.query('SELECT map_code, map_name FROM public.cms_elc_map ORDER BY map_code');
    const list = result.rows.map(r => ({ code: String(r.map_code).trim(), name: String(r.map_name || '').trim() }));
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: '获取区域列表失败', message: err.message });
  }
});

// 流程定义 key_ -> name_ 缓存（任务类型映射）
let cachedProcdefMap = null;
async function loadProcdefMap() {
  if (cachedProcdefMap) return cachedProcdefMap;
  const res = await db.query("SELECT key_, name_ FROM act_re_procdef");
  const map = new Map();
  for (const row of res.rows) {
    if (row.key_ && row.name_) map.set(row.key_, row.name_);
  }
  cachedProcdefMap = map;
  return map;
}


/**
 * 手动刷新后端缓存（站点列表、地图名称、任务类型）
 * POST /api/agv/reload-cache
 */
router.post('/reload-cache', requireLogin, async (req, res) => {
  try {
    cachedMapNameMap = null;
    cachedSiteList = null;
    cachedSiteMap = null;
    cachedProcdefMap = null;
    // 重新预热缓存
    await loadMapNameMap();
    await loadSiteList();
    await loadProcdefMap();
    res.json({ success: true, message: '缓存已刷新，站点和地图数据已重新加载' });
  } catch (err) {
    res.status(500).json({ success: false, error: '缓存刷新失败', message: err.message });
  }
});
/**
 * 告警状态查表函数 - 根据 end_date 判断
 * end_date 有值: 告警结束, end_date 无值: 告警开始
 */
function getAlarmStatusText(row) {
  if (row.end_date !== null && row.end_date !== undefined && row.end_date !== '') {
    return '告警结束';
  }
  return '告警开始';
}

/**
 * 告警等级查表函数
 * 1: 低, 2: 中, 3: 严重
 */
function getAlarmLevelText(logLevel) {
  const levelMap = { 1: '低', 2: '中', 3: '严重' };
  return levelMap[logLevel] || '未知等级';
}

/**
 * 告警区域中文映射 - 使用 cachedMapNameMap 动态查询
 */
function getAlarmAreaText(mapCode) {
  if (!mapCode) return '未知区域';
  if (cachedMapNameMap && cachedMapNameMap[mapCode]) {
    return cachedMapNameMap[mapCode];
  }
  return mapCode;
}

/**
 * 告警类型中文映射函数（使用外部映射文件）
 */
// getAlarmTypeText 已从 alarm_types.js 导入

/**
 * 计算告警持续时间
 */
function calculateAlarmDuration(beginDate, endDate) {
  if (!beginDate) return '未知';
  try {
    var begin = new Date(beginDate);
    var end = endDate ? new Date(endDate) : new Date();
    var diffMs = end - begin;
    if (diffMs < 0) return '时间异常';
    var diffSeconds = Math.floor(diffMs / 1000);
    var diffMinutes = Math.floor(diffSeconds / 60);
    var diffHours = Math.floor(diffMinutes / 60);
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return diffDays + "天" + (diffHours % 24) + "小时" + (diffMinutes % 60) + "分钟";
    if (diffHours > 0) return diffHours + "小时" + (diffMinutes % 60) + "分钟" + (diffSeconds % 60) + "秒";
    if (diffMinutes > 0) return diffMinutes + "分钟" + (diffSeconds % 60) + "秒";
    return diffSeconds + "秒";
  } catch (error) {
    return '计算错误';
  }
}

/**
 * 构建告警查询动态WHERE条件和参数
 * @param {Object} filters - 筛选参数对象
 * @returns {Object} { whereConditions, queryParams }
 */
function buildAlarmWhere(filters) {
  var whereConditions = [];
  var queryParams = [];
  var paramIndex = 1;

  // 1. 设备编号精确匹配
  if (filters.source_code && filters.source_code.trim()) {
    whereConditions.push("source_code = $" + paramIndex);
    queryParams.push(filters.source_code.trim());
    paramIndex++;
  }

  // 1.5 主告警类型精确匹配
  if (filters.main_type_code !== undefined && filters.main_type_code !== '' && filters.main_type_code !== null) {
    whereConditions.push("main_type_code = $" + paramIndex);
    queryParams.push(filters.main_type_code);
    paramIndex++;
  }

  // 1.6 子告警类型精确匹配
  if (filters.minor_type_code !== undefined && filters.minor_type_code !== '' && filters.minor_type_code !== null) {
    whereConditions.push("minor_type_code::text = $" + paramIndex);
    queryParams.push(filters.minor_type_code);
    paramIndex++;
  }

  // 2. 告警等级精确匹配
  if (filters.log_level !== undefined && filters.log_level !== '' && filters.log_level !== null) {
    whereConditions.push("log_level = $" + paramIndex);
    queryParams.push(filters.log_level);
    paramIndex++;
  }

  // 3. 告警状态: 按 end_date 是否有值过滤
  if (filters.alarm_status !== undefined && filters.alarm_status !== '' && filters.alarm_status !== null) {
    if (filters.alarm_status === '1' || String(filters.alarm_status) === '1' || String(filters.alarm_status).toLowerCase() === 'start' || String(filters.alarm_status) === '告警开始') {
      whereConditions.push("end_date IS NULL");
    } else if (filters.alarm_status === '0' || String(filters.alarm_status) === '0' || String(filters.alarm_status).toLowerCase() === 'end' || String(filters.alarm_status) === '告警结束') {
      whereConditions.push("end_date IS NOT NULL");
    }
  }

  // 4. 开始时间 >= (使用 begin_date 字段，与数据库字段一致)
  if (filters.begin_date && filters.begin_date.trim()) {
    var beginVal = filters.begin_date.trim();
    if (beginVal.length === 16) beginVal += ":00";
    whereConditions.push("(begin_date IS NOT NULL AND begin_date >= $" + paramIndex + ")");
    queryParams.push(beginVal);
    paramIndex++;
  }

  // 5. 结束时间 <= (使用 begin_date 字段)
  if (filters.end_date && filters.end_date.trim()) {
    var endVal = filters.end_date.trim();
    if (endVal.length === 16) endVal += ":59";
    whereConditions.push("(begin_date IS NOT NULL AND begin_date <= $" + paramIndex + ")");
    queryParams.push(endVal);
    paramIndex++;
  }

  // 6. 地图编码模糊匹配
  if (filters.elc_map_code && filters.elc_map_code.trim()) {
    whereConditions.push("elc_map_code ILIKE $" + paramIndex);
    queryParams.push("%" + filters.elc_map_code.trim() + "%");
    paramIndex++;
  }

  // 7. 告警内容检索（多字段模糊匹配：alarm_detail, main_type_code::text, minor_type_code::text）
  if (filters.alarm_content && filters.alarm_content.trim()) {
    var contentKeywords = filters.alarm_content.split(/[,，\s]+/).map(function(k) { return k.trim(); }).filter(function(k) { return k.length > 0; });
    if (contentKeywords.length > 0) {
      var contentConds = contentKeywords.map(function(kw, idx) {
        var pIdx = paramIndex + idx;
        queryParams.push("%" + kw + "%");
        return "(alarm_detail ILIKE $" + pIdx + " OR main_type_code::text ILIKE $" + pIdx + " OR minor_type_code::text ILIKE $" + pIdx + ")";
      });
      whereConditions.push("(" + contentConds.join(" OR ") + ")");
      paramIndex += contentKeywords.length;
    }
  }

  // 8. 不显示排除内容（多字段模糊排除：alarm_detail, main_type_code::text, minor_type_code::text）
  //    多关键词之间为"且"逻辑 - 必须全部不匹配
  if (filters.hide_content && filters.hide_content.trim()) {
    var hideKeywords = filters.hide_content.split(/[,，\s]+/).map(function(k) { return k.trim(); }).filter(function(k) { return k.length > 0; });
    if (hideKeywords.length > 0) {
      var hideConds = hideKeywords.map(function(kw, idx) {
        var pIdx = paramIndex + idx;
        queryParams.push("%" + kw + "%");
        // 每条关键词：三个字段都不包含该关键词（修复原代码只排除alarm_detail，且括号缺失）
        return "NOT (" +
          "alarm_detail ILIKE $" + pIdx + " OR " +
          "main_type_code::text ILIKE $" + pIdx + " OR " +
          "minor_type_code::text ILIKE $" + pIdx + ")";
      });
      whereConditions.push("(" + hideConds.join(" AND ") + ")");
      paramIndex += hideKeywords.length;
    }
  }

  return { whereConditions: whereConditions, queryParams: queryParams };
}

/**
 * 告警历史查询API
 * GET /api/agv/alarm-history
 * 参数: source_code, log_level, alarm_status, begin_date, end_date, elc_map_code,
 *       alarm_content, hide_content, main_type_code, minor_type_code, page, pageSize
 */
router.get('/alarm-history', requireLogin, async (req, res) => {
  try {
    var page = parseInt(req.query.page) || 1;
    var pageSize = parseInt(req.query.pageSize) || 10;
    if (page < 1) page = 1;
    if (pageSize < 1 || pageSize > 500) pageSize = 10;

    var filters = {
      source_code: req.query.source_code,
      log_level: req.query.log_level !== undefined ? req.query.log_level : null,
      alarm_status: req.query.alarm_status !== undefined ? req.query.alarm_status : null,
      begin_date: req.query.begin_date,
      end_date: req.query.end_date,
      elc_map_code: req.query.elc_map_code,
      alarm_content: req.query.alarm_content,
      hide_content: req.query.hide_content
    };

    var built = buildAlarmWhere(filters);

    var whereClause = built.whereConditions.length > 0
      ? "WHERE " + built.whereConditions.join(" AND ")
      : "";

    // 获取总数
    var countResult = await db.query(
      "SELECT COUNT(*) as cnt FROM cms_alarm_log " + whereClause,
      built.queryParams
    );
    var totalCount = parseInt(countResult.rows[0].cnt);
    var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    var offset = (page - 1) * pageSize;

    // 获取分页数据
    var dataParams = built.queryParams.concat([pageSize, offset]);
    var result = await db.query(
      "SELECT " +
        "source_code, " +
        "alarm_x, alarm_y, " +
        "begin_date, end_date, " +
        "elc_map_code, " +
        "main_type_code, minor_type_code, " +
        "alarm_status, log_level, " +
        "TO_CHAR(begin_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as begin_date_formatted, " +
        "TO_CHAR(end_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as end_date_formatted " +
      "FROM cms_alarm_log " +
      whereClause + " " +
      "ORDER BY begin_date DESC " +
      "LIMIT $" + (dataParams.length - 1) + " OFFSET $" + dataParams.length,
      dataParams
    );

    if (!cachedMapNameMap || Object.keys(cachedMapNameMap).length === 0) await loadMapNameMap();

    var processedData = result.rows.map(function(row) {
      var typeInfo = getAlarmTypeText(row.main_type_code, row.minor_type_code);
      return {
        source_code: row.source_code,
        alarm_x: row.alarm_x,
        alarm_y: row.alarm_y,
        begin_date: row.begin_date,
        end_date: row.end_date,
        elc_map_code: row.elc_map_code,
        main_type_code: row.main_type_code,
        minor_type_code: row.minor_type_code,
        alarm_status: row.alarm_status,
        log_level: row.log_level,
        begin_date_formatted: row.begin_date_formatted,
        end_date_formatted: row.end_date_formatted,
        status_text: getAlarmStatusText(row),
        level_text: getAlarmLevelText(row.log_level),
        main_type_text: typeInfo.mainTypeText,
        minor_type_text: typeInfo.minorTypeText,
        elc_map_code_text: getAlarmAreaText(row.elc_map_code),
        duration: calculateAlarmDuration(row.begin_date, row.end_date)
      };
    });

    console.log("Alarm history query - page " + page + "/" + totalPages + ", " + totalCount + " total");

    res.json({
      success: true,
      data: processedData,
      count: processedData.length,
      total: totalCount,
      pagination: {
        current_page: page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error("Alarm history query failed:", error);
    res.status(500).json({
      success: false,
      message: '告警历史查询失败',
      error: error.message
    });
  }
});

/**
 * 告警历史导出API
 * GET /api/agv/alarm-history/export
 * 导出所有符合条件的数据为XLS格式（HTML Table）
 * 参数与查询接口完全一致（含hide_content排除）
 */
router.get('/alarm-history/export', requireLogin, async (req, res) => {
  try {
    var filters = {
      source_code: req.query.source_code,
      log_level: req.query.log_level !== undefined ? req.query.log_level : null,
      alarm_status: req.query.alarm_status !== undefined ? req.query.alarm_status : null,
      begin_date: req.query.begin_date,
      end_date: req.query.end_date,
      elc_map_code: req.query.elc_map_code,
      alarm_content: req.query.alarm_content,
      hide_content: req.query.hide_content
    };

    var built = buildAlarmWhere(filters);

    var whereClause = built.whereConditions.length > 0
      ? "WHERE " + built.whereConditions.join(" AND ")
      : "";

    // 获取全部数据（不分页）
    var result = await db.query(
      "SELECT " +
        "source_code, " +
        "begin_date, end_date, " +
        "elc_map_code, " +
        "main_type_code, minor_type_code, " +
        "alarm_status, log_level, " +
        "TO_CHAR(begin_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as begin_date_formatted, " +
        "TO_CHAR(end_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as end_date_formatted " +
      "FROM cms_alarm_log " +
      whereClause + " " +
      "ORDER BY begin_date DESC",
      built.queryParams
    );

    if (!cachedMapNameMap || Object.keys(cachedMapNameMap).length === 0) await loadMapNameMap();

    var exportData = result.rows.map(function(row) {
      var typeInfo = getAlarmTypeText(row.main_type_code, row.minor_type_code);
      return {
        device_code: row.source_code || '-',
        begin_date: row.begin_date_formatted || '-',
        end_date: row.end_date_formatted || '-',
        elc_map_code: row.elc_map_code || '-',
        main_type: typeInfo.mainTypeText,
        minor_type: typeInfo.minorTypeText,
        alarm_status: getAlarmStatusText(row),
        log_level: getAlarmLevelText(row.log_level)
      };
    });

    if (exportData.length === 0) {
      return res.status(400).json({
        success: false,
        message: '暂无可导出数据'
      });
    }

    // 生成HTML表格（XLS兼容格式）
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8"><title>Export</title></head><body>';
    html += '<table border="1"><thead><tr>';
    html += '<th>设备编号</th><th>开始时间</th><th>结束时间</th><th>地图编码</th>';
    html += '<th>告警大类</th><th>告警小类</th><th>告警状态</th><th>告警等级</th>';
    html += '</tr></thead><tbody>';
    exportData.forEach(function(item) {
      html += "<tr>";
      html += "<td>" + (item.device_code || '-') + "</td>";
      html += "<td>" + (item.begin_date || '-') + "</td>";
      html += "<td>" + (item.end_date || '-') + "</td>";
      html += "<td>" + (item.elc_map_code || '-') + "</td>";
      html += "<td>" + (item.main_type || '-') + "</td>";
      html += "<td>" + (item.minor_type || '-') + "</td>";
      html += "<td>" + (item.alarm_status || '-') + "</td>";
      html += "<td>" + (item.log_level || '-') + "</td>";
      html += "</tr>";
    });
    html += '</tbody></table></body></html>';

    var now = new Date();
    var yy = now.getFullYear();
    var mm = String(now.getMonth()+1).padStart(2,'0');
    var dd = String(now.getDate()).padStart(2,'0');
    var fileName = "alarm_history_" + yy + mm + dd + ".xls";
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    res.send(html);
  } catch (error) {
    console.error("Alarm history export failed:", error);
    res.status(500).json({
      success: false,
      message: '导出失败',
      error: error.message
    });
  }
});

/**
 * 今日任务报表 - 按地图聚合任务统计数据
 * GET /api/agv/daily-task-report
 * Query: start_date, end_date, map_code
 * Returns: status distribution, map task counts, hourly trend
 */
router.get('/daily-task-report', requireLogin, async (req, res) => {
  console.log('[daily-report] Request received:', JSON.stringify(req.query));
  try {
    const { start_date, end_date, map_code } = req.query;

    const defaultDate = new Date().toISOString().split('T')[0];
    const startDate = start_date || (defaultDate + ' 00:00:00');
    const endDate = end_date || ((start_date ? start_date.split(' ')[0] : defaultDate) + ' 23:59:59');

    // 地图名称映射（从 cms_elc_map 获取 map_code -> map_name）
    console.log('[daily-report] Calling loadMapNameMap...');
    const mapNameMap = await loadMapNameMap();
    console.log('[daily-report] mapNameMap result:', JSON.stringify(mapNameMap));
    // 反向映射：名称 -> 代码
    const nameToCodeMap = {};
    for (const mc in mapNameMap) {
      const mn = mapNameMap[mc];
      if (mn) nameToCodeMap[mn] = mc;
    }
    console.log('[daily-report] nameToCodeMap:', JSON.stringify(nameToCodeMap));

    // 将用户选择的 map_code（可能是名称如"1F"）转换为实际地图代码（如"CC"）
    let filterMapCode = null;
    if (map_code) {
      filterMapCode = nameToCodeMap[map_code] || map_code;
      console.log('[daily-report] Input:', map_code, '-> filterMapCode:', filterMapCode);
    }

    // 统一用 UNION ALL 查询两张表，按起点地图分组
    const baseCols = `task_status, carrier_code, start_route_code, map_code,
      EXTRACT(HOUR FROM create_time) as hour,
      TO_CHAR(create_time, 'YYYY-MM-DD') as day`;

    // 趋势图聚合粒度：跨度 <=1 天按小时，>1 天按天（避免多天数据被累加到同一小时格）
    const spanMs = new Date(endDate.replace(' ', 'T')) - new Date(startDate.replace(' ', 'T'));
    const spanDays = spanMs / 86400000;
    const trendByDay = spanDays > 1;

    // 1. 任务状态分布 (pie chart) — 两张表合并
    let statusWhere = 'WHERE create_time >= $1::timestamp AND create_time <= $2::timestamp';
    let statusParams = [startDate, endDate];
    let paramIdx = 3;
    if (filterMapCode) {
      statusWhere += ` AND map_code = $${paramIdx}`;
      statusParams.push(filterMapCode);
      paramIdx++;
    }
    const statusSql = `SELECT task_status, COUNT(*) as cnt FROM (
      SELECT ${baseCols} FROM tas_task_chain_his ${statusWhere}
      UNION ALL
      SELECT ${baseCols} FROM tas_task_chain ${statusWhere}
    ) t GROUP BY task_status`;
    const statusResult = await db.query(statusSql, statusParams);

    // 2. 各起点地图任务数量 (bar chart)
    let mapWhere = 'WHERE create_time >= $1::timestamp AND create_time <= $2::timestamp';
    let mapParams = [startDate, endDate];
    let mapParamIdx = 3;
    if (filterMapCode) {
      mapWhere += ` AND map_code = $${mapParamIdx}`;
      mapParams.push(filterMapCode);
      mapParamIdx++;
    }
    const mapSql = `SELECT map_code as start_map_code, COUNT(*) as task_count FROM (
      SELECT ${baseCols} FROM tas_task_chain_his ${mapWhere}
      UNION ALL
      SELECT ${baseCols} FROM tas_task_chain ${mapWhere}
    ) t GROUP BY map_code ORDER BY task_count DESC`;
    const mapResult = await db.query(mapSql, mapParams);

    // 获取各起点地图的载具数量
    const mapVehicleSql = `SELECT map_code as start_map_code, COUNT(DISTINCT carrier_code) as vehicle_count FROM (
      SELECT ${baseCols} FROM tas_task_chain_his ${mapWhere}
      UNION ALL
      SELECT ${baseCols} FROM tas_task_chain ${mapWhere}
    ) t GROUP BY map_code`;
    const mapVehicleResult = await db.query(mapVehicleSql, mapParams);

    const mapVehicleMap = {};
    for (const row of mapVehicleResult.rows) {
      mapVehicleMap[row.start_map_code] = parseInt(row.vehicle_count) || 0;
    }

    // 3. 任务趋势 (line chart) — 按跨度决定按小时 / 按天聚合
    let trendWhere = 'WHERE create_time >= $1::timestamp AND create_time <= $2::timestamp';
    let trendParams = [startDate, endDate];
    let trendParamIdx = 3;
    if (filterMapCode) {
      trendWhere += ` AND map_code = $${trendParamIdx}`;
      trendParams.push(filterMapCode);
      trendParamIdx++;
    }
    const trendBucketExpr = trendByDay ? 'day' : 'hour';
    const trendSql = `SELECT ${trendBucketExpr} as bucket, map_code as start_map_code, COUNT(*) as cnt FROM (
      SELECT ${baseCols} FROM tas_task_chain_his ${trendWhere}
      UNION ALL
      SELECT ${baseCols} FROM tas_task_chain ${trendWhere}
    ) t GROUP BY ${trendBucketExpr}, map_code ORDER BY ${trendBucketExpr}`;
    const trendResult = await db.query(trendSql, trendParams);

    // 按天模式：生成区间内每一天的日期标签（无数据的天前端补 0，X 轴连续）
    const trendLabels = [];
    if (trendByDay) {
      const labelResult = await db.query(
        `SELECT TO_CHAR(d::date, 'YYYY-MM-DD') as day FROM generate_series($1::date, $2::date, '1 day'::interval) d ORDER BY day`,
        [startDate, endDate]
      );
      for (const row of labelResult.rows) trendLabels.push(row.day);
    }

    // 格式化地图数据
    const mapData = mapResult.rows.map(row => ({
      map_code: row.start_map_code,
      map_name: mapNameMap[String(row.start_map_code).trim()] || row.start_map_code,
      task_count: parseInt(row.task_count),
      vehicle_count: mapVehicleMap[row.start_map_code] || 0,
      avg_per_vehicle: mapVehicleMap[row.start_map_code] > 0 ? Math.round(parseInt(row.task_count) / mapVehicleMap[row.start_map_code]) : 0
    }));

    // 格式化趋势数据：按小时用数字 key（0-23），按天用日期字符串 key（YYYY-MM-DD）
    const trendData = {};
    for (const row of trendResult.rows) {
      const mapName = mapNameMap[String(row.start_map_code).trim()] || row.start_map_code;
      if (!trendData[mapName]) trendData[mapName] = {};
      const key = trendByDay ? String(row.bucket) : parseInt(row.bucket);
      trendData[mapName][key] = parseInt(row.cnt);
    }

    // 4. 车号(设备号)任务统计
    let carrierWhere = 'WHERE create_time >= $1::timestamp AND create_time <= $2::timestamp';
    let carrierParams = [startDate, endDate];
    let carrierParamIdx = 3;
    if (filterMapCode) {
      carrierWhere += ` AND map_code = $${carrierParamIdx}`;
      carrierParams.push(filterMapCode);
      carrierParamIdx++;
    }
    const carrierSql = `SELECT TRIM(amr_code) as amr_code, COUNT(*) as task_count FROM (
      SELECT TRIM(amr_code) as amr_code FROM tas_task_chain_his ${carrierWhere}
      UNION ALL
      SELECT TRIM(amr_code) as amr_code FROM tas_task_chain ${carrierWhere}
    ) t WHERE amr_code IS NOT NULL AND TRIM(amr_code) != '' GROUP BY TRIM(amr_code) ORDER BY task_count DESC`;
    const carrierResult = await db.query(carrierSql, carrierParams);
    const carrierData = carrierResult.rows.map(r => ({
      amr_code: r.amr_code,
      task_count: parseInt(r.task_count)
    }));

    res.json({
      success: true,
      data: {
        statusDistribution: statusResult.rows.map(r => ({
          status: r.task_status,
          count: parseInt(r.cnt)
        })),
        mapTaskCounts: mapData,
        hourlyTrend: trendData,
        trendGranularity: trendByDay ? 'day' : 'hour',
        trendLabels,
        carrierStats: carrierData
      }
    });
  } catch (err) {
    console.error('[daily-report] Error:', err.message, err.stack);
    res.status(500).json({ success: false, message: '获取报表数据失败', error: err.message });
  }
});

module.exports = router;
