# 快速开始

两条路径：**Docker**（除 VLM 服务外全部容器化）或**本机**（后端与前端直接运行，Postgres 与 MinIO 仍用容器）。两种情况下 **VLM 服务**都单独运行，便于指向 Apple Silicon 或 GPU 机器，避免巨大镜像。

## 前置条件

- 任一路径均需 Docker（Compose v2）。
- 本机路径：Python 3.12+、[uv](https://github.com/astral-sh/uv)、Node.js 20+、npm。
- 文档解析：运行中的 **mlx-vlm** 服务（`vlm-server/README.md`，默认 `http://localhost:8101`）。

## 方案 A — 全部 Docker

```bash
# 1. 单独启动 VLM 服务（Apple Silicon / GPU 主机）。
cd vlm-server && ./start.sh

# 2. 配置密钥与认证。
cp backend/.env.example backend/.env
$EDITOR backend/.env

# 3. 构建并启动栈。
docker compose -f docker/docker-compose.yml up -d --build

# 4. 打开 SPA。
open http://localhost:8082
```

Compose 栈运行 Postgres（pgvector）、MinIO、FastAPI 后端、procrastinate worker 与 nginx 托管的前端。Worker 默认经 `host.docker.internal:8101` 访问主机上的 VLM。

端口、环境变量覆盖与 worker → VLM 细节见 [运维 · Docker](operations/docker.md)。

## 方案 B — 后端与前端在本机

```bash
# 1. VLM 服务（独立进程）。
cd vlm-server && ./start.sh

# 2. 环境文件。
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. 仅通过 Compose 启动 Postgres 与 MinIO。
cd docker && docker compose -f docker-compose.yml up -d postgres minio
cd ..

# 4. 后端（终端 1）。
cd backend && uv sync && alembic upgrade head
uvicorn app.main:app --reload --port 8102

# 5. 前端（终端 2）。
cd frontend && npm install && npm run dev
```

打开 <http://localhost:5173>。Vite 将 `/api` 与 `/internal-api` 代理到后端。

完整本机搭建（pgvector 排错、OIDC 配置、可选 QA Agent）见 [开发者环境搭建](developer/setup.md)。

## 启动之后

| 操作 | URL |
|------|-----|
| SPA（Docker） | <http://localhost:8082> |
| SPA（本机） | <http://localhost:5173> |
| 后端 OpenAPI | <http://localhost:8102/docs> |
| MinIO 控制台 | <http://localhost:9001>（见 `.env.example`） |

登录（OIDC 或本地），创建**文档通道**，上传文件，观察 worker 解析。
