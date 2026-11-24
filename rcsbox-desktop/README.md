# RCS 工具拓展平台 · Windows 桌面版

把「服务端 + 客户端」打包成一个 Windows 桌面应用：双击打开就是一个应用窗口，
内置后端服务在后台自动启动，**客户端机器无需安装 Node.js、无需配置环境**。

## 一、给现场人员：安装与使用

### 1. 安装
1. 拿到安装包 `RCS工具拓展平台-安装包-1.0.0.exe`
2. 双击运行，按向导下一步即可（可自定义安装目录）
3. 安装完成后，桌面和开始菜单会出现「RCS工具拓展平台」快捷方式

### 2. 使用
- **双击快捷方式** → 应用窗口打开，后端服务自动在后台启动（首次启动约 3~8 秒）
- 窗口内就是完整的 rcsbox 平台（告警、任务、货位、料箱码/托盘码等模块）
- 点窗口右上角 **×** 会**最小化到系统托盘**（不会退出）；
  在右下角托盘图标上 **右键 → 退出** 才是真正关闭并结束服务

### 3. 常见问题
- **窗口一直转圈/白屏**：等 5 秒；若仍不行，托盘右键退出后重开。
- **端口被占用**：程序会自动从 6007 往后找空闲端口（最多 30 个），无需手动处理。
- **报表/告警查询没数据**：需要能连通数据库（`db_config.json` 里的地址），
  这与网页版要求一致；安装后可由维护人员在应用目录里修改该配置文件。
- ** HTTPS**：程序同时启动 HTTP(6007) 和 HTTPS(6008)，证书在 `ssl/` 目录。

### 4. 数据与配置位置
安装后（默认 `C:\Program Files\RCS工具拓展平台\`）：

| 文件 | 用途 |
|---|---|
| `resources/app-dist/db_config.json` | 数据库连接配置 |
| `resources/app-dist/service_config.json` | 平台配置（端口、手动任务链接等） |
| `resources/app-dist/rack_config.json` | 货架监控配置 |
| `resources/app-dist/boxcode_data.json` | 料箱码/托盘码数据（首次运行自动生成） |
| `resources/app-dist/push_history.log` | 推送历史 |

> 修改配置后需退出并重新打开程序才生效。

### 关于"保存配置报 EPERM / operation not permitted"

数据库配置等文件保存在后端目录里，若程序装在 `C:\Program Files`（系统只读目录），
普通进程无写权限，保存时就会报 EPERM。本版本已从两方面解决：

1. **安装包默认装到用户目录**（`%LOCALAPPDATA%`，per-user 安装），无需管理员权限，天然可写。
2. **即使手动改装到 Program Files 也不怕**：程序启动时会检测运行时目录是否可写，
   不可写时自动把后端复制到 `%APPDATA%\RCS工具拓展平台\runtime\` 再运行；
   你之前保存的配置和数据会**原样保留**，不会被覆盖。

因此无论在哪个目录安装，页面上的"数据库连接配置 → 保存并连接"都能正常写入。
（若仍遇到权限问题，以管理员身份运行一次程序即可。）

---

## 二、给维护人员：从源码构建安装包

### 目录结构
```
rcsbox-desktop/
├─ main.js / preload.js      Electron 主进程（拉起后端 + 窗口 + 托盘）
├─ package.json              electron-builder 打包配置
├─ build/icon.ico            应用图标
├─ make_icon.py              图标生成脚本（无需重跑）
├─ app/                       后端运行时（server.js + routes + dist + node_modules + 配置）
└─ dist-installer2/           构建产物（生成）
   ├─ RCS工具拓展平台-安装包-1.0.0.exe   ← 安装包（发给现场）
   └─ win-unpacked/            ← 免安装绿色版（整个目录拷走即可用）
```

### 构建步骤
```bash
cd rcsbox-desktop
npm install
npm run dist
```

产物在 `dist-installer2/` 目录：
- `RCS工具拓展平台-安装包-1.0.0.exe` —— 安装包（NSIS，可改安装目录、建桌面/开始菜单快捷方式）
- `win-unpacked/` —— 免安装绿色版（整个目录拷到任意机器，运行里面的 exe 即可，同样内置后端）

> 打包已配置 `npmRebuild:false` 并排除了 ssh2 的可选原生模块 `cpu-features`，
> ssh2 会自动降级到纯 JS，**构建机无需安装 C++ 编译器**。

### 更新后端/前端后重新打包
1. 先在主项目重新编译前端：`cd ../../rcs_box-0920 && npm run build:web`
2. 同步运行时到桌面项目（覆盖 `app/` 对应内容）：
   - `server.js`、`db.js`、`alarm_types.js`、各 `*.json` 配置
   - `routes/`、`dist/`、`public/`、`ssl/`、`node_modules/`
   - **不要**拷贝 `boxcode_data.json`、`push_history.log`（保持现场数据独立）
3. 回到 `rcsbox-desktop` 执行 `npm run dist`

### 技术要点
- 后端用 Electron 内置 Node 以 `ELECTRON_RUN_AS_NODE=1` 启动，客户端免装 Node。
- 后端放在 `extraResources`（`resources/app-dist/`），**可读可写**——料箱码数据、
  推送日志、配置修改都能持久化；若打进 asar 则只读会报错。
- 主进程先探测可用端口（默认 6007，占用则顺延），通过环境变量传给后端，
  避开 EADDRINUSE；HTTP 就绪后才加载窗口。
