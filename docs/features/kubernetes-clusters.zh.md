# Kubernetes 集群

控制台中的 **已登记 Kubernetes 集群** 管理，供操作员与 Agent 使用。支持 **接入已有集群**（粘贴 kubeconfig、加密落库、连通性测试），并 **浏览** Namespace、Deployment、Service、Pod。控制台可 **apply** 白名单 YAML、**删除** 这些 kind、**查看 Pod 日志**，以及 **把 Service 登记到应用**。不包含云厂商建集群。

相关：[控制台与认证](console-and-auth.md)、[Agents](openkms-agents.md)、[应用构建器与应用](app-builder.md)、[API 参考](api-reference.md#kubernetes-clusters-consolekubernetes)、[数据模型](data-models.md#kubernetescluster)。

## 控制台 UI

- **列表：** `/console/kubernetes` — 登记、编辑、删除、测试连接；点击进入浏览
- **详情：** `/console/kubernetes/{id}` — 选择命名空间；Deployment、Service、Pod；Pod 日志；apply YAML；删除白名单对象；把 Service 登记到应用
- **权限：** `console:kubernetes`（或 `all` / admin）
- 表单：名称、描述、默认命名空间、可选 **API Server**（后端实际连接集群的地址）、kubeconfig YAML、可选 **跳过 TLS 校验**（仅实验/自签名环境）

API 响应永不包含 kubeconfig 明文，仅返回 `kubeconfig_configured` 与非敏感字段。

## 存储与加密

表 **`kubernetes_clusters`**。完整 kubeconfig 存于 **`kubeconfig_encrypted`**，与数据源 / 连接器共用 Fernet。

**`api_server`** 为显式覆盖地址；未填写时从 kubeconfig 解析。连通性测试与浏览会把当前 context 的 `server` 改写成该地址，因此 kubeconfig 里是 `127.0.0.1` 时，只要填写后端能到达的地址即可连接。更新时省略 kubeconfig（或传空字符串）保留原密文；`api_server: ""` 则回退为 kubeconfig 中的地址。

## 连通性测试

`POST /api/kubernetes-clusters/{id}/test` 解密 kubeconfig、构建客户端并调用 Version API；结果缓存到 `last_tested_at` / `last_test_ok`。

## 资源浏览

| 接口 | 用途 |
|------|------|
| `GET …/namespaces` | 命名空间列表 |
| `GET …/deployments?namespace=` | 指定命名空间的 Deployment（默认用集群 `default_namespace`） |
| `GET …/pods?namespace=` | 指定命名空间的 Pod |
| `GET …/services?namespace=` | Service（名称、类型、ClusterIP、端口） |
| `GET …/pods/{name}/logs` | 最近 Pod 日志（`tail`，可选 `container`） |
| `POST …/apply` | 创建或 patch YAML（`Deployment`、`Service`、`Pod`、`ConfigMap`） |
| `POST …/delete` | 删除一个白名单 namespaced 对象 |

控制台行操作与 skill 一致：日志 Dialog、确认删除、apply Dialog。响应永不返回 kubeconfig。

**登记到应用**（Service 行）：创建已发布的 `template_id=module` 应用，绑定 `cluster_id` / 命名空间 / Service / 端口。除 `console:kubernetes` 外还需 `ontology:write`。见 [应用构建器](app-builder.md#module-hosted-services)。

## Agents

**openkms** skill 可列出已登记集群、apply 同一套白名单 kind、拉取日志，以及 `kubernetes register-app`。API 密钥需要 **`console:kubernetes`**（登记应用还需要 **`ontology:write`**）。kubeconfig 始终在服务端解密。

## 仍未覆盖

- 云厂商自动建集群
- 项目级默认集群绑定
- Ingress / 公网 TLS / WebSocket 代理
- 把 A2UI 画布跑进 Pod
