#!/bin/bash
# ============================================================
#  RCS Box 停止脚本 (Linux / openEuler)
#  ------------------------------------------------------------
#  兼容两种部署方式：
#   1) systemd 托管 (rcsbox.service) -> systemctl stop rcsbox
#   2) nohup / 直接 node server.js    -> 按端口定位 PID 后 kill
#
#  用法:
#     ./stop.sh           # 停止（终端会询问确认）
#     ./stop.sh -y        # 直接停止，不询问（脚本/自动化用）
# ============================================================

PORT=6007
HTTPS_PORT=$((PORT + 1))
SERVICE_NAME="rcsbox"

# 是否跳过确认
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes) ASSUME_YES=1 ;;
    esac
done

# 颜色（非终端自动失效）
if [ -t 1 ]; then
    C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YEL='\033[1;33m'; C_CYA='\033[0;36m'; C_NC='\033[0m'
else
    C_GREEN=''; C_RED=''; C_YEL=''; C_CYA=''; C_NC=''
fi

echo "============================================"
echo "  Stop RCS Service"
echo "============================================"
echo ""

confirm() {
    [ "$ASSUME_YES" -eq 1 ] && return 0
    # 非交互式 stdin 不询问，直接继续
    [ ! -t 0 ] && return 0
    printf "确认停止? (y/N): "
    read -r ans
    case "$ans" in
        y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

# ------------------------------------------------------------
# 收集要停的进程 PID（按 HTTP 端口定位，最精确，避免误杀）
# ------------------------------------------------------------
find_port_pids() {
    local pids=""
    # lsof 最可靠
    if command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -ti:"$PORT" 2>/dev/null)"
    fi
    # ss（iproute2，openEuler 默认有）
    if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
        pids="$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)"
    fi
    # fuser
    if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
        pids="$(fuser -n tcp "$PORT" 2>/dev/null | grep -oE '[0-9]+')"
    fi
    # netstat 兜底
    if [ -z "$pids" ] && command -v netstat >/dev/null 2>&1; then
        pids="$(netstat -tlnp 2>/dev/null | grep ":${PORT}[[:space:]]" \
                | grep -oP '[0-9]+/node' | grep -oP '^[0-9]+' | sort -u)"
    fi
    echo "$pids" | tr '\n' ' ' | xargs
}

PORT_PIDS="$(find_port_pids)"

# systemd 服务是否在运行
SYSTEMD_ACTIVE=0
if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null && SYSTEMD_ACTIVE=1
fi

if [ "$SYSTEMD_ACTIVE" -eq 0 ] && [ -z "$PORT_PIDS" ]; then
    echo -e "${C_YEL}[INFO] 端口 $PORT 上没有运行中的服务，无需停止。${C_NC}"
    echo ""
    exit 0
fi

# ------------------------------------------------------------
# 展示将要停止的目标
# ------------------------------------------------------------
if [ "$SYSTEMD_ACTIVE" -eq 1 ]; then
    echo -e "${C_CYA}systemd 服务: ${SERVICE_NAME} (active)${C_NC}"
fi
if [ -n "$PORT_PIDS" ]; then
    echo -e "${C_CYA}占用端口 $PORT/$HTTPS_PORT 的进程:${C_NC}"
    for pid in $PORT_PIDS; do
        ps -p "$pid" -o pid=,user=,args= 2>/dev/null | sed 's/^/  /'
    done
fi
echo ""

confirm || { echo -e "${C_YEL}[CANCEL] 已取消。${C_NC}"; echo ""; exit 0; }

# ------------------------------------------------------------
# 执行停止
# ------------------------------------------------------------
STOPPED=0

# 方式1：systemd
if [ "$SYSTEMD_ACTIVE" -eq 1 ]; then
    echo "正在停止 systemd 服务 $SERVICE_NAME ..."
    systemctl stop "$SERVICE_NAME" 2>/dev/null && STOPPED=1
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "${C_RED}[WARN] systemd 停止超时，强制 kill 服务进程...${C_NC}"
        systemctl kill -s KILL "$SERVICE_NAME" 2>/dev/null
        sleep 1
    fi
fi

# 方式2：按 PID kill（systemd 已接管时，端口进程一般随之退出，这里做兜底）
if [ -n "$PORT_PIDS" ]; then
    REMAIN="$(find_port_pids)"
    for pid in $REMAIN; do
        echo "正在终止进程 PID=$pid (TERM)..."
        kill -TERM "$pid" 2>/dev/null || true
        STOPPED=1
    done
    # 等待优雅退出
    sleep 3
    REMAIN="$(find_port_pids)"
    for pid in $REMAIN; do
        echo -e "${C_YEL}进程 PID=$pid 未退出，强制 kill (KILL)...${C_NC}"
        kill -KILL "$pid" 2>/dev/null || true
    done
    sleep 1
fi

# ------------------------------------------------------------
# 验证结果
# ------------------------------------------------------------
FINAL_PIDS="$(find_port_pids)"
SYSTEMD_NOW=0
command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null && SYSTEMD_NOW=1

if [ -z "$FINAL_PIDS" ] && [ "$SYSTEMD_NOW" -eq 0 ]; then
    echo ""
    echo -e "${C_GREEN}[SUCCESS] RCS 服务已停止 (端口 $PORT/$HTTPS_PORT 已释放)${C_NC}"
    echo ""
    exit 0
else
    echo ""
    echo -e "${C_RED}[ERROR] 仍有残留：${C_NC}"
    [ -n "$FINAL_PIDS" ] && echo "  端口 $PORT 仍被 PID: $FINAL_PIDS 占用"
    [ "$SYSTEMD_NOW" -eq 1 ] && echo "  systemd 服务 $SERVICE_NAME 仍在运行"
    echo "  可手动执行: systemctl stop $SERVICE_NAME  或  kill -9 <PID>"
    echo ""
    exit 1
fi
