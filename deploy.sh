#!/bin/bash
# ============================================
#  rcs_box0.1.0-6007  Linux 部署脚本
#  适用：HikOS / CentOS / RHEL / Rocky
# ============================================

set -e

PORT=6007
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$APP_DIR/server.log"
NODE_VER="v24.20.0"
NODE_PKG="node-${NODE_VER}-linux-x64.tar.xz"
NODE_URL="https://nodejs.org/dist/${NODE_VER}/${NODE_PKG}"

echo ""
echo "============================================"
echo "  rcs_box0.1.0-6007  Linux 部署脚本"
echo "  系统：HikOS Enterprise 1.1.0"
echo "  目录：$APP_DIR"
echo "============================================"
echo ""

# ============================================
#  STEP 1：开放防火墙 6007 端口
# ============================================
HTTPS_PORT=$((PORT + 1))
echo "[1/5] 配置防火墙（端口 $PORT/$HTTPS_PORT）..."

if command -v firewall-cmd &>/dev/null; then
    firewall-cmd --quiet --permanent --add-port=$PORT/tcp 2>/dev/null
    firewall-cmd --quiet --permanent --add-port=$HTTPS_PORT/tcp 2>/dev/null
    firewall-cmd --quiet --reload 2>/dev/null
    echo "       ✅ firewalld：端口 $PORT/$HTTPS_PORT 已开放"
elif command -v ufw &>/dev/null; then
    ufw allow $PORT/tcp 2>/dev/null
    ufw allow $HTTPS_PORT/tcp 2>/dev/null
    echo "       ✅ ufw：端口 $PORT/$HTTPS_PORT 已开放"
else
    echo "       ⚠️  未检测到防火墙工具，跳过（如无法访问请手动开放）"
fi

# ============================================
#  STEP 2：检查 Node.js / npm 环境
# ============================================
echo "[2/5] 检查 Node.js 环境..."

if command -v node &>/dev/null && command -v npm &>/dev/null; then
    CUR_VER=$(node -v)
    CUR_NPM=$(npm -v)
    # 检查是否为 24.20.x（非此版本则重新安装）
    if [[ "$CUR_VER" == v24.20.* ]]; then
        echo "       ✅ Node.js: $CUR_VER (匹配 24.20.x)"
        SKIP_INSTALL=true
    else
        echo "       ⚠️  Node.js 当前为 $CUR_VER，需要 24.20.x，将重新安装..."
        SKIP_INSTALL=false
    fi
else
    echo "       ❌ Node.js 未安装，开始安装 $NODE_VER ..."
    SKIP_INSTALL=false
fi

# ============================================
#  STEP 3：安装 Node.js（如需要）
# ============================================
if [ "$SKIP_INSTALL" = "false" ]; then
    echo "[3/5] 下载并安装 Node.js $NODE_VER ..."

    cd /tmp
    # 用系统 curl 或 wget 下载
    if [ ! -f "$NODE_PKG" ]; then
        echo "       下载 $NODE_PKG ..."
        if command -v curl &>/dev/null; then
            curl -fL -o "$NODE_PKG" "$NODE_URL" || \
            curl -fL -o "$NODE_PKG" "https://npmmirror.com/mirrors/node/${NODE_VER}/${NODE_PKG}"
        elif command -v wget &>/dev/null; then
            wget -O "$NODE_PKG" "$NODE_URL" || \
            wget -O "$NODE_PKG" "https://npmmirror.com/mirrors/node/${NODE_VER}/${NODE_PKG}"
        else
            echo "       ❌ 请先安装 curl 或 wget"
            exit 1
        fi
    fi

    echo "       解压安装到 /usr/local ..."
    tar -xJf "/tmp/$NODE_PKG" -C /usr/local --strip-components=1

    # 修复 Node 24 自带的 npm 11.19 minipass 兼容问题（会导致 npm install 报
    # "Class extends value undefined"），升级到 12.0.2
    echo "       升级 npm 到 12.0.2（修复 Node 24 兼容问题）..."
    curl -fL -o /tmp/npm1202.tgz "https://registry.npmmirror.com/npm/-/npm-12.0.2.tgz" || \
    curl -fL -o /tmp/npm1202.tgz "https://npmmirror.com/mirrors/npm/npm-12.0.2.tgz"
    rm -rf /usr/local/lib/node_modules/npm
    mkdir -p /usr/local/lib/node_modules/npm
    tar -xzf /tmp/npm1202.tgz -C /tmp package
    cp -r /tmp/package/. /usr/local/lib/node_modules/npm/
    rm -rf /tmp/npm1202.tgz /tmp/package

    # 验证
    export PATH=$PATH:/usr/local/bin
    echo "       ✅ Node.js 安装完成：$(node -v)"
    echo "       ✅ npm：$(npm -v)"
else
    echo "[3/5] 跳过安装（Node.js 已就绪）"
fi

# ============================================
#  STEP 4：停掉占用端口的旧进程
# ============================================
echo "[4/5] 检查端口 $PORT 占用情况..."

OLD_PID=""
# 方法1：用 lsof
if command -v lsof &>/dev/null; then
    OLD_PID=$(lsof -ti:$PORT 2>/dev/null || true)
fi

# 方法2：lsof 不存在时用 ss（正确语法）
if [ -z "$OLD_PID" ] && command -v ss &>/dev/null; then
    OLD_PID=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
fi

# 方法3：都用不了就用 netstat
if [ -z "$OLD_PID" ] && command -v netstat &>/dev/null; then
    OLD_PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'LISTEN.*\K[0-9]+(?=/)' | head -1 || true)
fi

if [ -n "$OLD_PID" ]; then
    echo "       端口被占用（PID: $OLD_PID），正在停止..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 2
    echo "       ✅ 旧进程已停止"
else
    echo "       ✅ 端口 $PORT 未被占用"
fi

# ============================================
#  STEP 5：安装依赖并后台启动
# ============================================
echo "[5/5] 启动服务..."
cd "$APP_DIR"

# 安装 npm 依赖
echo "       检查并安装依赖..."
npm install --production 2>&1 | tail -5
echo "       ✅ 依赖安装完成"

# 每次启动都重新生成自签名 SSL 证书
SSL_DIR="$APP_DIR/ssl"
if [ ! -d "$SSL_DIR" ]; then
    mkdir -p "$SSL_DIR"
fi
echo "       生成自签名 SSL 证书..."
cd "$APP_DIR"
node -e "
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
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
cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }]);
cert.sign(keys.privateKey, forge.md.sha256.create());
fs.writeFileSync(path.join('ssl', 'cert.pem'), forge.pki.certificateToPem(cert));
fs.writeFileSync(path.join('ssl', 'key.pem'), forge.pki.privateKeyToPem(keys.privateKey));
console.log('SSL_OK');
" 2>&1 | grep -q "SSL_OK"
if [ $? -eq 0 ]; then
    echo "       ✅ SSL 证书已生成（自签名，有效期365天）"
else
    echo "       ❌ SSL 证书生成失败"
fi

# 用 nohup 后台启动（注意是 nohup 不是 nohup）
nohup node server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
sleep 3

# 验证启动结果
LISTENING=""
if command -v lsof &>/dev/null; then
    LISTENING=$(lsof -ti:$PORT 2>/dev/null || true)
else
    LISTENING=$(ss -tln 2>/dev/null | grep ":$PORT " || true)
fi

if [ -n "$LISTENING" ]; then
    # 获取本机 IP
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "未知")
    HTTPS_PORT=$((PORT + 1))
    echo ""
    echo "============================================"
    echo "  ✅ 启动成功！"
    echo "  HTTP  访问：http://${LOCAL_IP}:${PORT}"
    echo "  HTTPS 访问：https://${LOCAL_IP}:${HTTPS_PORT}"
    echo "  本地 HTTP：http://127.0.0.1:${PORT}"
    echo "  进程 PID：$NEW_PID"
    echo "  日志文件：$LOG_FILE"
    echo "  查看日志：tail -f $LOG_FILE"
    echo "  停止服务：kill $NEW_PID"
    echo "============================================"
    echo ""
else
    echo ""
    echo "❌ 启动失败，请查看日志："
    tail -20 "$LOG_FILE"
    exit 1
fi
