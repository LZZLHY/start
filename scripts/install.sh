#!/bin/bash
#
# Start Project - Linux 一键安装启动脚本
# 支持: Ubuntu/Debian, CentOS/RHEL/Fedora
#
# 用法: curl -fsSL https://raw.githubusercontent.com/LZZLHY/start/main/scripts/install.sh | bash
#

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
REPO_URL="https://github.com/LZZLHY/start.git"
INSTALL_DIR="$HOME/start"
BACKEND_PORT=3100
FRONTEND_PORT=5173

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Start Project - 一键安装脚本                     ║${NC}"
echo -e "${BLUE}║   支持: Ubuntu/Debian, CentOS/RHEL/Fedora          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# 检测系统类型
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    else
        OS="unknown"
    fi
    echo -e "${GREEN}检测到系统: $OS${NC}"
}

# 检查是否有 sudo 权限
check_sudo() {
    if [ "$EUID" -eq 0 ]; then
        SUDO=""
    elif command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo -e "${RED}错误: 需要 root 权限或 sudo${NC}"
        exit 1
    fi
}

# 安装 Git
install_git() {
    if command -v git &> /dev/null; then
        echo -e "${GREEN}✓ Git 已安装${NC}"
        return
    fi
    
    echo -e "${YELLOW}安装 Git...${NC}"
    case $OS in
        ubuntu|debian)
            $SUDO apt update
            $SUDO apt install -y git
            ;;
        centos|rhel|rocky|almalinux)
            $SUDO yum install -y git
            ;;
        fedora)
            $SUDO dnf install -y git
            ;;
        *)
            echo -e "${RED}不支持的系统，请手动安装 Git${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}✓ Git 安装完成${NC}"
}

# 安装 Docker
install_docker() {
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✓ Docker 已安装${NC}"
    else
        echo -e "${YELLOW}安装 Docker...${NC}"
        curl -fsSL https://get.docker.com | $SUDO sh
        echo -e "${GREEN}✓ Docker 安装完成${NC}"
    fi
    
    $SUDO systemctl start docker 2>/dev/null || true
    $SUDO systemctl enable docker 2>/dev/null || true
    
    if [ "$EUID" -ne 0 ]; then
        $SUDO usermod -aG docker $USER 2>/dev/null || true
    fi
    
    if ! docker compose version &> /dev/null; then
        echo -e "${YELLOW}安装 Docker Compose 插件...${NC}"
        case $OS in
            ubuntu|debian)
                $SUDO apt install -y docker-compose-plugin
                ;;
            centos|rhel|rocky|almalinux|fedora)
                $SUDO yum install -y docker-compose-plugin 2>/dev/null || \
                $SUDO dnf install -y docker-compose-plugin 2>/dev/null || true
                ;;
        esac
    fi
    echo -e "${GREEN}✓ Docker 已就绪${NC}"
}

# 安装 Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VER" -ge 18 ]; then
            echo -e "${GREEN}✓ Node.js $(node -v) 已安装${NC}"
            return
        fi
        echo -e "${YELLOW}Node.js 版本过低，升级中...${NC}"
    fi
    
    echo -e "${YELLOW}安装 Node.js 20...${NC}"
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
            $SUDO apt install -y nodejs
            ;;
        centos|rhel|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
            $SUDO yum install -y nodejs
            ;;
        fedora)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
            $SUDO dnf install -y nodejs
            ;;
        *)
            echo -e "${RED}不支持的系统，请手动安装 Node.js 20+${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}✓ Node.js $(node -v) 安装完成${NC}"
}

# 清理旧项目
cleanup_old_project() {
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}检测到已存在项目，执行清理...${NC}"
        pkill -f 'npm run dev' 2>/dev/null || true
        pkill -f 'vite' 2>/dev/null || true
        sleep 2
        
        cd "$INSTALL_DIR" 2>/dev/null || true
        if command -v docker &> /dev/null; then
            if docker info &> /dev/null; then
                docker compose down -v 2>/dev/null || true
            else
                $SUDO docker compose down -v 2>/dev/null || true
            fi
        fi
        
        cd "$HOME"
        rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}✓ 旧项目已清理${NC}"
    fi
}

# 克隆项目
clone_project() {
    echo -e "${YELLOW}克隆项目...${NC}"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo -e "${GREEN}✓ 项目已就绪: $INSTALL_DIR${NC}"
}

# 配置后端
setup_backend() {
    echo -e "${YELLOW}配置后端...${NC}"
    cd "$INSTALL_DIR/backend"
    
    if [ ! -f "env.local" ]; then
        # 复制示例配置
        cp env.example env.local
        
        # 生成安全的 JWT_SECRET（64 字符随机字符串）
        NEW_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 64)
        
        # 替换默认的 JWT_SECRET
        if [ "$(uname)" = "Darwin" ]; then
            # macOS
            sed -i '' "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" env.local
        else
            # Linux
            sed -i "s/JWT_SECRET=\"[^\"]*\"/JWT_SECRET=\"$NEW_SECRET\"/" env.local
        fi
        
        echo -e "${GREEN}✓ 已自动生成安全的 JWT_SECRET${NC}"
    fi
    
    [ ! -d "node_modules" ] && npm install
    echo -e "${GREEN}✓ 后端配置完成${NC}"
}

# 配置前端
setup_frontend() {
    echo -e "${YELLOW}配置前端...${NC}"
    cd "$INSTALL_DIR/frontend"
    [ ! -d "node_modules" ] && npm install
    echo -e "${GREEN}✓ 前端配置完成${NC}"
}

# 放行端口
open_firewall() {
    echo -e "${YELLOW}配置防火墙...${NC}"
    
    # firewalld (CentOS/RHEL/Fedora)
    if command -v firewall-cmd &> /dev/null; then
        $SUDO firewall-cmd --permanent --add-port=$FRONTEND_PORT/tcp 2>/dev/null || true
        $SUDO firewall-cmd --permanent --add-port=$BACKEND_PORT/tcp 2>/dev/null || true
        $SUDO firewall-cmd --reload 2>/dev/null || true
        echo -e "${GREEN}✓ firewalld 端口已放行${NC}"
    # ufw (Ubuntu/Debian)
    elif command -v ufw &> /dev/null; then
        $SUDO ufw allow $FRONTEND_PORT/tcp 2>/dev/null || true
        $SUDO ufw allow $BACKEND_PORT/tcp 2>/dev/null || true
        echo -e "${GREEN}✓ ufw 端口已放行${NC}"
    # iptables
    elif command -v iptables &> /dev/null; then
        $SUDO iptables -I INPUT -p tcp --dport $FRONTEND_PORT -j ACCEPT 2>/dev/null || true
        $SUDO iptables -I INPUT -p tcp --dport $BACKEND_PORT -j ACCEPT 2>/dev/null || true
        echo -e "${GREEN}✓ iptables 端口已放行${NC}"
    else
        echo -e "${YELLOW}⚠ 未检测到防火墙，跳过端口配置${NC}"
    fi
}

# 启动数据库
start_database() {
    echo -e "${YELLOW}启动数据库...${NC}"
    cd "$INSTALL_DIR"
    
    if docker info &> /dev/null; then
        docker compose up -d
    else
        $SUDO docker compose up -d
    fi
    
    echo "等待数据库就绪..."
    sleep 5
    echo -e "${GREEN}✓ 数据库已启动${NC}"
}

# 启动服务
start_services() {
    echo -e "${YELLOW}启动服务...${NC}"
    pkill -f 'npm run dev' 2>/dev/null || true
    sleep 2
    
    cd "$INSTALL_DIR/backend"
    nohup npm run dev > /dev/null 2>&1 &
    echo "等待后端启动 (约30-60秒)..."
    
    for i in {1..60}; do
        if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ 后端已启动${NC}"
            break
        fi
        sleep 2
    done
    
    cd "$INSTALL_DIR/frontend"
    nohup npm run dev > /dev/null 2>&1 &
    echo "等待前端启动..."
    sleep 5
    echo -e "${GREEN}✓ 前端已启动${NC}"
}

# 获取服务器 IP
get_server_ip() {
    # 尝试获取公网 IP
    PUBLIC_IP=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null || curl -s --connect-timeout 3 icanhazip.com 2>/dev/null || echo "")
    # 获取内网 IP
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -1)
}

# 显示结果
show_result() {
    get_server_ip
    
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}🎉 安装完成！${NC}"
    echo ""
    echo -e "  本地访问: ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
    [ -n "$LOCAL_IP" ] && echo -e "  内网访问: ${BLUE}http://$LOCAL_IP:$FRONTEND_PORT${NC}"
    [ -n "$PUBLIC_IP" ] && echo -e "  公网访问: ${BLUE}http://$PUBLIC_IP:$FRONTEND_PORT${NC}"
    echo ""
    echo -e "  管理后台: ${BLUE}http://localhost:$FRONTEND_PORT/admin${NC}"
    echo -e "  默认账号: ${YELLOW}admin${NC} / ${YELLOW}admin123456${NC}"
    echo ""
    echo -e "  项目目录: ${BLUE}$INSTALL_DIR${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  如果无法通过 IP 访问，请检查:${NC}"
    echo "   1. 云服务器安全组是否放行端口 $FRONTEND_PORT 和 $BACKEND_PORT"
    echo "   2. 系统防火墙是否放行端口"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo ""
    echo "常用命令:"
    echo "  启动服务: cd $INSTALL_DIR && ./scripts/start.sh"
    echo "  停止服务: pkill -f 'npm run dev'"
    echo "  卸载项目: curl -fsSL https://raw.githubusercontent.com/LZZLHY/start/main/scripts/uninstall.sh | bash"
    echo ""
}

# 主流程
main() {
    detect_os
    check_sudo
    
    echo ""
    echo -e "${BLUE}[1/9] 清理旧项目${NC}"
    cleanup_old_project
    
    echo ""
    echo -e "${BLUE}[2/9] 安装 Git${NC}"
    install_git
    
    echo ""
    echo -e "${BLUE}[3/9] 安装 Docker${NC}"
    install_docker
    
    echo ""
    echo -e "${BLUE}[4/9] 安装 Node.js${NC}"
    install_nodejs
    
    echo ""
    echo -e "${BLUE}[5/9] 克隆项目${NC}"
    clone_project
    
    echo ""
    echo -e "${BLUE}[6/9] 配置后端${NC}"
    setup_backend
    
    echo ""
    echo -e "${BLUE}[7/9] 配置前端${NC}"
    setup_frontend
    
    echo ""
    echo -e "${BLUE}[8/9] 配置防火墙${NC}"
    open_firewall
    
    echo ""
    echo -e "${BLUE}[9/9] 启动服务${NC}"
    start_database
    start_services
    
    show_result
}

main
