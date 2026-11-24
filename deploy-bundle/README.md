# RCS Box 离线部署包（openEuler / 欧拉）

把 AGV 告警推送中心整包部署到欧拉服务器，含**内置 Node 运行时**（x86_64 / aarch64 双架构）、前端、后端、依赖与配置，**全程无需联网**，systemd 开机自启。

## 一、包内容

```
rcsbox-deploy/
├─ app/                       应用（后端 + 已编译前端 dist + node_modules + 配置）
├─ runtime/
│  ├─ node-v20.19.0-linux-x64.tar.xz      x86_64 用 Node 运行时
│  └─ node-v20.19.0-linux-arm64.tar.xz    aarch64 用 Node 运行时
├─ rcsbox.service             systemd 服务模板
├─ install.sh                 一键安装（自动识别架构）
├─ uninstall.sh               卸载
└─ README.md                  本说明
```

## 二、部署步骤（目标机上，root 执行）

```bash
# 1. 把整包传到服务器（U盘 / scp 均可），假设放在 /tmp
cd /tmp
tar -xf rcsbox-deploy.tar.gz
cd rcsbox-deploy

# 2. 赋可执行权限并安装（默认装到 /opt/rcsbox）
chmod +x install.sh uninstall.sh
sudo ./install.sh
#   想装到别的目录：sudo ./install.sh /data/rcsbox
```

安装脚本会自动完成：
1. 识别 CPU 架构，解压对应的内置 Node（不联网）
2. 拷贝应用到安装目录（升级时会先备份你的配置和数据）
3. 注册 systemd 服务并设为**开机自启**
4. 开放防火墙 6007 / 6008
5. 启动服务并做健康检查

看到 `✅ 安装完成` 即成功。浏览器访问：`http://服务器IP:6007`

## 三、日常运维

```bash
sudo systemctl status rcsbox          # 查看状态
sudo systemctl restart rcsbox         # 重启
sudo systemctl stop rcsbox            # 停止
journalctl -u rcsbox -f               # 实时日志（systemd）
tail -f /opt/rcsbox/logs/server.log   # 应用日志
```

开机自启已由 `systemctl enable rcsbox` 完成，重启机器会自动拉起；进程崩溃也会在 5 秒后自动重启。

## 四、配置与数据

装好后如需修改，编辑 `/opt/rcsbox/app/` 下：

| 文件 | 用途 |
|---|---|
| `db_config.json` | 数据库连接（首次使用请在页面「数据库连接配置」中填写） |
| `service_config.json` | 项目名、Webhook、推送开关、端口等 |
| `rack_config.json` | 货架监控独立数据库连接 |
| `boxcode_data.json` | 料箱码/托盘码数据（首次运行自动生成，不写业务库） |

改完执行 `sudo systemctl restart rcsbox` 生效。

**钉钉推送关键词（重要）**：系统推送告警时会在消息开头自动加上「告警」二字。
因此配置钉钉机器人 Webhook 时，必须在钉钉群 →「群设置 → 智能群助手 → 添加机器人 → 自定义」的安全设置里，
勾选「自定义关键词」并填入「告警」，否则钉钉会拒绝推送（提示「没有匹配到关键词」）。
Webhook 配置教程可参考：https://www.wangsu.com/document/3130/webhook

**注意**：数据库是外部依赖，本机需能连通 `db_config.json` 里配置的数据库地址，否则报表/告警查询会不可用（页面能打开，数据为空）。

## 五、卸载

```bash
cd rcsbox-deploy
sudo ./uninstall.sh            # 停服务、移除开机自启，保留数据目录
sudo ./uninstall.sh /opt/rcsbox --purge   # 连数据一起彻底删除
```

## 六、常见问题

- **端口冲突**：改 `service_config.json` 的 `port`，并把 `rcsbox.service` 里的 `Environment=PORT=6007` 和防火墙端口同步改掉，重装。
- **HTTPS 证书**：自签名，浏览器会提示不安全，点继续即可；证书在 `app/ssl/`，可换成正式证书。
- **架构确认**：`uname -m` → `x86_64` 走 x64 包，`aarch64` 走 arm64 包，脚本已自动识别。
- **系统兼容**：欧拉（openEuler）用 systemd + firewalld，脚本已适配；其它 systemd 发行版（CentOS/RHEL/Rocky/银河麒麟等）同样适用。
