#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * AGV 告警推送中心 - 主服务
 * 功能：告警查询、项目配置、微信推送、服务配置
 */

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');
const db = require('./db');
const { getPool, testDbConnection, initPool } = db;
const { alarmTypeMap, getAlarmTypeText } = require('./alarm_types');

// ============ 配置文件路径 ============
const SERVICE_CONFIG_FILE = path.join(__dirname, 'service_config.json');

// ============ 默认配置 ============
const DEFAULT_SERVICE_CONFIG = {
  port: 6007,
  projectName: 'AGV功能集成平台',
  webhookUrls: [],
  pushEnabled: true,
  pushInterval: 10,
  pushLevels: [1, 2, 3],
  dingtalkWebhookUrls: [],
  dingtalkPushEnabled: false,
  dingtalkKeyword: '',
  feishuWebhookUrls: [],
  feishuPushEnabled: false,
  wechatOaEnabled: false,
  wechatOaAppId: '',
  wechatOaAppSecret: '',
  wechatOaTemplateId: '',
  wechatOaOpenIds: ''
};

// ============ 读取配置文件 ============
function loadServiceConfig() {
  try {
    if (fs.existsSync(SERVICE_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(SERVICE_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('读取服务配置失败:', e.message);
  }
  return DEFAULT_SERVICE_CONFIG;
}

function saveServiceConfig(config) {
  fs.writeFileSync(SERVICE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// 兼容旧版单URL配置，自动转为数组
function normalizeWebhookUrls(config) {
  if (config.webhookUrl && !config.webhookUrls) {
    config.webhookUrls = [config.webhookUrl];
  }
  if (!Array.isArray(config.webhookUrls)) config.webhookUrls = [];
  if (config.dingtalkWebhookUrl && !config.dingtalkWebhookUrls) {
    config.dingtalkWebhookUrls = [config.dingtalkWebhookUrl];
  }
  if (!Array.isArray(config.dingtalkWebhookUrls)) config.dingtalkWebhookUrls = [];
  if (config.feishuWebhookUrl && !config.feishuWebhookUrls) {
    config.feishuWebhookUrls = [config.feishuWebhookUrl];
  }
  if (!Array.isArray(config.feishuWebhookUrls)) config.feishuWebhookUrls = [];
  return config;
}

// ============ 全局变量 ============
let dbConfig = db.loadDbConfig() || {};
let serviceConfig = normalizeWebhookUrls(loadServiceConfig());
let currentProjectName = serviceConfig.projectName || DEFAULT_SERVICE_CONFIG.projectName;
let lastAlarmCheckTime = new Date();
const PUSHER_INTERVAL = (serviceConfig.pushInterval || 10) * 1000;

// 微信公众号 access_token 缓存
let wechatOaAccessToken = '';
let wechatOaTokenExpireTime = 0;
async function getWechatOaAccessToken() {
  const now = Date.now();
  if (wechatOaAccessToken && now < wechatOaTokenExpireTime) {
    return wechatOaAccessToken;
  }
  const appId = serviceConfig.wechatOaAppId || '';
  const appSecret = serviceConfig.wechatOaAppSecret || '';
  if (!appId || !appSecret) throw new Error('微信公众号 appId/appSecret 未配置');
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await axios.get(url, { timeout: 10000 });
  if (res.data && res.data.access_token) {
    wechatOaAccessToken = res.data.access_token;
    // 提前 5 分钟过期
    wechatOaTokenExpireTime = now + (res.data.expires_in || 7200) * 1000 - 300000;
    return wechatOaAccessToken;
  }
  throw new Error('获取 access_token 失败：' + JSON.stringify(res.data));
}

// ============ Express 应用 ============
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || serviceConfig.port || 6007;

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// 静态文件：优先使用 Vue 前端构建产物 dist/，未构建时回退旧版 public/
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

// 根据设备自动跳转
app.get('/', (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|phone|micromessenger/i.test(ua);
  res.redirect(isMobile ? '/mobile.html' : '/index.html');
});

// ============ API 路由 ============
const agvRoutes = require('./routes/agv');
app.use('/api/agv', agvRoutes);

// 货架监控路由（独立数据库连接：rack_config.json）
const rackRoutes = require('./routes/rack');
app.use('/api/rack', rackRoutes);

// 料箱码/托盘码管理路由（自包含 JSON 文件：boxcode_data.json，不写业务库）
const boxcodeRoutes = require('./routes/boxcode');
app.use('/api/boxcode', boxcodeRoutes);

// ============ API：数据库配置 ============

// 获取数据库配置（不返回密码）
app.get('/api/db-config', (req, res) => {
  res.json({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    hasPassword: !!dbConfig.password
  });
});

// 保存数据库配置
app.post('/api/db-config', async (req, res) => {
  try {
    const { host, port, database, user, password } = req.body;
    if (!host || !port || !database || !user) {
      return res.status(400).json({ success: false, message: '请填写完整的数据库配置' });
    }
    const newConfig = {
      host,
      port: Number(port),
      database,
      user,
      password: password || dbConfig.password
    };
    // 测试连接
    const testResult = await testDbConnection(newConfig);
    if (!testResult.ok) {
      return res.status(400).json({ success: false, message: '数据库连接失败：' + testResult.error });
    }
    // 保存并重新初始化（同时更新 server 和 db 两个池）
    dbConfig = newConfig;
    db.saveDbConfig(newConfig);
    db.initPool(newConfig);
    try { getPool(); } catch(e) {}  // 触发 server 侧池初始化
    res.json({ success: true, message: '数据库配置已保存并生效' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 测试数据库连接
app.post('/api/db-config/test', async (req, res) => {
  try {
    const { host, port, database, user, password } = req.body;
    if (!host || !port || !database || !user) {
      return res.status(400).json({ success: false, message: '请填写完整的数据库连接信息' });
    }
    const result = await testDbConnection({
      host, port: Number(port), database, user,
      password: password || dbConfig.password
    });
    if (result.ok) {
      res.json({ success: true, message: '数据库连接成功！' });
    } else {
      res.status(400).json({ success: false, message: result.error });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：服务配置 ============

app.get('/api/service-config', (req, res) => {
  res.json(serviceConfig);
});

app.post('/api/service-config', (req, res) => {
  try {
    const { projectName, pushEnabled, pushInterval, pushLevels } = req.body;
    if (projectName !== undefined) serviceConfig.projectName = projectName;
    if (pushEnabled !== undefined) serviceConfig.pushEnabled = pushEnabled;
    if (pushInterval !== undefined) serviceConfig.pushInterval = Number(pushInterval);
    if (pushLevels !== undefined) serviceConfig.pushLevels = pushLevels;
    if (req.body.webhookUrls !== undefined) serviceConfig.webhookUrls = req.body.webhookUrls;
    if (req.body.dingtalkWebhookUrls !== undefined) serviceConfig.dingtalkWebhookUrls = req.body.dingtalkWebhookUrls;
    if (req.body.dingtalkPushEnabled !== undefined) serviceConfig.dingtalkPushEnabled = req.body.dingtalkPushEnabled;
    if (req.body.dingtalkKeyword !== undefined) serviceConfig.dingtalkKeyword = req.body.dingtalkKeyword;
    if (req.body.feishuWebhookUrls !== undefined) serviceConfig.feishuWebhookUrls = req.body.feishuWebhookUrls;
    if (req.body.feishuPushEnabled !== undefined) serviceConfig.feishuPushEnabled = req.body.feishuPushEnabled;

    currentProjectName = serviceConfig.projectName;

    saveServiceConfig(serviceConfig);
    res.json({ success: true, message: '服务配置已保存，部分配置需重启生效' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：项目配置（兼容前端 config.js） ============
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      projectName: currentProjectName,
      webhookUrls: serviceConfig.webhookUrls || [],
      pushEnabled: serviceConfig.pushEnabled,
      pushInterval: serviceConfig.pushInterval,
      pushLevels: serviceConfig.pushLevels,
      dingtalkWebhookUrls: serviceConfig.dingtalkWebhookUrls || [],
      dingtalkPushEnabled: serviceConfig.dingtalkPushEnabled || false,
      dingtalkKeyword: serviceConfig.dingtalkKeyword || '',
      feishuWebhookUrls: serviceConfig.feishuWebhookUrls || [],
      feishuPushEnabled: serviceConfig.feishuPushEnabled || false,
      wechatOaEnabled: serviceConfig.wechatOaEnabled || false,
      wechatOaAppId: serviceConfig.wechatOaAppId || '',
      wechatOaAppSecret: serviceConfig.wechatOaAppSecret || '',
      wechatOaTemplateId: serviceConfig.wechatOaTemplateId || '',
      wechatOaOpenIds: serviceConfig.wechatOaOpenIds || ''
    }
  });
});

app.post('/api/config', (req, res) => {
  try {
    const body = req.body;
    const projectName = body.projectName !== undefined ? body.projectName : body.project_name;
    const pushEnabled = body.pushEnabled !== undefined ? body.pushEnabled : body.push_enabled;
    const pushInterval = body.pushInterval !== undefined ? body.pushInterval : body.push_interval;
    const pushLevels  = body.pushLevels !== undefined ? body.pushLevels : body.push_levels;

    if (projectName !== undefined) {
      serviceConfig.projectName = projectName;
      currentProjectName = projectName;
    }
    if (pushEnabled !== undefined) serviceConfig.pushEnabled = pushEnabled;
    if (pushInterval !== undefined) serviceConfig.pushInterval = Number(pushInterval);
    if (pushLevels !== undefined) serviceConfig.pushLevels = pushLevels;
    // 企微多webhook
    if (body.webhookUrls !== undefined) serviceConfig.webhookUrls = body.webhookUrls;
    // 钉钉多webhook
    if (body.dingtalkWebhookUrls !== undefined) serviceConfig.dingtalkWebhookUrls = body.dingtalkWebhookUrls;
    const dingtalkPushEnabled = body.dingtalkPushEnabled !== undefined ? body.dingtalkPushEnabled : body.dingtalk_push_enabled;
    if (dingtalkPushEnabled !== undefined) serviceConfig.dingtalkPushEnabled = dingtalkPushEnabled;
    const dingtalkKeyword = body.dingtalkKeyword !== undefined ? body.dingtalkKeyword : body.dingtalk_keyword;
    if (dingtalkKeyword !== undefined) serviceConfig.dingtalkKeyword = dingtalkKeyword;
    // 飞书多webhook
    if (body.feishuWebhookUrls !== undefined) serviceConfig.feishuWebhookUrls = body.feishuWebhookUrls;
    const feishuPushEnabled = body.feishuPushEnabled !== undefined ? body.feishuPushEnabled : body.feishu_push_enabled;
    if (feishuPushEnabled !== undefined) serviceConfig.feishuPushEnabled = feishuPushEnabled;
    // 微信公众号配置
    if (body.wechatOaEnabled !== undefined) serviceConfig.wechatOaEnabled = body.wechatOaEnabled;
    if (body.wechatOaAppId !== undefined) serviceConfig.wechatOaAppId = body.wechatOaAppId;
    if (body.wechatOaAppSecret !== undefined) serviceConfig.wechatOaAppSecret = body.wechatOaAppSecret;
    if (body.wechatOaTemplateId !== undefined) serviceConfig.wechatOaTemplateId = body.wechatOaTemplateId;
    if (body.wechatOaOpenIds !== undefined) serviceConfig.wechatOaOpenIds = body.wechatOaOpenIds;

    saveServiceConfig(serviceConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：手动任务链接（存于本地 service_config.json，避免污染客户 cms_web 库） ============
const CONFIG_FILE = path.join(__dirname, 'service_config.json');

function readConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function writeConfigFile(obj) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// 获取手动任务链接
app.get('/api/manual-task-url', async (req, res) => {
  try {
    const cfg = readConfigFile();
    const url = (cfg.manual_task_url || '').trim();
    res.json({ success: true, url });
  } catch (e) {
    res.json({ success: false, url: '', message: e.message });
  }
});

// 保存手动任务链接（写入本地文件，多端共用、不污染客户业务库）
app.post('/api/manual-task-url', async (req, res) => {
  try {
    const url = ((req.body && req.body.url) || '').trim();
    const cfg = readConfigFile();
    cfg.manual_task_url = url;
    writeConfigFile(cfg);
    res.json({ success: true, message: '手动任务链接已保存到本地文件' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ============ API：测试推送（同时记录到推送历史） ============
// 测试微信公众号推送
app.get('/api/test-wechat-oa', async (req, res) => {
  try {
    const testAlarm = {
      source_code: 'TEST_OA',
      log_level: 3,
      end_date: null,
      begin_date_formatted: new Date().toISOString().slice(0, 19).replace('T', ' '),
      elc_map_code: '测试区域',
      alarm_detail: '这是一条公众号推送测试消息'
    };
    const result = await pushAlarmToWechatOA(testAlarm);
    res.json({ success: true, result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/api/test-push', async (req, res) => {
  try {
    const project = currentProjectName || 'AGV告警查询及推送配置';
    const nowStr = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});
    let results = [];

    // 企业微信（遍历所有webhook）
    if (serviceConfig.pushEnabled) {
      const wechatUrls = serviceConfig.webhookUrls || [];
      for (const wUrl of wechatUrls) {
        if (!wUrl) continue;
        const text = [
          `🚨 ${project} - 测试推送`,
          ``,
          `这是一条测试消息，确认 Webhook 配置正确。`,
          `时间：${nowStr}`,
        ].join('\n');
        const wechatStartTime = Date.now();
        try {
          const response = await axios.post(wUrl, { msgtype: 'text', text: { content: text } }, { timeout: 15000 });
          const durationMs = Date.now() - wechatStartTime;
          const ok = response.data && response.data.errcode === 0;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（企微）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: ok ? 'success' : 'failed', error_msg: ok ? '' : JSON.stringify(response.data), push_target: '企微', duration_ms: durationMs, message_detail: text });
          results.push('企微(' + (wechatUrls.indexOf(wUrl)+1) + ')：' + (ok ? '成功' : '失败'));
        } catch (e) {
          const durationMs = Date.now() - wechatStartTime;
          const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（企微）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: 'failed', error_msg: errMsg, push_target: '企微', duration_ms: durationMs, message_detail: text });
          results.push('企微(' + (wechatUrls.indexOf(wUrl)+1) + ')：失败');
        }
      }
    }

    // 钉钉（遍历所有webhook）
    if (serviceConfig.dingtalkPushEnabled) {
      const dtUrls = serviceConfig.dingtalkWebhookUrls || [];
      for (const dtUrl of dtUrls) {
        if (!dtUrl) continue;
        const text = `告警\n\n🚨 ${project} - 测试推送\n\n这是一条测试消息，确认 Webhook 配置正确。\n时间：${nowStr}`;
        const dtStartTime = Date.now();
        try {
          const response = await axios.post(dtUrl, { msgtype: 'text', text: { content: text } }, { timeout: 15000 });
          const durationMs = Date.now() - dtStartTime;
          const ok = response.data && response.data.errcode === 0;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（钉钉）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: ok ? 'success' : 'failed', error_msg: ok ? '' : JSON.stringify(response.data), push_target: '钉钉', duration_ms: durationMs, message_detail: text });
          results.push('钉钉(' + (dtUrls.indexOf(dtUrl)+1) + ')：' + (ok ? '成功' : '失败'));
        } catch (e) {
          const durationMs = Date.now() - dtStartTime;
          const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（钉钉）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: 'failed', error_msg: errMsg, push_target: '钉钉', duration_ms: durationMs, message_detail: text });
          results.push('钉钉(' + (dtUrls.indexOf(dtUrl)+1) + ')：失败');
        }
      }
    }

    // 飞书（遍历所有webhook）
    if (serviceConfig.feishuPushEnabled) {
      const fsUrls = serviceConfig.feishuWebhookUrls || [];
      for (const fsUrl of fsUrls) {
        if (!fsUrl) continue;
        const text = `🚨 ${project} - 测试推送\n\n这是一条测试消息，确认 Webhook 配置正确。\n时间：${nowStr}`;
        const fsStartTime = Date.now();
        try {
          const response = await axios.post(fsUrl, { msg_type: 'text', content: { text: text } }, { timeout: 15000 });
          const durationMs = Date.now() - fsStartTime;
          const ok = response.data && response.data.code === 0;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（飞书）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: ok ? 'success' : 'failed', error_msg: ok ? '' : JSON.stringify(response.data), push_target: '飞书', duration_ms: durationMs, message_detail: text });
          results.push('飞书(' + (fsUrls.indexOf(fsUrl)+1) + ')：' + (ok ? '成功' : '失败'));
        } catch (e) {
          const durationMs = Date.now() - fsStartTime;
          const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
          appendPushHistory({ source_code: 'TEST', log_level: 0, alarm_detail: '测试推送消息（飞书）', push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "), status: 'failed', error_msg: errMsg, push_target: '飞书', duration_ms: durationMs, message_detail: text });
          results.push('飞书(' + (fsUrls.indexOf(fsUrl)+1) + ')：失败');
        }
      }
    }

    const pushMsg = results.length > 0 ? results.join('；') : '没有已开启的推送平台，请先在配置中开启推送开关';
    res.json({ success: true, message: pushMsg });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：测试插入告警（插入后由自动推送扫描，不主动推送） ============
app.post('/api/test-insert-alarm', async (req, res) => {
  try {
    const now = new Date();
    const deviceCode = 'TEST_' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 从映射表随机选择告警类型
    const mainTypes = Object.keys(alarmTypeMap).map(Number);
    const randomMainType = mainTypes[Math.floor(Math.random() * mainTypes.length)];
    const mainInfo = alarmTypeMap[randomMainType];
    const minorTypes = Object.keys(mainInfo.minorTypes).map(Number);
    const randomMinorType = minorTypes.length > 0 ? minorTypes[Math.floor(Math.random() * minorTypes.length)] : null;
    const alarmTypeName = randomMinorType ? mainInfo.minorTypes[randomMinorType] : mainInfo.mainName;

    const sql = `
      INSERT INTO cms_alarm_log
      (source_code, log_level, main_type_code, minor_type_code, alarm_detail, begin_date, create_time, content, alarm_x, alarm_y, elc_map_code)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    const params = [deviceCode, '3', String(randomMainType), randomMinorType ? String(randomMinorType) : null, alarmTypeName, now, now, alarmTypeName, Math.floor(Math.random() * 500 + 50), Math.floor(Math.random() * 300 + 50), 'TEST'];
    const result = await getPool().query(sql, params);
    const alarmId = result.rows[0].id;

    res.json({ success: true, message: '测试告警已插入数据库：' + mainInfo.mainName + ' / ' + alarmTypeName, alarmId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：告警查询 ============
app.get('/api/agv/alarm-history', async (req, res) => {
  try {
    const {
      source_code, log_level, alarm_status,
      begin_date, end_date,
      elc_map_code, alarm_content, hide_content,
      page = 1, page_size = 10
    } = req.query;

    let where = [];
    let params = [];
    let idx = 1;

    if (source_code)   { where.push(`source_code = $${idx++}`); params.push(source_code); }
    if (log_level)     { where.push(`log_level = $${idx++}`);   params.push(log_level); }
    if (alarm_status === '1' || alarm_status === 'start') { where.push(`end_date IS NULL`); }
    else if (alarm_status === '0' || alarm_status === 'end') { where.push(`end_date IS NOT NULL`); }
    if (begin_date)    { where.push(`begin_date >= $${idx++}`);  params.push(begin_date); }
    if (end_date)      { where.push(`end_date <= $${idx++}`);    params.push(end_date); }
    if (elc_map_code) { where.push(`elc_map_code LIKE $${idx++}`); params.push(`%${elc_map_code}%`); }
    if (alarm_content) { where.push(`alarm_detail LIKE $${idx++}`); params.push(`%${alarm_content}%`); }
    if (hide_content)  { where.push(`alarm_detail NOT LIKE $${idx++}`); params.push(`%${hide_content}%`); }

    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // 查询总数
    const countSql = `SELECT COUNT(*) AS total FROM cms_alarm_log ${whereStr}`;
    const countResult = await getPool().query(countSql, params);
    const total = Number(countResult.rows[0].total);

    // 查询数据
    const offset = (Number(page) - 1) * Number(page_size);
    const dataSql = `
      SELECT
        source_code, main_type_code, minor_type_code,
        alarm_detail, alarm_status, log_level,
        TO_CHAR(begin_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS begin_date_formatted,
        TO_CHAR(end_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS end_date_formatted,
        elc_map_code, alarm_x, alarm_y
      FROM cms_alarm_log
      ${whereStr}
      ORDER BY begin_date DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const dataParams = [...params, Number(page_size), offset];
    const dataResult = await getPool().query(dataSql, dataParams);

    res.json({
      success: true,
      data: dataResult.rows,
      total,
      page: Number(page),
      page_size: Number(page_size),
      total_pages: Math.ceil(total / page_size)
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：告警导出 ============
app.get('/api/agv/alarm-history/export', async (req, res) => {
  try {
    const {
      source_code, log_level, alarm_status,
      begin_date, end_date,
      elc_map_code, alarm_content, hide_content,
    } = req.query;

    let where = [];
    let params = [];
    let idx = 1;

    if (source_code)   { where.push(`source_code = $${idx++}`); params.push(source_code); }
    if (log_level)     { where.push(`log_level = $${idx++}`);   params.push(log_level); }
    if (alarm_status === '1' || alarm_status === 'start') { where.push(`end_date IS NULL`); }
    else if (alarm_status === '0' || alarm_status === 'end') { where.push(`end_date IS NOT NULL`); }
    if (begin_date)    { where.push(`begin_date >= $${idx++}`);  params.push(begin_date); }
    if (end_date)      { where.push(`end_date <= $${idx++}`);    params.push(end_date); }
    if (elc_map_code) { where.push(`elc_map_code LIKE $${idx++}`); params.push(`%${elc_map_code}%`); }
    if (alarm_content) { where.push(`alarm_detail LIKE $${idx++}`); params.push(`%${alarm_content}%`); }
    if (hide_content)  { where.push(`alarm_detail NOT LIKE $${idx++}`); params.push(`%${hide_content}%`); }

    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `
      SELECT
        source_code AS "设备编号",
        CASE log_level WHEN '1' THEN '低' WHEN '2' THEN '中' WHEN '3' THEN '严重' ELSE '未知' END AS "告警等级",
        CASE WHEN end_date IS NOT NULL THEN '结束' WHEN begin_date IS NOT NULL THEN '开始' ELSE '未知' END AS "告警状态",
        alarm_detail AS "告警详情",
        TO_CHAR(begin_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS "开始时间",
        TO_CHAR(end_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS "结束时间",
        elc_map_code AS "区域",
        alarm_x AS "X坐标",
        alarm_y AS "Y坐标"
      FROM cms_alarm_log
      ${whereStr}
      ORDER BY begin_date DESC
    `;
    const result = await getPool().query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '没有数据' });
    }

    // 生成 XLS 文件
    const ws = XLSX.utils.json_to_sheet(result.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '告警记录');

    // 设置列宽
    ws['!cols'] = [
      { wch: 15 }, // 设备编号
      { wch: 10 }, // 告警等级
      { wch: 10 }, // 告警状态
      { wch: 40 }, // 告警详情
      { wch: 20 }, // 开始时间
      { wch: 20 }, // 结束时间
      { wch: 12 }, // 区域
      { wch: 10 }, // X坐标
      { wch: 10 }, // Y坐标
    ];

    const excelBuffer = XLSX.write(wb, { bookType: 'xls', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="alarm_export.xls"');
    res.send(excelBuffer);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ API：推送历史 ============
const PUSH_HISTORY_FILE = path.join(__dirname, 'push_history.log');

function appendPushHistory(record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(PUSH_HISTORY_FILE, line, 'utf-8');
}

app.get('/api/push-history', (req, res) => {
  try {
    const { start_date, end_date, status, page = 1, page_size = 20 } = req.query;

    if (!fs.existsSync(PUSH_HISTORY_FILE)) {
      return res.json({ success: true, data: [], total: 0, page: Number(page), page_size: Number(page_size), total_pages: 0 });
    }
    const lines = fs.readFileSync(PUSH_HISTORY_FILE, 'utf-8').trim().split('\n').filter(Boolean);
    let records = lines.map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);

    // 过滤
    if (start_date) {
      records = records.filter(r => r.push_time && r.push_time >= start_date);
    }
    if (end_date) {
      records = records.filter(r => r.push_time && r.push_time <= end_date + 'T23:59:59');
    }
    if (status) {
      records = records.filter(r => r.status === status);
    }
    if (req.query.push_target) {
      records = records.filter(r => r.push_target === req.query.push_target);
    }

    // 按时间倒序
    records.sort((a, b) => (b.push_time || '').localeCompare(a.push_time || ''));

    const total = records.length;
    const offset = (Number(page) - 1) * Number(page_size);
    const paged = records.slice(offset, offset + Number(page_size));

    res.json({
      success: true,
      data: paged,
      total,
      page: Number(page),
      page_size: Number(page_size),
      total_pages: Math.ceil(total / page_size)
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/push-history', (req, res) => {
  try {
    if (fs.existsSync(PUSH_HISTORY_FILE)) {
      fs.writeFileSync(PUSH_HISTORY_FILE, '', 'utf-8');
    }
    res.json({ success: true, message: '推送历史已清空' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============ 健康检查 ============
app.get('/health', (req, res) => {
  res.json({ ok: true, project: currentProjectName, port: PORT });
});

// ============ 告警自动推送 ============
let isCheckingAlarms = false;

// 区域名称缓存
let cachedAreaNameMap = null;
async function loadAreaNameMap() {
  if (cachedAreaNameMap && Object.keys(cachedAreaNameMap).length > 0) return cachedAreaNameMap;
  try {
    const result = await getPool().query("SELECT map_code, map_name FROM public.cms_elc_map ORDER BY map_code");
    const map = {};
    for (const row of result.rows) {
      if (row.map_code) map[String(row.map_code).trim()] = String(row.map_name || '').trim();
    }
    cachedAreaNameMap = map;
  } catch (e) {
    console.error('[区域映射] 加载失败:', e.message);
    if (!cachedAreaNameMap) cachedAreaNameMap = {};
  }
  return cachedAreaNameMap;
}

function getAreaText(mapCode) {
  if (!mapCode) return '';
  const key = String(mapCode).trim();
  if (cachedAreaNameMap && cachedAreaNameMap[key]) {
    return cachedAreaNameMap[key] + ' (' + mapCode + ')';
  }
  // 缓存为空时尝试重新加载
  if (!cachedAreaNameMap || Object.keys(cachedAreaNameMap).length === 0) {
    loadAreaNameMap();
  }
  return mapCode;
}

function calcDuration(beginDate, endDate) {
  if (!beginDate) return '未知';
  try {
    const begin = new Date(beginDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffMs = end - begin;
    if (diffMs < 0) return '时间异常';
    const s = Math.floor(diffMs / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return d + '天' + (h % 24) + '小时' + (m % 60) + '分钟';
    if (h > 0) return h + '小时' + (m % 60) + '分钟' + (s % 60) + '秒';
    if (m > 0) return m + '分钟' + (s % 60) + '秒';
    return s + '秒';
  } catch { return '未知'; }
}

async function pushAlarmToWechat(alarm, url) {
  const levelMap = { 1: '低', 2: '中', 3: '严重' };
  const project = currentProjectName || 'AGV告警查询及推送配置';
  const typeInfo = getAlarmTypeText(alarm.main_type_code, alarm.minor_type_code);
  const alarmType = [typeInfo.mainTypeText, typeInfo.minorTypeText].filter(Boolean).join(' / ');
  const isEnded = isAlarmEnded(alarm);
  const statusText = isEnded ? '告警已恢复' : '告警开始';

  const coord = (alarm.alarm_x || alarm.alarm_y) ? `X:${alarm.alarm_x || '-'} Y:${alarm.alarm_y || '-'}` : '';
  const duration = calcDuration(alarm.begin_date, alarm.end_date);
  const areaText = getAreaText(alarm.elc_map_code);

  const text = [
    `🚨 ${project} - AGV 告警通知`,
    ``,
    `设备编号：${alarm.source_code || ''}`,
    `告警状态：${statusText}`,
    `告警等级：${levelMap[alarm.log_level] || '未知'}`,
    `开始时间：${alarm.begin_date_formatted || ''}`,
    isEnded ? `结束时间：${alarm.end_date_formatted || ''}` : '',
    isEnded ? `持续时间：${duration}` : '',
    `区域：${areaText}`,
    coord ? `区域坐标：${coord}` : '',
    ``,
    `告警详情：${alarmType || alarm.alarm_detail || ''}`,
  ].filter(Boolean).join('\n');

  const startTime = Date.now();
  try {
    const response = await axios.post(
      url,
      { msgtype: 'text', text: { content: text } },
      { timeout: 15000 }
    );
    const durationMs = Date.now() - startTime;
    const errcode = response.data && response.data.errcode;
    if (errcode !== 0) {
      return { ok: false, error: JSON.stringify(response.data), durationMs, messageDetail: text };
    }
    return { ok: true, durationMs, messageDetail: text };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
    return { ok: false, error: errMsg, durationMs, messageDetail: text };
  }
}

// 推送告警到钉钉机器人
async function pushAlarmToDingTalk(alarm, url) {
  const levelMap = { 1: '低', 2: '中', 3: '严重' };
  const project = currentProjectName || 'AGV告警查询及推送配置';
  const typeInfo = getAlarmTypeText(alarm.main_type_code, alarm.minor_type_code);
  const alarmType = [typeInfo.mainTypeText, typeInfo.minorTypeText].filter(Boolean).join(' / ');
  const isEnded = isAlarmEnded(alarm);
  const statusText = isEnded ? '告警已恢复' : '告警开始';

  const coord = (alarm.alarm_x || alarm.alarm_y) ? `X:${alarm.alarm_x || '-'} Y:${alarm.alarm_y || '-'}` : '';
  const dur = calcDuration(alarm.begin_date, alarm.end_date);
  const areaText = getAreaText(alarm.elc_map_code);

  const text = [
    `🚨 ${project} - AGV 告警通知`,
    ``,
    `设备编号： ${alarm.source_code || ''}`,
    `告警状态： ${statusText}`,
    `告警等级： ${levelMap[alarm.log_level] || '未知'}`,
    `开始时间： ${alarm.begin_date_formatted || ''}`,
    isEnded ? `结束时间： ${alarm.end_date_formatted || ''}` : '',
    isEnded ? `持续时间： ${dur}` : '',
    `区域： ${areaText}`,
    coord ? `区域坐标： ${coord}` : '',
    ``,
    `告警详情： ${alarmType || alarm.alarm_detail || ''}`,
  ].filter(Boolean).join('\n');

  // ===== 钉钉自定义关键词匹配规则（重要，改动前先看说明）=====
  // 钉钉群机器人的安全设置若选「自定义关键词」，钉钉会校验消息内容：
  // 消息必须包含设置的关键词之一，否则直接拒绝推送（errcode 310000：没有匹配到关键词）。
  // 本系统统一约定关键词为「告警」，因此在正文最前面插入「告警」二字来通过钉钉校验。
  // 使用者须知：必须在钉钉群机器人 -> 安全设置 -> 自定义关键词 里添加「告警」，
  //   否则即使 Webhook 配置正确也收不到任何推送。
  // 注意：此处为硬编码「告警」，与 service_config.json 的 dingtalkKeyword 字段无关
  //   （该字段目前仅由前端保存、后端推送逻辑未读取，属预留字段）。
  const finalText = '告警\n\n' + text;

  const startTime = Date.now();
  try {
    const response = await axios.post(
      url,
      { msgtype: 'text', text: { content: finalText } },
      { timeout: 15000 }
    );
    const durationMs = Date.now() - startTime;
    // 钉钉 API：errcode === 0 才是成功
    const errcode = response.data && response.data.errcode;
    if (errcode !== 0) {
      return { ok: false, error: JSON.stringify(response.data), durationMs, messageDetail: text };
    }
    return { ok: true, durationMs, messageDetail: text };
  } catch (e) {
    // 优先取钉钉API返回的错误内容
    const durationMs = Date.now() - startTime;
    const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
    return { ok: false, error: errMsg, durationMs, messageDetail: text };
  }
}

// 推送告警到飞书机器人
async function pushAlarmToFeishu(alarm, url) {
  const levelMap = { 1: '低', 2: '中', 3: '严重' };
  const project = currentProjectName || 'AGV告警查询及推送配置';
  const typeInfo = getAlarmTypeText(alarm.main_type_code, alarm.minor_type_code);
  const alarmType = [typeInfo.mainTypeText, typeInfo.minorTypeText].filter(Boolean).join(' / ');
  const isEnded = isAlarmEnded(alarm);
  const statusText = isEnded ? '告警已恢复' : '告警开始';

  const coord = (alarm.alarm_x || alarm.alarm_y) ? `X:${alarm.alarm_x || '-'} Y:${alarm.alarm_y || '-'}` : '';
  const dur = calcDuration(alarm.begin_date, alarm.end_date);
  const areaText = getAreaText(alarm.elc_map_code);

  const text = [
    `🚨 ${project} - AGV 告警通知`,
    ``,
    `设备编号：${alarm.source_code || ''}`,
    `告警状态：${statusText}`,
    `告警等级：${levelMap[alarm.log_level] || '未知'}`,
    `开始时间：${alarm.begin_date_formatted || ''}`,
    isEnded ? `结束时间：${alarm.end_date_formatted || ''}` : '',
    isEnded ? `持续时间：${dur}` : '',
    `区域：${areaText}`,
    coord ? `区域坐标：${coord}` : '',
    ``,
    `告警详情：${alarmType || alarm.alarm_detail || ''}`,
  ].filter(Boolean).join('\n');

  const startTime = Date.now();
  try {
    const response = await axios.post(
      url,
      { msg_type: 'text', content: { text: text } },
      { timeout: 15000 }
    );
    const durationMs = Date.now() - startTime;
    const ok = response.data && response.data.code === 0;
    if (!ok) {
      return { ok: false, error: JSON.stringify(response.data), durationMs, messageDetail: text };
    }
    return { ok: true, durationMs, messageDetail: text };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errMsg = (e.response && e.response.data && JSON.stringify(e.response.data)) || e.message;
    return { ok: false, error: errMsg, durationMs, messageDetail: text };
  }
}

function loadPushedKeys() {
  const keys = new Set();
  try {
    if (fs.existsSync(PUSH_HISTORY_FILE)) {
      const lines = fs.readFileSync(PUSH_HISTORY_FILE, 'utf-8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          if (rec.status === 'success' && rec.source_code && rec.alarm_begin_date) {
            keys.add(rec.source_code + '|' + rec.alarm_begin_date + '|' + (rec.push_type || 'start'));
          }
        } catch {}
      }
    }
  } catch {}
  return keys;
}

function isAlarmEnded(alarm) {
  return alarm.end_date !== null && alarm.end_date !== undefined && alarm.end_date !== '';
}

async function checkAndPushAlarms() {
  if (!serviceConfig.pushEnabled && !serviceConfig.dingtalkPushEnabled && !serviceConfig.feishuPushEnabled && !serviceConfig.wechatOaEnabled) return;
  if (isCheckingAlarms) return;
  isCheckingAlarms = true;

  try {
    // 确保区域名称映射已加载
    await loadAreaNameMap();
    const pushLevels = serviceConfig.pushLevels || [1, 2, 3];
    const pushedKeys = loadPushedKeys();

    const result = await getPool().query(`
      SELECT source_code, main_type_code, minor_type_code,
        alarm_detail, alarm_status, log_level,
        TO_CHAR(begin_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS begin_date_formatted,
        TO_CHAR(end_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS end_date_formatted,
        elc_map_code, alarm_x, alarm_y,
        begin_date, end_date
      FROM cms_alarm_log
      WHERE begin_date > NOW() - INTERVAL '24 hours'
      ORDER BY begin_date ASC
    `);

    let pushed = 0;
    for (const alarm of result.rows) {
      if (!pushLevels.includes(alarm.log_level)) continue;
      const id = (alarm.source_code || '') + '|' + (alarm.begin_date_formatted || '');
      const ended = isAlarmEnded(alarm);

      if (ended) {
        const startKey = id + '|start';
        if (pushedKeys.has(startKey) && !pushedKeys.has(id + '|end')) {
          await doPush(alarm, 'end', id);
          pushed++;
        }
      } else {
        if (!pushedKeys.has(id + '|start')) {
          await doPush(alarm, 'start', id);
          pushed++;
        }
      }
    }

    if (pushed > 0) console.log(`[告警推送] 推送了 ${pushed} 条`);
    lastAlarmCheckTime = new Date();
  } catch (e) {
    console.error('[告警推送] 错误:', e.message);
  } finally {
    isCheckingAlarms = false;
  }
}

async function doPush(alarm, type, alarmId) {
  const targets = [];
  if (serviceConfig.pushEnabled) {
    for (const u of (serviceConfig.webhookUrls || [])) {
      if (u) targets.push({ name: '企微', fn: pushAlarmToWechat, url: u });
    }
  }
  if (serviceConfig.dingtalkPushEnabled) {
    for (const u of (serviceConfig.dingtalkWebhookUrls || [])) {
      if (u) targets.push({ name: '钉钉', fn: pushAlarmToDingTalk, url: u });
    }
  }
  if (serviceConfig.feishuPushEnabled) {
    for (const u of (serviceConfig.feishuWebhookUrls || [])) {
      if (u) targets.push({ name: '飞书', fn: pushAlarmToFeishu, url: u });
    }
  }
  if (serviceConfig.wechatOaEnabled) targets.push({ name: '公众号', fn: pushAlarmToWechatOA, url: '' });

  for (const t of targets) {
    const result = await t.fn(alarm, t.url);
    appendPushHistory({
      source_code: alarm.source_code,
      log_level: alarm.log_level,
      push_time: new Date(Date.now()+8*3600*1000).toISOString().slice(0,19).replace("T"," "),
      status: result.ok ? 'success' : 'failed',
      error_msg: result.ok ? '' : result.error,
      push_target: t.name,
      duration_ms: result.durationMs || 0,
      message_detail: result.messageDetail || '',
      alarm_begin_date: alarm.begin_date_formatted || '',
      push_type: type
    });
  }
}


// 推送告警到微信公众号（模板消息）
async function pushAlarmToWechatOA(alarm) {
  const levelMap = { 1: '低', 2: '中', 3: '严重' };
  const project = currentProjectName || 'AGV告警查询及推送配置';
  const typeInfo = getAlarmTypeText(alarm.main_type_code, alarm.minor_type_code);
  const alarmType = [typeInfo.mainTypeText, typeInfo.minorTypeText].filter(Boolean).join(' / ');
  const isEnded = isAlarmEnded(alarm);
  const statusText = isEnded ? '告警已恢复' : '告警开始';

  const coord = (alarm.alarm_x || alarm.alarm_y) ? `X:${alarm.alarm_x || '-'} Y:${alarm.alarm_y || '-'}` : '';
  const dur = isEnded ? calcDuration(alarm.begin_date, alarm.end_date) : '';
  const areaText = getAreaText(alarm.elc_map_code);

  const openIds = (serviceConfig.wechatOaOpenIds || '').split(/[,;\r\n]/).map(s => s.trim()).filter(Boolean);
  if (openIds.length === 0) return { ok: false, error: '未配置 OpenID' };

  const accessToken = await getWechatOaAccessToken();
  const templateId = serviceConfig.wechatOaTemplateId || '';
  if (!templateId) {
    console.error('[公众号推送] 未配置模板ID');
    return { ok: false, error: '未配置模板ID' };
  }

  const startTime = Date.now();
  let allOk = true;
  let errMsg = '';

  for (const openId of openIds) {
    const data = {
      touser: openId,
      template_id: templateId,
      data: {
        first: { value: `${project} - AGV 告警通知\n`, color: '#e74c3c' },
        projectName: { value: project, color: '#e74c3c' },
        deviceNo: { value: alarm.source_code || '', color: '#333333' },
        level: { value: levelMap[alarm.log_level] || '未知', color: '#e67e22' },
        status: { value: statusText, color: isEnded ? '#999999' : '#e67e22' },
        startTime: { value: alarm.begin_date_formatted || '', color: '#333333' },
        endTime: { value: isEnded ? (alarm.end_date_formatted || '') : '-', color: '#333333' },
        duration: { value: dur || '-', color: '#333333' },
        area: { value: areaText || '-', color: '#333333' },
        coord: { value: coord || '-', color: '#333333' },
        detail: { value: alarmType || alarm.alarm_detail || '', color: '#e74c3c' },
        remark: { value: '请及时处理！', color: '#999999' }
      }
    };

    try {
        const response = await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
        data,
        { timeout: 15000 }
      );
        if (!response.data || response.data.errcode !== 0) {
        allOk = false;
        errMsg += (errMsg ? '；' : '') + (response.data ? response.data.errmsg : '未知错误');
        console.error('[公众号推送] 推送失败:', response.data);
      } else {
          }
    } catch (e) {
      allOk = false;
      errMsg += (errMsg ? '；' : '') + (e.message || '请求失败');
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    ok: allOk,
    error: errMsg,
    durationMs,
    messageDetail: `${project} - AGV 告警通知\n\n项目名称：${project}\n设备编号：${alarm.source_code || ''}\n告警等级：${levelMap[alarm.log_level] || '未知'}\n告警状态：${statusText}\n开始时间：${alarm.begin_date_formatted || ''}\n${isEnded ? '结束时间：' + (alarm.end_date_formatted || '') + '\n持续时间：' + dur + '\n' : ''}区域：${areaText}\n${coord ? '区域坐标：' + coord + '\n' : ''}\n告警详情：${alarmType || alarm.alarm_detail || ''}\n\n请及时处理！`
  };
}

// ============ 启动 ============

(async function init() {
  // 初始化数据库池（仅当配置存在时）
  if (dbConfig && dbConfig.host) {
    try {
      db.initPool(dbConfig);
      await db.getPool().query('SELECT 1');
      console.log('✅ 数据库连接成功');
    } catch (e) {
      console.warn('⚠️  数据库连接失败，请在服务配置页面重新设置：', e.message);
    }
  } else {
    console.warn('⚠️  未检测到数据库配置，请在服务配置页面设置数据库连接信息');
  }

  // 启动时加载区域名称映射
  await loadAreaNameMap();
  const areaCount = Object.keys(cachedAreaNameMap || {}).length;
  console.log(`✅ 已加载 ${areaCount} 条区域名称映射`);

  // 启动时检查推送历史
  try {
    if (fs.existsSync(PUSH_HISTORY_FILE)) {
      const lines = fs.readFileSync(PUSH_HISTORY_FILE, 'utf-8').trim().split('\n').filter(Boolean);
      console.log(`✅ 推送历史中有 ${lines.length} 条记录`);
    }
  } catch (e) {
    console.warn('⚠️ 读取推送历史失败：', e.message);
  }

  // ============ HTTPS 支持 ============
  const sslDir = path.join(__dirname, 'ssl');
  const sslCertPath = path.join(sslDir, 'cert.pem');
  const sslKeyPath = path.join(sslDir, 'key.pem');

  // 确保 ssl 目录存在
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  // 每次启动都重新生成自签名证书
  try {
    const forge = require('node-forge');
    console.log('🔑 正在生成自签名 SSL 证书...');
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{ name: 'subjectAltName', altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' }
    ]}]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    fs.writeFileSync(sslCertPath, forge.pki.certificateToPem(cert));
    fs.writeFileSync(sslKeyPath, forge.pki.privateKeyToPem(keys.privateKey));
    console.log('✅ SSL 证书已生成（自签名，有效期365天）');
  } catch (e) {
    console.error('❌ SSL 证书生成失败:', e.message);
  }

  // 启动 HTTP + HTTPS 双协议服务
  const httpsPort = Number(PORT) + 1;
  const startPushScheduler = () => {
    setInterval(checkAndPushAlarms, PUSHER_INTERVAL);
    console.log(`✅ 告警自动推送已启动，间隔 ${PUSHER_INTERVAL / 1000} 秒`);
  };

  // HTTP 主服务（端口 6007）
  app.listen(PORT, HOST, () => {
    console.log(`✅ AGV功能集成平台已启动（HTTP）：http://${HOST}:${PORT}`);
    startPushScheduler();
  });

  // HTTPS 服务（端口 6008）
  if (fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
    const sslOptions = {
      cert: fs.readFileSync(sslCertPath),
      key: fs.readFileSync(sslKeyPath)
    };
    https.createServer(sslOptions, app).listen(httpsPort, HOST, () => {
      console.log(`✅ HTTPS 服务已启动：https://${HOST}:${httpsPort}`);
    });
  } else {
    console.log('⚠️ SSL 证书不存在，HTTPS 服务未启动');
  }
})();
