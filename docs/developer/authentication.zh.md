# 认证配置

openKMS 只有一条浏览器认证路径和一类机器/API 凭据：

- **浏览器：** 使用不透明的 `openkms_session` Cookie，由服务端 `auth_sessions` 表支撑。浏览器不会获得 OIDC 或本地 JWT。
- **CLI / API / 内部服务：** 使用 `Authorization: Bearer`，凭据可以是 OIDC JWT、本地 JWT 或 `okms.*` 个人 API Key。本地模式的 CLI 也可使用 HTTP Basic。

不存在第二种浏览器认证模式，也没有用于切换实现的功能开关。

## 选择认证模式

| `OPENKMS_AUTH_MODE` | 适用场景 |
|---|---|
| `oidc` | 用户通过 OIDC IdP（Keycloak、Entra ID、Okta 等）认证 |
| `local` | 用户存储在 openKMS PostgreSQL 中，使用用户名/邮箱 + 密码登录 |

前端通过 `GET /api/auth/public-config` 读取 `auth_mode`。只有在请求失败时，才使用 `VITE_AUTH_MODE` 作为回退值。

## OIDC 配置

### 1. 创建 IdP 客户端

浏览器 BFF 只需一个**机密客户端**：

| 配置项 | 值 |
|---|---|
| Client ID | `openkms-backend` |
| Client authentication | 开启 |
| Client secret | 与 `OPENKMS_OIDC_CLIENT_SECRET` 一致 |
| Standard flow | 开启 |
| Implicit flow | 关闭 |
| Direct access grants | 关闭 |
| Service accounts | 关闭 |
| Valid redirect URI | 与 `OPENKMS_OIDC_REDIRECT_URI` 完全一致 |
| Valid post-logout redirect URI | 与 `OPENKMS_FRONTEND_URL` 完全一致 |
| PKCE | S256（由后端发送） |
| `offline_access` | 可选；仅当 `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=true` 时启用 |

浏览器会重定向到 IdP，但 token 交换在后端完成。SPA 不持有 OIDC token。

原先的公开客户端 `openkms-frontend` 已不再被 SPA 使用。确认没有其他应用依赖后，应将其删除。

`openkms-cli` 需要独立机密客户端，开启 service accounts，不配置 redirect URI。`qa-agent` 和 worker 使用各自的客户端凭据。

### 2. 配置后端

```bash
OPENKMS_AUTH_MODE=oidc

OPENKMS_OIDC_ISSUER=http://localhost:8081/realms/openkms
OPENKMS_OIDC_CLIENT_ID=openkms-backend
OPENKMS_OIDC_CLIENT_SECRET=...
OPENKMS_OIDC_REDIRECT_URI=http://localhost:8102/login/oauth2/code/oidc

OPENKMS_FRONTEND_URL=http://localhost:5173
OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID=openkms-backend
```

后端从 `${OPENKMS_OIDC_ISSUER}/.well-known/openid-configuration` 自动发现 IdP 端点。

注意事项：

- `OPENKMS_OIDC_REDIRECT_URI` 必须与 IdP 的 Valid Redirect URI **逐字符一致**。
- 除非 IdP 客户端和用户都被允许使用 offline token，否则保持 `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=false`。若未获授权却请求该 scope，Keycloak 可能以 `CODE_TO_TOKEN_ERROR not_allowed` 拒绝 code exchange。
- 只要 IdP 会话允许刷新，普通 authorization-code refresh token 仍可用于续期。
- 生产环境应使用 HTTPS，并设置 `OPENKMS_SESSION_COOKIE_SECURE=true`。

### 3. 配置前端

前端不需要 OIDC client ID、client secret 或 redirect URI。仅可配置回退模式：

```bash
VITE_AUTH_MODE=oidc
```

## 本地认证配置

```bash
OPENKMS_AUTH_MODE=local
OPENKMS_ALLOW_SIGNUP=true
OPENKMS_LOCAL_SESSION_JWT_MINUTES=30
OPENKMS_LOCAL_JWT_EXP_HOURS=168
```

- `OPENKMS_ALLOW_SIGNUP` 控制 `POST /api/auth/register`；第一个注册用户成为管理员。
- `OPENKMS_LOCAL_SESSION_JWT_MINUTES` 控制浏览器 session 使用的短期 access JWT。
- `OPENKMS_LOCAL_JWT_EXP_HOURS` 继续用于非浏览器本地凭据，例如个人 API Key。
- 如果不需要开放注册，应在创建首个管理员后关闭自助注册。

## 会话行为

| 配置项 | 默认值 | 作用 |
|---|---|---|
| `OPENKMS_SESSION_IDLE_MINUTES` | `30` | 滑动空闲超时；有活动时顺延 |
| `OPENKMS_SESSION_ABSOLUTE_HOURS` | `12` | 会话绝对上限；refresh 不能延长 |
| `OPENKMS_SESSION_COOKIE_SECURE` | `false` | 为 session cookie 设置 `Secure`；HTTPS 环境应开启 |

浏览器 Cookie 的 `max_age` 为七天，但真正生效的是数据库中的 idle/absolute 时限。Cookie 仍存在，不代表 session 仍有效。

当 access token 临近过期时，openKMS 会在服务端刷新。显式调用 `POST /api/auth/refresh` 时还会轮换 session id；旧 id 在短时间内仍可用，以兼容并发请求。登出会撤销 session。

## 登出

- `POST /api/auth/logout` 撤销服务端 session 并清除 Cookie。
- `GET /api/auth/oidc/logout` 撤销 session；当 IdP 提供 `end_session_endpoint` 时，执行 RP-initiated logout。
- `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` 指向的客户端，其 post-logout redirect URI 必须包含 `OPENKMS_FRONTEND_URL`。

## 安全检查

- 生产环境的前端与后端均应通过 HTTPS 提供服务。
- HTTPS 环境下设置 `OPENKMS_SESSION_COOKIE_SECURE=true`。
- 只注册精确的 redirect URI；生产环境不要使用通配符。
- 除非 IdP 明确允许，不要启用 `offline_access`。
- `OPENKMS_SECRET_KEY` 与 `OPENKMS_DATASOURCE_ENCRYPTION_KEY` 必须稳定且保密。更换任一密钥都会使现有 session 失效。
- 撤销 session 不会撤销已经签发的 Bearer JWT；Bearer 凭据受自身 `exp` 或 API Key 撤销机制约束。
- 在对公网暴露后端之前，应在入口网关或专用限流层实现 login/refresh 限流。

## 常见错误

| 现象 | 检查项 |
|---|---|
| `Invalid parameter: redirect_uri` | `OPENKMS_OIDC_REDIRECT_URI` 是否与 IdP 客户端的 Valid Redirect URI 完全一致 |
| `CODE_TO_TOKEN_ERROR not_allowed` | 是否在未获授权时请求了 `offline_access`；取消该 scope，或为客户端和用户授予权限 |
| 登出仍使用旧 client id | 运行中的后端是否仍有导出的 `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID`；取消该环境变量并重启，使 `.env` 生效 |
| 登录成功但登出被 IdP 拒绝 | 客户端的 post-logout redirect URI 是否与 `OPENKMS_FRONTEND_URL` 完全一致 |

完整环境变量列表见[配置](configuration.md)。
