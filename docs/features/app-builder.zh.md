# 议事厅（Chamber）

**议事厅**托管登记到 Kubernetes **Service** 的 HTTP UI。用户在议事厅中打开；iframe 经 API 服务器代理。openKMS 负责认证并转发身份头，Service 无需自建登录。

实验性的 **A2UI 应用构建器**（Source / Design / OntoObjectList）已**移除**。未来若再做 A2UI，应放在 **Agent Project** 会话中，而不是本产品面。

## 登记 {#chamber-hosted-services}

| 路径 | 方式 |
|------|------|
| 控制台 → Kubernetes → 集群详情 | **登记到议事厅** |
| Skill | `kubernetes register-app …` 或 `apps create --bindings-json '{"k8s":{…}}'` |

需要 **`console:kubernetes`** 与 **`ontology:write`**。创建后立即**发布**（`template_id=module`）。

## 运行

单一 Suite App **议事厅**（`/chamber`）：

- 列表 / 管理：`/chamber`
- 运行：`/chamber/{id}` → iframe → `…/api/chamber/apps/{id}/proxy/`
- 设置（Service 绑定）：`/chamber/{id}/settings`

旧路径 `/apps` 与 `/app-builder` 会重定向到这里。不代理 WebSocket。资源宜用相对路径或 URL 子路径。

## 议事厅身份请求头 {#chamber-identity-headers}

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
| GET/POST | `/api/chamber/apps` | 列表 / 创建议事厅应用 |
| GET/PATCH/DELETE | `/api/chamber/apps/{id}` | 运行文档（已发布）/ 更新 / 删除 |
| POST | `/api/chamber/apps/{id}/publish` | 新绑定快照 |
| POST | `/api/chamber/apps/{id}/unpublish` | 取消发布 |
| GET | `/api/chamber/apps/{id}/versions` | 版本历史 |
| * | `/api/chamber/apps/{id}/proxy[/{path}]` | Session cookie 认证 |

存储表为 `chamber_apps` 与 `chamber_published_versions`。A2UI 草稿表 `app_components` 已删除。

## 相关

- [Kubernetes 集群](kubernetes-clusters.md)
- Skill：`references/kubernetes.md`、`apps` CLI（仅 module）
