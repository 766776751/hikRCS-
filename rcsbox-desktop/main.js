/**
 * rcsbox-desktop/main.js — Electron 桌面壳
 * ------------------------------------------------------------
 * 职责：
 *  1. 用 Electron 内置 Node (ELECTRON_RUN_AS_NODE=1) 启动后端 server.js，
 *     客户端机器无需另装 Node.js。
 *  2. 探测一个可用端口（默认 6007，被占用则自动 +1 找空闲），
 *     通过 PORT 环境变量传给后端，避免 EADDRINUSE。
 *  3. 轮询等待后端 HTTP 就绪后加载窗口；启动失败给出可读提示。
 *  4. 单实例锁、应用窗口、托盘、优雅退出（一并结束后端子进程）。
 */
'use strict';

const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');

// ------------------------------------------------------------
// 路径 / 常量
// ------------------------------------------------------------
const IS_DEV = !app.isPackaged;
// 开发环境直接用项目 app/（可写）；打包后用 resolveWritableAppDir() 动态决定
const BUNDLED_APP_DIR = IS_DEV
  ? path.join(__dirname, 'app')
  : path.join(process.resourcesPath, 'app-dist');
const ICON = path.join(__dirname, 'build', 'icon.ico');
const DEFAULT_PORT = 6007;
const PORT_SCAN_LIMIT = 30; // 最多向后找 30 个端口

/**
 * 解析后端运行时目录，确保「可写」。
 * 后端会写 db_config.json / service_config.json / boxcode_data.json / push_history.log / ssl，
 * 若安装到 C:\Program Files（只读）会 EPERM。
 * 策略：先探测内置目录是否可写；不可写则整体复制到 %APPDATA%/RCS工具拓展平台/runtime。
 * 已有降级副本则复用（保留用户之前保存的配置/数据），仅同步代码文件刷新。
 */
function resolveWritableAppDir() {
  if (isDirWritable(BUNDLED_APP_DIR)) return BUNDLED_APP_DIR;

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const fallback = path.join(appData, 'RCS工具拓展平台', 'runtime');
  try {
    fs.mkdirSync(fallback, { recursive: true });
    if (!isDirWritable(fallback)) throw new Error('用户目录不可写');

    // 数据文件：如果降级区已存在则保留（不覆盖用户已保存的配置/数据）
    const KEEP = ['db_config.json', 'service_config.json', 'rack_config.json',
                  'boxcode_data.json', 'push_history.log'];
    copyDirSelective(BUNDLED_APP_DIR, fallback, (rel) => {
      const name = path.basename(rel);
      return !(KEEP.includes(name) && fs.existsSync(path.join(fallback, rel)));
    });
    return fallback;
  } catch (e) {
    throw new Error(`无法创建可写的运行时目录：${e.message}`);
  }
}

/** 测试目录是否可写：写入再删除一个探针文件 */
function isDirWritable(dir) {
  try {
    if (!fs.existsSync(dir)) return false;
    const probe = path.join(dir, '.__writetest_' + Date.now());
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch (_) {
    return false;
  }
}

/** 递归复制目录，keepFn(相对路径) 返回 false 时跳过（用于保留已有数据文件） */
function copyDirSelective(src, dst, keepFn, rootSrc) {
  rootSrc = rootSrc || src;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDirSelective(s, d, keepFn, rootSrc);
    } else {
      // 相对根目录的路径，保证 keepFn 里能正确拼出 fallback 下对应位置
      const rel = path.relative(rootSrc, s);
      if (!keepFn || keepFn(rel)) fs.copyFileSync(s, d);
    }
  }
}

let APP_DIR = BUNDLED_APP_DIR; // boot() 中会被 resolveWritableAppDir() 覆盖
let SERVER_JS = path.join(APP_DIR, 'server.js');

let mainWindow = null;
let tray = null;
let serverProc = null;
let backendPort = DEFAULT_PORT;
let isQuitting = false;

// ------------------------------------------------------------
// 单实例锁：重复启动时聚焦已有窗口
// ------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ------------------------------------------------------------
// 端口探测
// ------------------------------------------------------------
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

async function pickPort() {
  // 尊重配置文件里的端口设置（若存在且与默认不同，优先用配置的）
  let base = DEFAULT_PORT;
  try {
    const sc = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'service_config.json'), 'utf8'));
    if (sc.port && Number.isInteger(Number(sc.port))) base = Number(sc.port);
  } catch (_) { /* 用默认 */ }

  for (let p = base; p < base + PORT_SCAN_LIMIT; p++) {
    // HTTPS 是 HTTP+1，两个端口都要空闲
    if ((await isPortFree(p)) && (await isPortFree(p + 1))) return p;
  }
  throw new Error(`端口 ${base}~${base + PORT_SCAN_LIMIT} 均被占用，无法启动服务`);
}

// ------------------------------------------------------------
// 启动后端子进程（Electron 内置 Node 作为运行时）
// ------------------------------------------------------------
function startServer(port) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SERVER_JS)) {
      reject(new Error(`找不到后端入口：${SERVER_JS}`));
      return;
    }
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' };
    // npm/node_modules 查找从 APP_DIR 开始（server.js 在 APP_DIR 下，require 自然解析同目录 node_modules）
    serverProc = spawn(process.execPath, [SERVER_JS], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let started = false;
    let errBuf = '';
    serverProc.stdout.on('data', (d) => {
      const s = d.toString();
      if (IS_DEV) process.stdout.write('[backend] ' + s);
      if (!started && /已启动|listen|started/i.test(s)) { started = true; resolve(); }
    });
    serverProc.stderr.on('data', (d) => {
      const s = d.toString();
      errBuf += s;
      if (IS_DEV) process.stderr.write('[backend:err] ' + s);
    });
    serverProc.once('error', (e) => { if (!started) reject(e); });
    serverProc.once('exit', (code, sig) => {
      if (!started) reject(new Error(`后端进程提前退出 (code=${code}, sig=${sig})\n${errBuf.slice(-1500)}`));
      else if (!isQuitting) {
        dialog.showErrorBox('服务已停止', `后端服务意外退出 (code=${code})。\n请重启本程序。\n\n${errBuf.slice(-800)}`);
      }
    });

    // 兜底：最多等 12 秒
    setTimeout(() => { if (!started) resolve(); }, 12000);
  });
}

// ------------------------------------------------------------
// 等待 HTTP 端口真正可访问
// ------------------------------------------------------------
function waitHttp(port, timeoutMs = 15000) {
  const http = require('http');
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => retry());
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() >= deadline) reject(new Error('后端服务启动超时'));
      else setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}

// ------------------------------------------------------------
// 创建主窗口
// ------------------------------------------------------------
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: '海康机器人RCS工具拓展平台',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // 外链用系统浏览器打开（前端里的帮助/文档链接等）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    // 点关闭时最小化到托盘，不真正退出（右上角托盘图标可退出）
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ------------------------------------------------------------
// 系统托盘
// ------------------------------------------------------------
function createTray() {
  if (!fs.existsSync(ICON) || tray) return;
  tray = new Tray(ICON);
  tray.setToolTip('RCS工具拓展平台');
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: '打开浏览器版', click: () => shell.openExternal(`http://127.0.0.1:${backendPort}/`) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ------------------------------------------------------------
// IPC：前端可请求打开外部链接 / 获取后端地址
// ------------------------------------------------------------
ipcMain.handle('get-backend-url', () => `http://127.0.0.1:${backendPort}/`);
ipcMain.handle('open-external', (_e, url) => { if (/^https?:/.test(url)) return shell.openExternal(url); });

// ------------------------------------------------------------
// 启动流程
// ------------------------------------------------------------
async function boot() {
  try {
    // 先解析可写运行时目录（避免 Program Files 只读导致配置/数据保存 EPERM）
    APP_DIR = resolveWritableAppDir();
    SERVER_JS = path.join(APP_DIR, 'server.js');
    if (!IS_DEV) console.log('[desktop] 运行时目录:', APP_DIR);

    backendPort = await pickPort();
    await startServer(backendPort);
    await waitHttp(backendPort);
    createWindow(backendPort);
    createTray();
  } catch (err) {
    dialog.showErrorBox('启动失败', String(err && err.message ? err.message : err));
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  // 托盘常驻，不因关窗退出
});

app.on('before-quit', () => {
  isQuitting = true;
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill(); } catch (_) {}
  }
});

app.on('activate', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});
