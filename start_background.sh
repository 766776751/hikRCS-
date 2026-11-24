#!/usr/bin/env bash
# rcsbox 后台启动脚本（带端口占用检测，避免 EADDRINUSE）
# 用法：在 rcs_box 根目录执行  ./start_background.sh
# 兼容 Windows(Git Bash: netstat+taskkill) 与 Linux(macOS: lsof+kill)
set -e

PORT=6007
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> 检查端口 ${PORT} 是否被占用..."
PID=""
if command -v netstat >/dev/null 2>&1; then
  # Windows / Git Bash
  PID=$(netstat -ano 2>/dev/null | grep ":${PORT}" | grep "LISTEN" | awk '{print $5}' | head -1)
  if [ -n "$PID" ]; then
    echo "    端口被 PID ${PID} 占用，正在结束..."
    taskkill //PID "$PID" //F >/dev/null 2>&1 || true
    sleep 1
  fi
elif command -v lsof >/dev/null 2>&1; then
  PID=$(lsof -ti tcp:${PORT} | head -1)
  if [ -n "$PID" ]; then
    echo "    端口被 PID ${PID} 占用，正在结束..."
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
  fi
fi

echo "==> 启动 rcsbox（后台运行 node server.js）..."
node server.js > rcsbox.log 2>&1 &
echo "    已启动 PID $!，日志写入 rcsbox.log"
echo "    访问地址：http://localhost:${PORT}"
