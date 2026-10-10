# 应用（托管模块）

openKMS **应用**是登记到 Kubernetes **Service** 的托管 HTTP UI。用户在「应用」图库中打开；iframe 经 API 服务器代理。openKMS 负责认证并转发身份头，Service 无需自建登录。

实验性的 **A2UI 应用构建器**（Source / Design / OntoObjectList）已**移除**。未来若再做 A2UI，应放在 **Agent Project** 会话中，而不是本产品面。

## 登记

| 路径 | 方式 |
|------|------|
| 控制台 → Kubernetes → 集群详情 | **登记到应用** |
| Skill | `kubernetes register-app …` 或 `apps create --bindings-json '{"k8s":{…}}'` |

需要 **`console:kubernetes`** 与 **`ontology:write`**。创建后立即**发布**（`template_id=module`）。

## 运行

单一 Suite App **应用**（`/apps`）：

- 列表 / 管理：`/apps`
- 运行：`/apps/{id}` → iframe → `…/api/app-builder/apps/{id}/proxy/`
- 设置（Service 绑定）：`/apps/{id}/settings`

旧路径 `/app-builder` 会重定向到这里。不代理 WebSocket。资源宜用相对路径或 URL 子路径。

## 模块身份请求头 {#module-identity-headers}

每次代理请求会带上（UTF-8 percent-encoded）：

- `X-Openkms-User-Id`
- `X-Openkms-Username`
- `X-Openkms-User-Name`
- `X-Openkms-User-Email`
- `X-Openkms-User-Admin`

用户数据以 `X-Openkms-User-Id` 为键。缺失时返回 `401`。不要用 Ingress / NodePort 对终端用户暴露 Service。

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/app-builder/apps` | 列表 / 创建 module 应用 |
| GET/PATCH/DELETE | `/api/app-builder/apps/{id}` | 运行文档（已发布）/ 更新 / 删除 |
| POST | `/api/app-builder/apps/{id}/publish` | 新绑定快照 |
| POST | `/api/app-builder/apps/{id}/unpublish` | 取消发布 |
| GET | `/api/app-builder/apps/{id}/versions` | 版本历史 |
| * | `/api/app-builder/apps/{id}/proxy[/{path}]` | Session cookie 认证 |

表名仍为 `ontology_apps`（历史命名）。A2UI 草稿表 `app_components` 已删除。

## 相关

- [Kubernetes 集群](kubernetes-clusters.md)
- Skill：`references/kubernetes.md`、`apps` CLI（仅 module）
