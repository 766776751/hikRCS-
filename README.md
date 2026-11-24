# 海康机器人 RCS 工具拓展平台（hikRCS）

AGV 调度 · 任务管理 · 告警推送一体化运维控制台，Web 页面可放到 PDA 中显示使用。

基于 Node.js（Express）+ React（Vite）的单进程 Web 应用，数据源为外部 PostgreSQL。功能包含：数据看板、任务报表、任务查询/取消、告警查询、企微/钉钉/飞书/公众号 Webhook 告警推送、货架仓位监控、料箱码/托盘码管理等。

本项目提供**三种使用方式**：

| 方式 | 适合人群 | 说明 |
|---|---|---|
| **Linux 离线安装包** | 现场部署人员 | 内置 Node 运行时 + 前端 + 后端，无需联网，systemd 开机自启 |
| **Windows 桌面程序（exe）** | Windows 使用者 | 服务端 + 客户端打包成一个应用，双击即用，无需装 Node |
| **源码运行** | 开发者 | clone 后自行 npm install 并构建前端 |

> 仓库只含**源码**与配置模板，不含 Node 依赖、构建产物、安装包、运行数据和日志。

---

## 一、目录结构

```
rcs_box-0920/
├─ server.js              后端入口（Express，HTTP 6007 / HTTPS 6008）
├─ db.js                  数据库连接（pg）
├─ alarm_types.js         告警类型映射
├─ routes/                后端路由（agv / boxcode / rack）
├─ public/                旧版静态前端（备用）
├─ frontend/              React 前端源码（Vite）
│  └─ src-* / src/        各业务模块（home / task / report / alarm / rack / boxcode / site / db / shell / ui）
├─ deploy-bundle/         Linux 离线部署包源码（install.sh / uninstall.sh / rcsbox.service / README）
├─ rcsbox-desktop/        Windows 桌面端源码（Electron 主进程 + 打包配置 + README）
├─ docs/                  设计文档
├─ *.example.json         配置模板（复制为对应 json 后填写）
└─ README.md              本说明
```

---

## 二、Linux 离线安装包（推荐现场使用）

适用于 openEuler / 欧拉，也兼容 CentOS / RHEL / Rocky / 银河麒麟等 systemd + firewalld 系统。

### 1. 获取安装包

从本仓库的 **Releases** 页面下载 `rcsbox-deploy.tar.gz`（约 56MB，内置 x86_64 / arm64 双架构 Node 运行时，**全程无需联网**）。

> 如果 Releases 没有，可按「第五节 从源码构建安装包」自行打包。

### 2. 安装（目标机 root 执行）

```bash
cd /tmp
tar -xf rcsbox-deploy.tar.gz
cd rcsbox-deploy
chmod +x install.sh uninstall.sh
sudo ./install.sh
#   指定安装目录：sudo ./install.sh /data/rcsbox
```

安装脚本自动完成：识别架构并解压内置 Node、拷贝应用（升级时自动备份旧配置和数据）、注册 systemd 服务并设为**开机自启**、开放防火墙 6007/6008、启动并健康检查。看到 `✅ 安装完成` 即成功。

浏览器访问：`http://服务器IP:6007`（HTTPS 为 `https://服务器IP:6008`，自签名证书点继续即可）。

### 3. 日常运维

```bash
sudo systemctl status rcsbox          # 状态
sudo systemctl restart rcsbox         # 重启（改完配置后执行）
sudo systemctl stop rcsbox            # 停止
journalctl -u rcsbox -f               # 实时日志
tail -f /opt/rcsbox/logs/server.log   # 应用日志
```

### 4. 卸载

```bash
cd rcsbox-deploy
sudo ./uninstall.sh                            # 停服务、移除开机自启，保留数据
sudo ./uninstall.sh /opt/rcsbox --purge        # 连数据一起删除
```

更多细节见 `deploy-bundle/README.md`。

---

## 三、Windows 桌面程序（exe）

把服务端 + 客户端打包成一个 Electron 应用，客户端机器**无需安装 Node、无需配置环境**，双击即用。

### 1. 获取安装包

从本仓库 **Releases** 下载 `RCS工具拓展平台-安装包-1.0.0.exe`（NSIS 安装包，约 84MB）。

### 2. 安装

双击安装包，按向导下一步即可。默认安装到**当前用户目录**（无需管理员权限、天然可写），可自定义路径。

> 注意：请不要装到 `C:\Program Files` 等系统只读目录。程序检测到目录只读时会自动把运行时复制到 `%APPDATA%\RCS工具拓展平台\runtime\` 再运行，你已有的配置和数据会原样保留、不被覆盖。

### 3. 绿色版（可选）

解压 `win-unpacked/` 目录，直接运行其中的 `RCS工具拓展平台.exe`，免安装。

### 4. 配置位置

| 文件 | 用途 |
|---|---|
| `resources/app-dist/db_config.json` | 数据库连接 |
| `resources/app-dist/service_config.json` | 平台配置（端口、Webhook、手动任务链接等） |
| `resources/app-dist/rack_config.json` | 货架监控配置 |

初次使用在页面「数据库连接配置」里填写数据库信息，保存后重启程序生效。页面上的配置保存会写入可写目录，不会因只读报错。

更多细节见 `rcsbox-desktop/README.md`。

---

## 四、首次配置要点

无论哪种安装方式，首次使用都需要：

1. **配置数据库**：在页面「数据库连接配置」填写 PostgreSQL 的地址、端口、库名、账号、密码。数据库是外部依赖，需能连通，否则报表/告警查询无数据（页面能打开，数据为空）。
2. **配置告警推送**（可选）：在「告警推送」页填写各平台 Webhook。
   - Webhook 配置教程：https://www.wangsu.com/document/3130/webhook
   - **钉钉关键词（重要）**：系统推送时会在消息开头自动加上「告警」。因此钉钉群机器人安全设置里必须勾选「自定义关键词」并填入「告警」，否则钉钉会拒绝推送（提示"没有匹配到关键词"）。

> 安全提示：仓库中的 `service_config.json` / `db_config.json` 均为**空模板**（`*.example.json`），不含任何真实 Webhook、项目名或数据库密码。请勿把真实凭据提交到仓库。

---

## 五、从源码构建 / 运行（开发者）

### 环境要求

- Node.js 20+
- npm
- PostgreSQL（运行期外部依赖）
- Windows 打包还需 Electron / electron-builder（npm 脚本会自动装）

### 5.1 源码运行

```bash
# 1. 安装后端依赖
npm install

# 2. 准备配置模板（复制后按实际填写）
cp service_config.example.json service_config.json
cp db_config.example.json       db_config.json
cp rack_config.example.json     rack_config.json
#   HTTPS 证书：复制 ssl 证书到 app/ssl/（源码仓库不含私钥）

# 3. 构建前端
npm run build:web

# 4. 启动
npm start
#   访问 http://localhost:6007
```

### 5.2 构建 Linux 离线安装包

1. 前端编译后，把 `dist/` 和后端源码同步到 `deploy-bundle/app/`。
2. 把 Node 运行时（x64 / arm64 的 tar.xz）放到 `deploy-bundle/runtime/`。
3. 在 `deploy-bundle/` 上层目录打包：

```bash
cp -r deploy-bundle rcsbox-deploy
tar -czf rcsbox-deploy.tar.gz rcsbox-deploy
```

### 5.3 构建 Windows exe

```bash
cd rcsbox-desktop
# 先在主项目 npm run build:web，并把 dist + 后端源码同步到 rcsbox-desktop/app/
npm install
npm run dist
#   产物在 dist-installer*/RCS工具拓展平台-安装包-1.0.0.exe
```

---

## 六、技术栈

- 后端：Node.js 20 / Express / node-forge（HTTPS）/ pg / ssh2 / xlsx
- 前端：React 18 / Vite / Chart.js
- 桌面：Electron 33 / electron-builder（NSIS）
- 部署：systemd + firewalld（Linux）、内置双架构 Node 运行时

## 七、许可

MIT
