#!/bin/bash
#
# Start Project - Linux 启动脚本
# 用法: ./scripts/start.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_PORT=3100
FRONTEND_PORT=5173
DATABASE_PORT=5432

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Start Project - 启动脚本 (Linux)               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

check_command() {
    command -v "$1" &> /dev/null
}

check_port() {
    lsof -i:"$1" &> /dev/null || ss -tuln | grep -q ":$1 "
}

wait_for_port() {
    local port=$1 timeout=${2:-60} count=0
    while ! check_port "$port"; do
        sleep 1
        count=$((count + 1))
        [ $count -ge $timeout ] && return 1
    done
    return 0
}

get_server_ip() {
    PUBLIC_IP=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null || echo "")
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
}

# 检查环境
echo -e "${YELLOW}检查环境...${NC}"

if ! check_command node; then
    echo -e "${RED}❌ 未找到 Node.js，请先安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

DOCKER_AVAILABLE=false
if check_command docker && docker info &> /dev/null; then
    echo -e "${GREEN}✓ Docker 已运行${NC}"
    DOCKER_AVAILABLE=true
else
    echo -e "${YELLOW}⚠ Docker 未运行${NC}"
fi

echo ""

# 启动数据库
echo -e "${BLUE}📦 步骤 1/4: 启动数据库${NC}"
echo "────────────────────────────────────────"

if [ "$DOCKER_AVAILABLE" = true ]; then
    if check_port $DATABASE_PORT; then
        echo -e "${GREEN}✓ 数据库已在运行${NC}"
    else
        echo "启动 PostgreSQL..."
        cd "$ROOT_DIR" && docker compose up -d
        wait_for_port $DATABASE_PORT 30 && echo -e "${GREEN}✓ 数据库已就绪${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 跳过数据库${NC}"
fi

echo ""

# 配置后端
echo -e "${BLUE}⚙️  步骤 2/4: 配置后端${NC}"
echo "────────────────────────────────────────"

ENV_LOCAL="$BACKEND_DIR/env.local"
ENV_EXAMPLE="$BACKEND_DIR/env.example"

# 不安全的默认 JWT_SECRET 列表
INSECURE_SECRETS="please-change-me please-change-me-to-random-string dev-secret-please-change-1234"

if [ ! -f "$ENV_LOCAL" ]; then
    cp "$ENV_EXAMPLE" "$ENV_LOCAL"
    
    # 生成安全的 JWT_SECRET
    NEW_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 64)
    
    if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" "$ENV_LOCAL"
    else
        sed -i "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" "$ENV_LOCAL"
    fi
    
    echo -e "${GREEN}✓ 配置文件已创建${NC}"
    echo -e "${GREEN}✓ 已自动生成安全的 JWT_SECRET${NC}"
else
    echo -e "${GREEN}✓ 配置文件已存在${NC}"
    
    # 检查是否使用不安全的默认值
    CURRENT_SECRET=$(grep -oP 'JWT_SECRET="\K[^"]+' "$ENV_LOCAL" 2>/dev/null || grep -o 'JWT_SECRET="[^"]*"' "$ENV_LOCAL" | cut -d'"' -f2)
    
    IS_INSECURE=false
    for secret in $INSECURE_SECRETS; do
        if [ "$CURRENT_SECRET" = "$secret" ]; then
            IS_INSECURE=true
            break
        fi
    done
    
    if [ "$IS_INSECURE" = true ]; then
        echo ""
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}⚠️  安全警告：JWT_SECRET 使用了不安全的默认值！${NC}"
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        echo ""
        echo "  这意味着任何人都可以伪造登录 token，"
        echo "  以任意用户身份（包括管理员）登录你的系统。"
        echo ""
        
        read -p "  是否自动生成安全的 JWT_SECRET？(y/n): " answer
        if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
            NEW_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 64)
            
            if [ "$(uname)" = "Darwin" ]; then
                sed -i '' "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" "$ENV_LOCAL"
            else
                sed -i "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" "$ENV_LOCAL"
            fi
            
            echo -e "${GREEN}✓ 已生成并保存新的 JWT_SECRET${NC}"
            echo -e "${YELLOW}  注意：所有已登录用户需要重新登录${NC}"
        else
            echo -e "${YELLOW}⚠ 跳过 JWT_SECRET 更新，请稍后手动修改 backend/env.local${NC}"
        fi
        echo ""
    fi
fi

echo ""

# 安装依赖
echo -e "${BLUE}📦 步骤 3/4: 安装依赖${NC}"
echo "────────────────────────────────────────"

[ ! -d "$BACKEND_DIR/node_modules" ] && (cd "$BACKEND_DIR" && npm install)
[ ! -d "$FRONTEND_DIR/node_modules" ] && (cd "$FRONTEND_DIR" && npm install)
echo -e "${GREEN}✓ 依赖已就绪${NC}"

echo ""

# 启动服务
echo -e "${BLUE}🚀 步骤 4/4: 启动服务${NC}"
echo "────────────────────────────────────────"

if ! check_port $BACKEND_PORT; then
    echo "启动后端..."
    (cd "$BACKEND_DIR" && npm run dev > /dev/null 2>&1 &)
    echo "等待后端就绪 (约30-60秒)..."
    wait_for_port $BACKEND_PORT 120 && echo -e "${GREEN}✓ 后端已启动${NC}"
else
    echo -e "${GREEN}✓ 后端已在运行${NC}"
fi

if ! check_port $FRONTEND_PORT; then
    echo "启动前端..."
    (cd "$FRONTEND_DIR" && npm run dev > /dev/null 2>&1 &)
    wait_for_port $FRONTEND_PORT 60 && echo -e "${GREEN}✓ 前端已启动${NC}"
else
    echo -e "${GREEN}✓ 前端已在运行${NC}"
fi

# 显示结果
get_server_ip

echo ""
echo "════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 启动完成！${NC}"
echo ""
echo -e "  本地访问: ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
[ -n "$LOCAL_IP" ] && echo -e "  内网访问: ${BLUE}http://$LOCAL_IP:$FRONTEND_PORT${NC}"
[ -n "$PUBLIC_IP" ] && echo -e "  公网访问: ${BLUE}http://$PUBLIC_IP:$FRONTEND_PORT${NC}"
echo ""
echo -e "  默认账号: ${YELLOW}admin${NC} / ${YELLOW}admin123456${NC}"
echo ""
echo -e "${YELLOW}⚠️  如果无法通过 IP 访问，请放行端口:${NC}"
echo "   firewall-cmd --permanent --add-port={$FRONTEND_PORT,$BACKEND_PORT}/tcp && firewall-cmd --reload"
echo "   或: ufw allow $FRONTEND_PORT && ufw allow $BACKEND_PORT"
echo ""
echo "════════════════════════════════════════════════════"
echo ""
echo "停止服务: pkill -f 'npm run dev'"
