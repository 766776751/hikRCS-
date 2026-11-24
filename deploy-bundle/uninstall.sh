#!/bin/bash
# ============================================================
#  RCS Box 卸载脚本
#  用法：sudo ./uninstall.sh  [安装目录，默认 /opt/rcsbox]
#  说明：默认保留数据与配置目录，便于重装；加 --purge 彻底删除
# ============================================================
set -e

INSTALL_DIR="${1:-/opt/rcsbox}"
PURGE=false
for arg in "$@"; do
  [ "$arg" = "--purge" ] && PURGE=true
done
SERVICE_NAME="rcsbox"
PORT=6007
HTTPS_PORT=6008

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ 请以 root 运行：sudo ./uninstall.sh"
  exit 1
fi

echo "============================================================"
echo "  RCS Box 卸载"
echo "============================================================"

echo "[1/3] 停止并禁用服务..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
echo "       ✅ 已停止并取消开机自启"

echo "[2/3] 删除 systemd 服务文件..."
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
echo "       ✅ 已删除服务文件"

echo "[3/3] 关闭防火墙端口..."
if command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --remove-port=${PORT}/tcp 2>/dev/null || true
  firewall-cmd --permanent --remove-port=${HTTPS_PORT}/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi

if [ "$PURGE" = true ]; then
  echo "       --purge：彻底删除 $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  echo "       ✅ 已删除全部文件（含数据/配置）"
else
  echo "       ✅ 已保留 $INSTALL_DIR（数据与配置未删除）"
fi
echo ""
echo "✅ 卸载完成"
