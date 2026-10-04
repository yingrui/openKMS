# Kubernetes 集群

控制台中的 **已登记 Kubernetes 集群** 管理，供 Agent（及后续部署工具）使用。支持 **接入已有集群**（粘贴 kubeconfig、加密落库、连通性测试），以及 **只读浏览** Namespace、Deployment、Pod。不包含云厂商建集群与 Agent 部署工具。

相关：[控制台与认证](console-and-auth.md)、[Agents](openkms-agents.md)、[API 参考](api-reference.md#kubernetes-clusters-consolekubernetes)、[数据模型](data-models.md#kubernetescluster)。

## 控制台 UI

- **列表：** `/console/kubernetes` — 登记、编辑、删除、测试连接；点击进入浏览
- **详情：** `/console/kubernetes/{id}` — 选择命名空间，刷新 Deployment 与 Pod（只读）
- **权限：** `console:kubernetes`（或 `all` / admin）
- 表单：名称、描述、默认命名空间、可选 **API Server**（后端实际连接集群的地址）、kubeconfig YAML、可选 **跳过 TLS 校验**（仅实验/自签名环境）

API 响应永不包含 kubeconfig 明文，仅返回 `kubeconfig_configured` 与非敏感字段。

## 存储与加密

表 **`kubernetes_clusters`**。完整 kubeconfig 存于 **`kubeconfig_encrypted`**，与数据源 / 连接器共用 Fernet。

**`api_server`** 为显式覆盖地址；未填写时从 kubeconfig 解析。连通性测试与浏览会把当前 context 的 `server` 改写成该地址，因此 kubeconfig 里是 `127.0.0.1` 时，只要填写后端能到达的地址即可连接。更新时省略 kubeconfig（或传空字符串）保留原密文；`api_server: ""` 则回退为 kubeconfig 中的地址。

## 连通性测试

`POST /api/kubernetes-clusters/{id}/test` 解密 kubeconfig、构建客户端并调用 Version API；结果缓存到 `last_tested_at` / `last_test_ok`。

## 资源浏览（只读）

| 接口 | 用途 |
|------|------|
| `GET …/namespaces` | 命名空间列表 |
| `GET …/deployments?namespace=` | 指定命名空间的 Deployment（默认用集群 `default_namespace`） |
| `GET …/pods?namespace=` | 指定命名空间的 Pod |

控制台 **不提供** 创建 / 扩缩 / 删除工作负载。

## Agents（下一阶段）

集群登记与浏览是 Agent 向 Kubernetes 部署代码的基础。**Agents 尚未**读取这些凭据或暴露部署工具。见 [Agents](openkms-agents.md)。

## 仍未覆盖

- 云厂商自动建集群
- 项目级默认集群绑定
- Agent shell / 部署 tool 注入
- 控制台变更集群资源
