#!/bin/bash
# ============================================================
#  RCS Box 一键安装脚本（openEuler / 欧拉 及其它 systemd Linux）
#  · 自动识别 x86_64 / aarch64，解压内置 Node 运行时
#  · 注册 systemd 服务并设为开机自启
#  · 开放防火墙 6007/6008，启动并健康检查
#  用法：sudo ./install.sh  [安装目录，默认 /opt/rcsbox]
# ============================================================
set -e

BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${1:-/opt/rcsbox}"
SERVICE_NAME="rcsbox"
PORT=6007
HTTPS_PORT=6008

echo ""
echo "============================================================"
echo "  RCS Box 一键安装"
echo "  安装包目录：$BUNDLE_DIR"
echo "  安装目录  ：$INSTALL_DIR"
echo "============================================================"
echo ""

# ---------- 0. root 权限检查 ----------
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请以 root 运行：sudo ./install.sh"
  exit 1
fi

# ---------- 1. 识别 CPU 架构 ----------
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    NODE_TAR="$BUNDLE_DIR/runtime/node-v20.19.0-linux-x64.tar.xz"
    echo "[1/7] CPU 架构：$ARCH → 使用 x64 Node"
    ;;
  aarch64|arm64)
    NODE_TAR="$BUNDLE_DIR/runtime/node-v20.19.0-linux-arm64.tar.xz"
    echo "[1/7] CPU 架构：$ARCH → 使用 arm64 Node"
    ;;
  *)
    echo "❌ 不支持的架构：$ARCH（仅支持 x86_64 / aarch64）"
    exit 1
    ;;
esac

if [ ! -f "$NODE_TAR" ]; then
  echo "❌ 未找到内置 Node 包：$NODE_TAR"
  exit 1
fi

# ---------- 2. 停旧服务 / 备份配置 ----------
echo "[2/7] 检查旧服务与配置..."
if systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
  echo "       停止已存在的 $SERVICE_NAME 服务..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
fi
# 备份用户数据/配置（避免升级覆盖）
if [ -f "$INSTALL_DIR/app/service_config.json" ]; then
  BK="$INSTALL_DIR/backup_$(date +%Y%m%d_%H%M%S)"
  mkdir -p "$BK"
  cp -a "$INSTALL_DIR/app/service_config.json" \
        "$INSTALL_DIR/app/db_config.json" \
        "$INSTALL_DIR/app/rack_config.json" \
        "$INSTALL_DIR/app/boxcode_data.json" \
        "$INSTALL_DIR/app/push_history.log" "$BK/" 2>/dev/null || true
  echo "       旧配置已备份到：$BK"
fi

# ---------- 3. 安装应用文件 ----------
echo "[3/7] 安装应用到 $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR/app" "$INSTALL_DIR/logs" "$INSTALL_DIR/runtime"
# 包内 app/ 目录整体拷入（覆盖代码，但保留上面已备份的配置）
cp -a "$BUNDLE_DIR/app/." "$INSTALL_DIR/app/"

# 恢复用户配置（不覆盖新代码，只还原数据/配置）
if [ -n "$BK" ]; then
  for f in service_config.json db_config.json rack_config.json boxcode_data.json push_history.log; do
    [ -f "$BK/$f" ] && cp -a "$BK/$f" "$INSTALL_DIR/app/$f"
  done
  echo "       已还原用户配置与数据"
fi

# ---------- 4. 解压内置 Node 运行时 ----------
echo "[4/7] 解压 Node 运行时（离线内置，无需联网）..."
rm -rf "$INSTALL_DIR/runtime/node"
mkdir -p "$INSTALL_DIR/runtime/node"
tar -xJf "$NODE_TAR" -C "$INSTALL_DIR/runtime/node" --strip-components=1
NODE_BIN="$INSTALL_DIR/runtime/node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "❌ Node 解压失败：$NODE_BIN 不存在"
  exit 1
fi
echo "       Node 版本：$($NODE_BIN -v)"

# ---------- 5. 生成并注册 systemd 服务 ----------
echo "[5/7] 注册 systemd 服务..."
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
sed "s|__INSTALL_DIR__|$INSTALL_DIR|g" "$BUNDLE_DIR/rcsbox.service" > "$UNIT_FILE"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# ---------- 6. 开放防火墙端口 ----------
echo "[6/7] 开放防火墙端口 $PORT / $HTTPS_PORT ..."
if command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=${PORT}/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=${HTTPS_PORT}/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  echo "       firewalld：已开放"
elif command -v ufw &>/dev/null; then
  ufw allow ${PORT}/tcp 2>/dev/null || true
  ufw allow ${HTTPS_PORT}/tcp 2>/dev/null || true
  echo "       ufw：已开放"
else
  echo "       ⚠️ 未检测到防火墙工具，如无法访问请手动开放 $PORT/$HTTPS_PORT"
fi

# ---------- 7. 启动并健康检查 ----------
echo "[7/7] 启动服务..."
systemctl restart "$SERVICE_NAME"
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "服务器IP")
  echo ""
  echo "============================================================"
  echo "  ✅ 安装完成，服务已启动并设为开机自启"
  echo "  HTTP 访问 ：http://${LOCAL_IP}:${PORT}"
  echo "  HTTPS访问 ：https://${LOCAL_IP}:${HTTPS_PORT}（自签名证书）"
  echo "  服务状态  ：systemctl status $SERVICE_NAME"
  echo "  实时日志  ：journalctl -u $SERVICE_NAME -f"
  echo "  应用日志  ：tail -f $INSTALL_DIR/logs/server.log"
  echo "  停止服务  ：systemctl stop $SERVICE_NAME"
  echo "  重启服务  ：systemctl restart $SERVICE_NAME"
  echo "============================================================"
else
  echo ""
  echo "❌ 服务启动失败，请查看日志："
  echo "   journalctl -u $SERVICE_NAME -n 50 --no-pager"
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager 2>/dev/null || true
  exit 1
fi
echo ""
