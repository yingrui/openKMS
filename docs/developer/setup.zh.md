# openKMS 开发者环境搭建

完整环境变量参考：[配置](configuration.md)。

## 概览

- **后端**（`backend/`）：FastAPI 服务 + PostgreSQL，文档解析使用 PaddleOCRVL
- **VLM 服务**（`vlm-server/`）：MLX-VLM 服务 `http://localhost:8101` — PaddleOCRVL 的 VLM 后端
- **前端**（`frontend/`）：React/Vite；**`frontend/src/index.scss`** 加载 **`_css-variables`**、**`_global`**、**`_utilities`**。编译期 **`_tokens`** / **`_mixins`**。见 [design-system.md](design-system.md)。

### 数据库搭建

以 PostgreSQL 超级用户登录并执行：

```sql
CREATE USER openkms_user WITH PASSWORD 'openkms_user_password';
CREATE DATABASE openkms;
GRANT ALL PRIVILEGES ON DATABASE openkms TO openkms_user;

-- PostgreSQL 15+ 必需：允许 openkms_user 在 public schema 建表
\c openkms
GRANT ALL ON SCHEMA public TO openkms_user;
GRANT CREATE ON SCHEMA public TO openkms_user;
```

### pgvector（语义检索与知识库 embedding）

向量检索与 FAQ/分块 embedding 需要 PostgreSQL 的 **pgvector** 扩展。

1. 为服务器安装 pgvector（示例）：
   - **macOS：** `brew install pgvector`
   - **Docker：** 使用带 pgvector 的 Postgres 镜像（如 [`pgvector/pgvector`](https://github.com/pgvector/pgvector#docker-images)），或在容器内安装 `postgresql-<major>-pgvector`。
2. 以超级用户（或可创建扩展的角色）执行：

```sql
\c openkms
CREATE EXTENSION IF NOT EXISTS vector;
```

若 API 返回 **503** 且提示 *Vector search requires the pgvector extension…*，请安装 pgvector 并在 openKMS 库执行 `CREATE EXTENSION IF NOT EXISTS vector;`。

用 **`backend/dev.sh`** 启动后端时，会先运行 `scripts/ensure_pgvector.py` 检查或创建扩展（部分 Docker 环境可自动协助）。

### 文档解析方案

依赖包示例：

```
paddleocr==3.4.0
paddlepaddle==3.3.0
paddlex[ocr]==3.4.2
# 远程 VLM 后端（mlx-vlm-server、vllm-server 等）时 GenAIClient 需要
openai>=1.0.0
# paddleocr vl 模型建议 numpy 低于 2.4
numpy==2.3.5
```

示例代码：

```python
from pathlib import Path
from paddleocr import PaddleOCRVL

input_file = "..."
output_path = Path("./output")

pipeline = PaddleOCRVL(
  vl_rec_backend="mlx-vlm-server", 
  vl_rec_server_url="http://localhost:8101/",
  vl_rec_api_model_name="PaddlePaddle/PaddleOCR-VL-1.5",
  vl_rec_max_concurrency=3,
  )

output = pipeline.predict(input=input_file)

pages_res = list(output)

output = pipeline.restructure_pages(pages_res)

for res in output:
    res.print()  ## print structured prediction
    res.save_to_json(save_path="output")  ## save structured JSON for this page
    res.save_to_markdown(save_path="output")  ## save markdown for this page
```

### 开发服务与热重载

**`backend/dev.sh`**（端口 **8102**）与 **`qa-agent/dev.sh`**（端口 **8103**）在保存后重启。监听范围只覆盖代码（`--reload-dir app` / `--reload-dir qa_agent`），因此改 `alembic/`、`scripts/`、`.env` 需要手动重启。`OPENKMS_DEV_RELOAD=0` 可关闭 reloader，与生产一致。

reloader 把监听 socket 留在父进程：子进程在 accept 之前退出时，端口会接受连接却永不回应。`lsof -nP -iTCP:8102 -sTCP:LISTEN` 显示的是 reloader 的 pid 而子进程已不在，这是判据。

### 与后端集成

文档解析经 `openkms-cli` 流水线（由 procrastinate 任务调用），PaddleOCRVL 以 mlx-vlm-server 为 VLM 后端。流水线配置可关联 API 模型以获取 VLM URL 与模型名。后端本身不直接运行 PaddleOCR。

### VLM URL 与 embedding 配置

- 后端 **`.env`** 的 **`OPENKMS_VLM_URL`** 须指向 **mlx-vlm** HTTP 服务（默认 **`http://localhost:8101`**），即文档视觉解析 — **不是** chat/embedding 用的 OpenAI 兼容 **`/api/v1`** 基址。
- FastAPI **不**读取 **`OPENKMS_VLM_API_KEY`**、**`OPENKMS_EMBEDDING_MODEL_*`**。若 VLM 端点需要密钥，将 **`OPENKMS_VLM_API_KEY`** 放在 **`openkms-cli/.env`**。**`OPENKMS_EMBEDDING_MODEL_*`** 在 **`openkms-cli/.env`** 可选：**`kb-index`** 通常在 API 认证后从 **`GET /internal-api/models/kb-embedding-credentials`** 加载凭据；仅当需要与知识库存储的 embedding 模型不同端点时才用环境变量覆盖。

**完整栈搭建：**

1. 启动 vlm-server（mlx-vlm）做 VLM 推理：
   ```bash
   cd vlm-server && ./start.sh
   ```

2. 安装后端依赖（pyproject.toml + uv.lock 可复现安装）：
   ```bash
   cd backend && uv sync
   ```
   或用 pip：`pip install -e .`（从 pyproject.toml 安装）。重新生成 lock：`uv lock`

3. 运行数据库迁移并启动后端（默认端口 8102）：
   ```bash
   cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8102
   ```

### 认证

**模式：** 后端 `OPENKMS_AUTH_MODE` 设为 `oidc`（默认）或 `local`。前端通过 `GET /api/auth/public-config` 发现当前模式；仅在 API 不可达时（如离线构建检查）用 `VITE_AUTH_MODE` 作回退，并与后端保持一致以免出现兼容性横幅。

#### 本地认证（无外部 IdP）

1. 后端：`OPENKMS_AUTH_MODE=local`，运行迁移（`alembic upgrade head`）创建 `users` 表。
2. 前端：`VITE_AUTH_MODE=local`。
3. 可选：首个管理员存在后设 `OPENKMS_ALLOW_SIGNUP=false` 关闭公开注册。**首次**注册始终为管理员。
4. **openkms-cli**：`OPENKMS_AUTH_MODE=local`，`OPENKMS_CLI_BASIC_USER`、`OPENKMS_CLI_BASIC_PASSWORD`（须与后端一致）。仅在可信且无 TLS 的网络使用。

#### OIDC 搭建（任意符合标准的 IdP） {#oidc-setup-any-standards-compliant-idp}

浏览器认证由后端 BFF 处理，SPA 不持有 OIDC token。完整模型见[认证](authentication.md)。后端是**机密 OIDC client**，使用 Authorization Code + PKCE、state 和可选的 `offline_access`（服务端 refresh）。

1. **IdP client**（如 Keycloak 中 `openkms-backend`）：
   - 启用 authorization code flow；PKCE 由后端发送。
   - **Redirect URI**：`OPENKMS_OIDC_REDIRECT_URI`（默认 `http://localhost:8102/login/oauth2/code/oidc`）。
   - **登出后重定向**：SPA 源（如 `http://localhost:5173`）。
   - 只有 client/user 被允许时才启用 `offline_access`，并设置 `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=true`；默认 `false`（否则 Keycloak 可能以 `not_allowed` 拒绝 code exchange）。

2. **后端环境**（`.env`）：
   ```
   OPENKMS_AUTH_MODE=oidc
   OPENKMS_OIDC_ISSUER=http://localhost:8081/realms/openkms
   OPENKMS_OIDC_CLIENT_ID=openkms-backend
   OPENKMS_OIDC_CLIENT_SECRET=...
   OPENKMS_OIDC_REDIRECT_URI=http://localhost:8102/login/oauth2/code/oidc
   OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID=openkms-backend
   OPENKMS_FRONTEND_URL=http://localhost:5173
   ```
   后端从 `{issuer}/.well-known/openid-configuration` 加载 JWKS 与 OAuth 端点。

3. **前端环境**：只有 `public-config` 不可达时的回退有意义：
   ```
   VITE_AUTH_MODE=oidc
   ```
   SPA 不再保存 OIDC client id/secret 或 redirect URI。

4. **openkms-cli 客户端**（机器 / client credentials）：

   在 IdP 创建**机密**客户端（Keycloak 示例：启用 client credentials、service account）：
   - **Client ID**：`openkms-cli`（须在 backend **`OPENKMS_INTERNAL_SERVICE_CLIENT_IDS`** 中）
   - 在 `openkms-cli/.env` 设置 **`OPENKMS_OIDC_TOKEN_URL`**、**`OPENKMS_CLI_OIDC_CLIENT_ID`**、**`OPENKMS_CLI_OIDC_CLIENT_SECRET`**（**qa-agent** 共用 **`OPENKMS_AUTH_MODE`**、**`OPENKMS_OIDC_TOKEN_URL`**，另加 **`OPENKMS_QA_AGENT_OIDC_CLIENT_*`**）。

**IdP 登出错误**：确保 SPA 源在后端 client 的 post-logout redirect 允许列表中。

**Console 访问（OIDC）**：JWT `realm_access.roles` 中的 realm 角色 **`admin`** 仍授予完整 Console（`security_permissions` 全部键）。其他用户：`realm_access.roles` 中每个字符串须匹配 PostgreSQL 的 **`security_roles.name`** 行；该角色的权限键（来自**权限管理**）生效。将 IdP 角色名与安全角色名对齐（如 `member`、`content-editor`）。claim 形状不同的 IdP 可能需扩展 `auth.py` / `permission_resolution.py` 中的 JWT 解析。
