# 运维 · Docker

完整栈以单个 `docker compose` 文件交付。本文为运行时/运维摘要；你应针对仓库中 [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) 提交变更（保持简短，Compose 为事实来源）。

## 运行什么

| 服务 | 镜像 | 说明 |
|------|------|------|
| `frontend` | `docker/Dockerfile.frontend` | Vite 构建由 nginx 提供；主机上唯一发布端口（**8082**） |
| `backend` | `docker/Dockerfile`（`backend` target） | FastAPI 监听 `8102`，无主机端口 |
| `worker` | `docker/Dockerfile`（`worker` target） | Procrastinate + `openkms-cli`；**`platform: linux/amd64`** 以便 Apple Silicon 经 QEMU 安装 Paddle wheel；镜像含 `libgl1`（OpenCV / PaddleX） |
| `postgres` | `pgvector/pgvector` | 数据库 + pgvector，无主机端口 |
| `minio` | `minio/minio` | S3 兼容存储；UI 可选 **9001** |

浏览器只访问 nginx **`http://localhost:8082`**，由 nginx 将 `/api`、`/internal-api`、认证路由与 MinIO 桶路径代理到后端。

## 启动

在仓库根目录：

```bash
cp docker/.env.example docker/.env   # 可选 — VLM URL、百度密钥、构建镜像
docker compose -f docker/docker-compose.yml up -d --build
open http://localhost:8082
```

或 **`cd docker`**，复制 **`.env.example`** → **`.env`**，运行 **`docker compose up -d --build`**（无需 **`--env-file`**）。

Compose 自动加载 **`docker/.env`**。从仓库根运行时 **`--env-file docker/.env`** 可选。OIDC 或 **`docker/.env.example`** 未列出的变量见 **`backend/.env.example`**。

关闭：

```bash
docker compose -f docker/docker-compose.yml down
```

## 访问 VLM 服务

Docker 栈**不包含** VLM 服务。请单独运行 **`mlx-vlm`**（`vlm-server/`，默认 **8101**），以便放在 Apple Silicon 或 GPU 机器上，避免巨大镜像。

Worker 容器经 Docker `host-gateway` 访问主机上的 VLM：

```text
OPENKMS_VLM_URL=http://host.docker.internal:8101
```

若 VLM 在其他地址，在 **`docker/.env`** 中覆盖 **`OPENKMS_VLM_URL`**。VLM 不可达时，**paddleocr-doc-parse** 任务会失败。

**baidu-doc-parse** 请在 **`docker/.env`** 设置 **`OPENKMS_BAIDU_CLOUD_API_KEY`** 与 **`OPENKMS_BAIDU_CLOUD_SECRET_KEY`**（可选 **`BAIDU_*_URL`** 覆盖；见 **`docker/.env.example`**）。

## 认证模式须与构建一致

前端镜像构建时烘焙 `VITE_AUTH_MODE`。Compose 默认**仅本地认证**（`docker-compose.yml` 无 OIDC 环境变量）。OIDC 须设 **`OPENKMS_AUTH_MODE=oidc`**、全部 **`OPENKMS_OIDC_*`**（见 **`backend/.env.example`**），并以 **`VITE_AUTH_MODE=oidc`** 重建前端 — 不能仅靠 **`docker/.env.example`**。

**openkms-cli** 默认 **`OPENKMS_CLI_BASIC_*`**；worker/scheduler 心跳使用 **`OPENKMS_WORKER_BASIC_*`**（local）或 **`OPENKMS_WORKER_OIDC_*`**（OIDC；client id 须列入 **`OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`**）。

## 另见

- [`docker/README.md`](https://github.com/yingrui/openKMS/blob/main/docker/README.md) — 与 Compose 同目录的权威短参考。
- [架构](../architecture.md) — 服务如何协作。
- [安全设计](../security.md) — 原则；[控制台与认证](../features/console-and-auth.md) — 部署中的 auth 模式与密钥。
