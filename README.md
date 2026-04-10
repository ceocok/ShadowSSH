# ShadowSSH

一个轻量、固定布局、偏原生客户端体验的 Web SSH 工具。

ShadowSSH 的定位不是“大而全后台”，而是更接近桌面 SSH 客户端的使用方式：

- 多标签 SSH 会话
- SFTP 文件浏览与上传
- 自动恢复上次会话
- 移动端可用
- Docker 一键部署

## 特性

- 轻量 SSH 工作台
  - 顶部单会话标签栏
  - 固定布局
  - 精简左侧信息与文件区
- SFTP 文件操作
  - 浏览目录
  - 上传文件
  - 新建文件夹
  - 新建文件
- 连接管理
  - 新增服务器
  - 编辑服务器
  - 删除服务器
  - 快速连接已保存服务器
- 自动连接
  - 刷新后恢复上次打开的服务器标签
  - 支持同一服务器多开标签
- 移动端优化
  - 系统键盘弹出时自动调整布局
  - 可选虚拟终端辅助键盘
- Docker 优先
  - 前后端镜像分离
  - 支持 `amd64` / `arm64`

## 技术栈

- Frontend
  - Vue 3
  - Pinia
  - Vue Router
  - Vue I18n
  - xterm.js
  - Element Plus
- Backend
  - Node.js
  - Express
  - ws
  - ssh2
  - sqlite3

## 项目结构

```text
shadowssh/
├── docker-compose.yml
├── package.json
├── packages/
│   ├── frontend/
│   │   ├── src/
│   │   └── Dockerfile
│   └── backend/
│       ├── src/
│       ├── data/
│       └── Dockerfile
└── docker-images/
```

## 快速开始

### 方式一：直接使用已发布镜像

当前 `docker-compose.yml` 已改成直接拉取镜像：

- `ceocok/shadowssh-frontend:latest`
- `ceocok/shadowssh-backend:latest`

启动：

```bash
docker compose pull
docker compose up -d
```

默认访问地址：

- [http://127.0.0.1:18111](http://127.0.0.1:18111)

首次启动时会进入初始化页面，用于创建管理员账号和密码。

### 方式二：本地源码开发

安装依赖：

```bash
npm install
```

启动后端：

```bash
npm run dev:backend
```

启动前端：

```bash
npm run dev:frontend
```

前端默认开发地址通常为：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Docker 运行说明

### 当前 compose 行为

`docker-compose.yml` 当前是生产部署版：

- 不再本地 build
- 直接拉取远端镜像
- 自动重启
- 将宿主机 `./data` 挂载到容器 `/app/data`

### 数据目录

运行时数据保存在：

- `./data`

包括：

- SQLite 数据库
- Session 数据
- 运行时生成内容

如果你要重置数据，只需要删除 `./data` 下的运行文件即可。

## 手动运行容器

如果你不想用 compose，也可以直接运行：

```bash
docker network create shadowssh-network 2>/dev/null || true
docker rm -f shadowssh-frontend shadowssh-backend 2>/dev/null || true
mkdir -p data

docker run -d \
  --name shadowssh-backend \
  --network shadowssh-network \
  --network-alias backend \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -v "$(pwd)/data:/app/data" \
  ceocok/shadowssh-backend:latest

docker run -d \
  --name shadowssh-frontend \
  --network shadowssh-network \
  -p 18111:80 \
  ceocok/shadowssh-frontend:latest
```

## 多架构镜像构建

前端：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f packages/frontend/Dockerfile \
  -t ceocok/shadowssh-frontend:latest \
  --push .
```

后端：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f packages/backend/Dockerfile \
  -t ceocok/shadowssh-backend:latest \
  --push .
```

推送后可检查 manifest：

```bash
docker buildx imagetools inspect ceocok/shadowssh-frontend:latest
docker buildx imagetools inspect ceocok/shadowssh-backend:latest
```

## 常用命令

查看容器状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

停止：

```bash
docker compose down
```

## 当前产品方向

ShadowSSH 当前已经收缩成更纯的 SSH 客户端，重点保留：

- SSH
- SFTP
- 基础连接管理
- 多标签会话
- 移动端使用体验

已经删除了大量旧平台化功能，例如：

- 仪表盘
- 通知管理
- 审计日志
- 代理管理
- Docker 管理
- RDP / VNC
- Passkey / TOTP / CAPTCHA

## License

MIT
