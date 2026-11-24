const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const DB_CONFIG_FILE = path.join(__dirname, 'db_config.json');

let pool = null;
let lastConfigStr = null;

/**
 * 加载数据库配置
 */
function loadDbConfig() {
  try {
    if (fs.existsSync(DB_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(DB_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[db] 读取数据库配置失败:', e.message);
  }
  return null;
}

/**
 * 保存数据库配置
 */
function saveDbConfig(config) {
  fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 创建新连接池
 */
function createPool(config) {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

/**
 * 强制重建连接池（用最新配置）
 */
function rebuildPool() {
  const cfg = loadDbConfig();
  if (!cfg) throw new Error('数据库未配置，请先登录');
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  pool = createPool(cfg);
  lastConfigStr = JSON.stringify(cfg);
  console.log('[db] 连接池已重建');
  return pool;
}

/**
 * 获取连接池
 * 每次检查配置是否变化，变了就重建；出错也重建
 */
function getPool() {
  const cfg = loadDbConfig();
  if (!cfg) {
    if (!pool) throw new Error('数据库未配置，请先登录');
    return pool;
  }
  const cfgStr = JSON.stringify(cfg);
  if (!pool || cfgStr !== lastConfigStr) {
    if (pool) pool.end().catch(() => {});
    pool = createPool(cfg);
    lastConfigStr = cfgStr;
    console.log('[db] 配置变化，连接池已重建');
  }
  return pool;
}

/**
 * 执行查询（连接失败时自动重建连接池重试一次）
 */
async function query(text, params) {
  try {
    const client = await getPool().connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code && err.code.startsWith('28')) {
      console.error('[db] 认证失败，尝试重建连接池:', err.message);
      rebuildPool();
      const client = await getPool().connect();
      try {
        return await client.query(text, params);
      } finally {
        client.release();
      }
    }
    throw err;
  }
}

/**
 * 测试数据库连接
 */
async function testDbConnection(config) {
  const testPool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000,
  });
  try {
    await testPool.query('SELECT 1');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await testPool.end();
  }
}

// 同时导出两种命名，兼容不同调用方式
module.exports = {
  initPool: rebuildPool,
  getPool,
  query,
  testDbConnection,
  loadDbConfig,
  saveDbConfig,
  rebuildPool,
  DB_CONFIG_FILE: DB_CONFIG_FILE,
  // 兼容 site-status 的命名
  initDB: rebuildPool,
  testDBConnection: testDbConnection,
  loadConfig: loadDbConfig,
  saveConfig: saveDbConfig,
};
