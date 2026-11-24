const express = require('express');
const router = express.Router();
// 复用拓展平台主库连接（db_config.json），货架数据与主系统同库
const db = require('../db');
const fs = require('fs');
const path = require('path');

// 货架模块的应用配置（系统名 / 默认地图），不含数据库连接信息
const RACK_CONFIG_FILE = path.join(__dirname, '..', 'rack_config.json');
function loadRackConfig() {
  try {
    if (fs.existsSync(RACK_CONFIG_FILE)) return JSON.parse(fs.readFileSync(RACK_CONFIG_FILE, 'utf-8'));
  } catch (e) { console.error('[rack] 读取货架配置失败:', e.message); }
  return {};
}

// 货架监控数据库连接检查中间件（复用主库连接池）
function requireRackDb(req, res, next) {
  try {
    db.getPool();
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '数据库未配置，请在 db_config.json 中填写连接信息' });
  }
}

// ============ 地图名称缓存（cms_elc_map） ============
let rackMapNameCache = {};
let rackMapLoaded = false;
async function ensureRackMapNames() {
  if (rackMapLoaded) return rackMapNameCache;
  try {
    const r = await db.query('SELECT map_code, map_name FROM cms_elc_map ORDER BY map_code');
    const m = {};
    for (const row of r.rows) {
      if (row.map_code) m[String(row.map_code).trim()] = String(row.map_name || '').trim();
    }
    rackMapNameCache = m;
  } catch (e) {
    console.error('[rack] 地图名称缓存加载失败:', e.message);
  } finally {
    rackMapLoaded = true;
  }
  return rackMapNameCache;
}
function getRackMapName(code) {
  if (!code) return '';
  return rackMapNameCache[String(code).trim()] || code;
}

// ============ 任务状态/类型映射（与货架仓位看板一致） ============
function rackTaskStatusText(s) {
  const map = { 9: '已结束', 0: '未执行', 2: '执行中', 5: '已取消' };
  return map[s] || '执行中';
}
const RACK_TASK_TYPE_MAP = {
  'VDK': '唯德康输送线入库',
  'JH': '久虹输送线入库',
  'CK-CTU': 'WMS搬运',
  'PF-FMR-COMMON': 'WMS叉车搬运',
  'BACK': '手动任务',
  'KONG': '空箱下架',
  'SSX10': 'RCS输送线入库'
};
function rackTaskTypeText(t) {
  return RACK_TASK_TYPE_MAP[t] || t || '';
}

// 处理任务行（his / chain 通用）
function processRackTaskRows(rows) {
  return rows.map(row => ({
    carrier_code: row.carrier_code,
    task_chain_code: row.task_chain_code,
    task_chain_type: row.task_chain_type,
    task_type_text: rackTaskTypeText(row.task_chain_type),
    create_time: row.create_time,
    create_time_formatted: row.create_time_formatted,
    start_route_code: row.start_route_code,
    end_route_code: row.end_route_code,
    task_status: row.task_status,
    status_text: rackTaskStatusText(row.task_status),
    map_code: row.map_code,
    map_code_text: getRackMapName(row.map_code),
    amr_code: row.amr_code,
    table_source: row.table_source
  }));
}

// 解析 map_code 过滤条件（优先用请求参数，回退到配置文件 mapCode）
function resolveMapCode(queryMapCode) {
  const cfg = loadRackConfig();
  const cfgMap = (cfg && cfg.mapCode) ? String(cfg.mapCode).trim() : '';
  const reqMap = queryMapCode ? String(queryMapCode).trim() : '';
  return reqMap || cfgMap || '';
}

// ============ 配置 ============
router.get('/config', (req, res) => {
  const cfg = loadRackConfig() || {};
  const mainDb = db.loadDbConfig() || {};
  res.json({
    success: true,
    data: {
      systemName: cfg.systemName || '货架仓位监控',
      mapCode: cfg.mapCode || '',
      db: mainDb.host ? { host: mainDb.host, port: mainDb.port, database: mainDb.database, user: mainDb.user } : null
    }
  });
});

// ============ 地图/区域列表（含仓位计数） ============
router.get('/map-codes', requireRackDb, async (req, res) => {
  try {
    await ensureRackMapNames();
    const result = await db.query(`
      SELECT COALESCE(m.map_code, s.map_code) AS map_code,
             COALESCE(m.map_name, s.map_code) AS map_name,
             COALESCE(s.count, 0) AS count
      FROM cms_elc_map m
      FULL OUTER JOIN (
        SELECT map_code, COUNT(*) AS count
        FROM tas_bin_status
        WHERE map_code IS NOT NULL AND map_code <> ''
        GROUP BY map_code
      ) s ON s.map_code = m.map_code
      WHERE COALESCE(m.map_code, s.map_code) IS NOT NULL
      ORDER BY count DESC, map_code
    `);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取地图列表失败', error: e.message });
  }
});

// ============ 货架参数（cms_rack） ============
router.get('/racks', requireRackDb, async (req, res) => {
  try {
    const mapCode = resolveMapCode(req.query.map_code);
    const params = [];
    let where = '';
    if (mapCode) { params.push(mapCode); where = 'WHERE map_code = $1'; }

    const result = await db.query(`
      SELECT
        rack_code,
        row_count AS layer,
        col_count AS col,
        bin_count AS bins,
        org_code,
        map_code,
        channel_code,
        site_code,
        rack_category,
        bin_mod_flag,
        dir,
        rack_structure::text AS rack_structure_raw
      FROM cms_rack
      ${where}
      ORDER BY rack_code
    `, params);

    const rows = result.rows.map(r => {
      let dim = {};
      try {
        const obj = JSON.parse(r.rack_structure_raw);
        dim = {
          rackWidth: obj.rackWidth,
          rackLength: obj.rackLength,
          legHeight: obj.legHeight,
          binInfoRowCount: obj.binInfo && obj.binInfo.rows ? obj.binInfo.rows.length : null
        };
      } catch (e) {}
      return {
        rack_code: r.rack_code,
        layer: r.layer,
        col: r.col,
        bins: r.bins,
        org_code: r.org_code,
        map_code: r.map_code,
        channel_code: r.channel_code,
        site_code: r.site_code,
        rack_category: r.rack_category,
        bin_mod_flag: r.bin_mod_flag,
        dir: r.dir,
        ...dim
      };
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取货架参数失败', error: e.message });
  }
});

// ============ 仓位清单与实时状态（tas_bin_status） ============
router.get('/bins', requireRackDb, async (req, res) => {
  try {
    const mapCode = resolveMapCode(req.query.map_code);
    const params = [];
    let where = '';
    if (mapCode) { params.push(mapCode); where = 'WHERE map_code = $1'; }

    const result = await db.query(`
      SELECT
        bin_code,
        carrier_code,
        storage_code,
        map_code,
        ind_lock,
        lock_source,
        out_capacity,
        in_capacity,
        CASE WHEN carrier_code IS NOT NULL AND carrier_code != '' THEN true ELSE false END as has_goods,
        CASE WHEN COALESCE(ind_lock, 0) <> 0 THEN true ELSE false END as is_locked,
        update_time
      FROM tas_bin_status
      ${where}
      ORDER BY bin_code
    `, params);

    const rows = result.rows;
    const occupied = rows.filter(r => r.has_goods).length;
    const locked = rows.filter(r => r.is_locked).length;
    res.json({
      success: true,
      data: rows,
      summary: {
        total: rows.length,
        occupied,
        empty: rows.length - occupied,
        locked
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取仓位清单失败', error: e.message });
  }
});

// ============ 汇总统计 ============
router.get('/summary', requireRackDb, async (req, res) => {
  try {
    const mapCode = resolveMapCode(req.query.map_code);
    const params = [];
    let where = '';
    if (mapCode) { params.push(mapCode); where = 'WHERE map_code = $1'; }
    const result = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN carrier_code IS NOT NULL AND carrier_code != '' THEN 1 ELSE 0 END) AS occupied,
        SUM(CASE WHEN COALESCE(ind_lock, 0) <> 0 THEN 1 ELSE 0 END) AS locked
      FROM tas_bin_status
      ${where}
    `, params);
    const r = result.rows[0];
    const total = parseInt(r.total) || 0;
    const occupied = parseInt(r.occupied) || 0;
    res.json({
      success: true,
      data: {
        total,
        occupied,
        empty: total - occupied,
        locked: parseInt(r.locked) || 0,
        occRate: total ? Math.round(occupied / total * 100) : 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取汇总失败', error: e.message });
  }
});

// ============ 料箱/车号/任务号 查询（tas_task_chain_his + tas_task_chain） ============
router.get('/tasks', requireRackDb, async (req, res) => {
  try {
    const { carrier_code, amr_code, task_chain_code, device_type } = req.query;

    let queryField, queryValue, timeCondition = '', limitClause = '';
    if (device_type === 'forklift' && amr_code) {
      queryField = 'amr_code'; queryValue = amr_code;
      limitClause = 'LIMIT 20';
    } else if (device_type === 'taskcode' && task_chain_code) {
      queryField = 'task_chain_code'; queryValue = task_chain_code;
    } else if (device_type === 'ctu' && carrier_code) {
      queryField = 'carrier_code'; queryValue = carrier_code;
      timeCondition = "AND create_time >= NOW() - INTERVAL '7 days'";
    } else {
      return res.status(400).json({ success: false, message: '查询参数不能为空' });
    }

    const sql = `
      SELECT carrier_code, task_chain_code, task_chain_type, create_time,
             start_route_code, task_status, end_route_code, map_code, amr_code,
             TO_CHAR(create_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as create_time_formatted,
             'his' as table_source
      FROM tas_task_chain_his
      WHERE ${queryField} = $1 ${timeCondition}
      UNION ALL
      SELECT carrier_code, task_chain_code, task_chain_type, create_time,
             start_route_code, task_status, end_route_code, map_code, amr_code,
             TO_CHAR(create_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as create_time_formatted,
             'current' as table_source
      FROM tas_task_chain
      WHERE ${queryField} = $1 ${timeCondition}
      ORDER BY create_time DESC
      ${limitClause}
    `;
    const result = await db.query(sql, [queryValue]);
    await ensureRackMapNames();
    const data = processRackTaskRows(result.rows);
    res.json({ success: true, data, count: data.length });
  } catch (e) {
    res.status(500).json({ success: false, message: '料箱任务查询失败', error: e.message });
  }
});

// ============ 正在执行任务（排除 0/5/9，近 1 天） ============
router.get('/executing-tasks', requireRackDb, async (req, res) => {
  try {
    const mapCode = resolveMapCode(req.query.map_code);
    const params = [];
    let mapCond = '';
    if (mapCode) { params.push(mapCode); mapCond = 'AND map_code = $1'; }

    const sql = `
      SELECT carrier_code, task_chain_code, task_chain_type, create_time,
             start_route_code, task_status, end_route_code, map_code, amr_code,
             TO_CHAR(create_time AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as create_time_formatted,
             'current' as table_source
      FROM tas_task_chain
      WHERE task_status::text NOT IN ('0','5','9')
        AND create_time >= NOW() - INTERVAL '1 day'
        ${mapCond}
      ORDER BY create_time DESC
    `;
    const result = await db.query(sql, params);
    await ensureRackMapNames();
    const data = processRackTaskRows(result.rows);
    res.json({
      success: true,
      data,
      count: data.length,
      query_info: { status_filter: '排除 未执行(0)/已取消(5)/已结束(9)', time_range: '最近 1 天', map_code: mapCode || 'all' }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '正在执行任务查询失败', error: e.message });
  }
});

module.exports = router;
