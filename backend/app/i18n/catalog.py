"""Catalog of API error messages (English + Simplified Chinese)."""

from __future__ import annotations

from typing import Any

# Keys match stable ``code`` strings returned in JSON error bodies.
MESSAGES: dict[str, dict[str, str]] = {
    # Semantic-model queries (data layer). The `kind` in the response body says who can fix it:
    # definition (the model author), data (the source/credentials), request (the caller).
    "QUERY_METRIC_NOT_AGGREGATE": {
        "en": "The metric expression has to aggregate (SUM/AVG/COUNT/…) — either add an aggregate, or remove the group-by.",
        "zh_CN": "指标表达式必须做聚合（SUM/AVG/COUNT…）——请补上聚合，或去掉分组。",
    },
    "QUERY_UNKNOWN_COLUMN": {
        "en": "A field or metric references a column that no longer exists in the dataset. Re-seed the model's fields.",
        "zh_CN": "某个字段或指标引用了数据集中已不存在的列。请重新从数据集生成字段。",
    },
    "QUERY_UNKNOWN_TABLE": {
        "en": "The base dataset's table is missing from the data source. Re-check the dataset or re-sync it.",
        "zh_CN": "基表在数据源中已不存在。请检查该数据集或重新同步。",
    },
    "QUERY_UNKNOWN_FUNCTION": {
        "en": "The expression uses a function this data source does not have.",
        "zh_CN": "表达式使用了该数据源没有的函数。",
    },
    "QUERY_TYPE_MISMATCH": {
        "en": "The expression's type does not match the aggregation (for example summing text).",
        "zh_CN": "表达式的类型与聚合不匹配（例如对文本求和）。",
    },
    "QUERY_SYNTAX": {
        "en": "The metric expression is not valid SQL for this data source.",
        "zh_CN": "指标表达式对该数据源不是合法的 SQL。",
    },
    "QUERY_DEFINITION_INVALID": {
        "en": "The semantic model definition cannot be compiled into a query. Check the metric expression and its fields.",
        "zh_CN": "语义模型定义无法编译成查询。请检查指标表达式与其字段。",
    },
    "QUERY_PERMISSION_DENIED": {
        "en": "The data source's account is not allowed to read this table. Check the data-source credentials and grants.",
        "zh_CN": "数据源账号无权读取该表。请检查数据源凭据与授权。",
    },
    "QUERY_TIMEOUT": {
        "en": "The query went past the statement timeout. Narrow the time range or add filters.",
        "zh_CN": "查询超过了语句超时。请缩小时间范围或增加筛选。",
    },
    "QUERY_SOURCE_UNREACHABLE": {
        "en": "The data source could not be reached.",
        "zh_CN": "无法连接到数据源。",
    },
    "QUERY_FAILED": {
        "en": "The data source rejected the query. See the details for what it said.",
        "zh_CN": "数据源拒绝了该查询。详情见错误原文。",
    },
    # Grid row filters (Data tab): the caller picked a column/operator that does not apply.
    # Data Explorer: a run needs a source, and a semantic-model block needs a metric.
    "EXPLORER_SOURCE_KIND_UNKNOWN": {
        "en": "A report's source is a dataset or a semantic model — '{kind}' is neither.",
        "zh_CN": "报告的来源是数据集或语义模型——「{kind}」都不是。",
    },
    "EXPLORER_SOURCE_FORBIDDEN": {
        "en": "You do not have access to this report's source data.",
        "zh_CN": "你没有这份报告的数据源访问权限。",
    },
    "EXPLORER_SOURCE_MISSING": {
        "en": "This report has no {source} to analyze — pick one first.",
        "zh_CN": "该报告还没有可分析的{source}——请先选择。",
    },
    "EXPLORER_BLOCK_METRIC_MISSING": {
        "en": "A block of a semantic-model report needs a metric.",
        "zh_CN": "语义模型报告的区块需要一个指标。",
    },
    # Dataset summaries (Data tab / Explorer dataset blocks): group by + aggregates.
    "DATASET_AGGREGATE_MISSING": {
        "en": "A summary needs at least one aggregate (count / sum / avg / min / max).",
        "zh_CN": "汇总至少需要一个聚合（count / sum / avg / min / max）。",
    },
    "DATASET_AGGREGATE_BAD_FN": {
        "en": "'{fn}' is not an aggregate this platform runs (count / sum / avg / min / max).",
        "zh_CN": "「{fn}」不是平台支持的聚合（count / sum / avg / min / max）。",
    },
    "DATASET_AGGREGATE_BAD_GROUP": {
        "en": "A group column is a name or {column, granularity} — '{group}' is neither.",
        "zh_CN": "分组列是一个列名或 {column, granularity}——「{group}」都不是。",
    },
    "DATASET_AGGREGATE_BAD_GRAIN": {
        "en": "That grouping grain is not valid here ({column}).",
        "zh_CN": "该分组粒度在此不适用（{column}）。",
    },
    "DATASET_AGGREGATE_TOO_MANY": {
        "en": "Too many aggregates — at most {max} per summary.",
        "zh_CN": "聚合过多——每个汇总最多 {max} 个。",
    },
    "DATASET_AGGREGATE_TOO_MANY_GROUPS": {
        "en": "Too many group-by columns — at most {max}.",
        "zh_CN": "分组列过多——最多 {max} 个。",
    },
    "DATASET_AGGREGATE_DUPLICATE_NAME": {
        "en": "Duplicate output name '{name}' — give each aggregate its own name.",
        "zh_CN": "输出名「{name}」重复——请给每个聚合不同的名字。",
    },
    "DATASET_AGGREGATE_ORDER_UNKNOWN": {
        "en": "Cannot order by '{field}': group by it or aggregate it first.",
        "zh_CN": "不能按「{field}」排序——请先分组它或对它做聚合。",
    },
    "DATASET_ROWS_UNKNOWN_COLUMN": {
        "en": "There is no column '{column}' in this dataset.",
        "zh_CN": "该数据集里没有列「{column}」。",
    },
    "DATASET_ROWS_BAD_OPERATOR": {
        "en": "The operator '{op}' is not supported here.",
        "zh_CN": "不支持运算符「{op}」。",
    },
    "DATASET_ROWS_INVALID_FILTER": {
        "en": "That filter is not valid.",
        "zh_CN": "该筛选条件无效。",
    },
    "DATASET_ROWS_TOO_MANY_FILTERS": {
        "en": "Too many filters — at most {max} conditions can be combined.",
        "zh_CN": "筛选条件过多——最多可组合 {max} 个条件。",
    },
    "QUERY_UNKNOWN_METRIC": {
        "en": "That metric is not part of this semantic model.",
        "zh_CN": "该指标不属于此语义模型。",
    },
    "QUERY_UNKNOWN_DATASET": {
        "en": "The metric's base dataset no longer exists.",
        "zh_CN": "指标的基表已不存在。",
    },
    "QUERY_UNKNOWN_FIELD": {
        "en": "There is no field '{field}' in this metric's scope (its dataset, plus the datasets it joins).",
        "zh_CN": "指标作用域内没有字段「{field}」（作用域 = 指标自己的数据集 + 它 join 的数据集）。",
    },
    "QUERY_AMBIGUOUS_FIELD": {
        "en": "The field name '{field}' exists in several joined datasets ({datasets}) — address it by id.",
        "zh_CN": "字段名「{field}」在多个 join 的数据集中都存在（{datasets}）——请用字段 id 指定。",
    },
    "QUERY_ORDER_NOT_GROUPED": {
        "en": "Cannot order by a field that is not grouped — add it to the group-by first.",
        "zh_CN": "不能按未分组的字段排序——请先把它加入分组。",
    },
    "QUERY_INVALID_REQUEST": {
        "en": "The query request is not valid.",
        "zh_CN": "查询请求无效。",
    },
    "QUERY_UNSUPPORTED_SOURCE": {
        "en": "Queries only run on PostgreSQL datasets.",
        "zh_CN": "仅支持对 PostgreSQL 数据集执行查询。",
    },
    "INVALID_OR_EXPIRED_TOKEN": {
        "en": "Invalid or expired token",
        "zh_CN": "令牌无效或已过期",
    },
    "AUTHENTICATION_REQUIRED": {
        "en": "Authentication required",
        "zh_CN": "需要登录",
    },
    "ADMIN_ROLE_REQUIRED": {
        "en": "Admin role required",
        "zh_CN": "需要管理员角色",
    },
    "FORBIDDEN_GENERIC": {
        "en": "Forbidden",
        "zh_CN": "禁止访问",
    },
    "MISSING_PERMISSION": {
        "en": "Missing permission: {permission}",
        "zh_CN": "缺少权限：{permission}",
    },
    "MISSING_PERMISSION_ONE_OF": {
        "en": "Missing permission: need one of ({need})",
        "zh_CN": "缺少权限：需要以下之一（{need}）",
    },
    "NO_PERMISSIONS_PROVIDED": {
        "en": "No permissions provided",
        "zh_CN": "未提供权限配置",
    },
    "SERVICE_CLIENT_REQUIRED": {
        "en": "Service client required",
        "zh_CN": "需要服务客户端",
    },
    "BEARER_TOKEN_REQUIRED": {
        "en": "Bearer token required",
        "zh_CN": "需要 Bearer 令牌",
    },
    "OIDC_METADATA_MISSING_AUTH_ENDPOINT": {
        "en": "OIDC metadata missing authorization_endpoint",
        "zh_CN": "OIDC 元数据缺少 authorization_endpoint",
    },
    "REGISTRATION_LOCAL_ONLY": {
        "en": "Registration is only available in local auth mode",
        "zh_CN": "仅在本地认证模式下可注册",
    },
    "SIGNUP_DISABLED": {
        "en": "Sign up is disabled",
        "zh_CN": "已关闭注册",
    },
    "USERNAME_REQUIRED": {
        "en": "Username is required",
        "zh_CN": "用户名为必填项",
    },
    "EMAIL_OR_USERNAME_TAKEN": {
        "en": "Email or username already registered",
        "zh_CN": "邮箱或用户名已被注册",
    },
    "PASSWORD_LOGIN_LOCAL_ONLY": {
        "en": "Password login is only available in local auth mode",
        "zh_CN": "仅在本地认证模式下可使用密码登录",
    },
    "INVALID_CREDENTIALS": {
        "en": "Invalid username or password",
        "zh_CN": "用户名或密码错误",
    },
    "CANNOT_MANAGE_API_KEYS_PRINCIPAL": {
        "en": "Cannot manage API keys for this principal",
        "zh_CN": "当前主体无法管理 API 密钥",
    },
    "CANNOT_EDIT_PROFILE_PRINCIPAL": {
        "en": "Cannot update preferences for this principal",
        "zh_CN": "当前主体无法更新偏好设置",
    },
    "API_KEY_NOT_FOUND": {
        "en": "API key not found",
        "zh_CN": "未找到 API 密钥",
    },
    "INVALID_TOKEN": {
        "en": "Invalid token",
        "zh_CN": "令牌无效",
    },
    "SEARCH_INVALID_DATETIME_PARAM": {
        "en": "Invalid {label}: use ISO 8601 datetime",
        "zh_CN": "{label} 无效：请使用 ISO 8601 日期时间",
    },
    "SEARCH_RESOURCE_TYPES_FORBIDDEN": {
        "en": "You do not have permission to search the requested resource types.",
        "zh_CN": "您无权搜索所请求的资源类型。",
    },
    "SEARCH_DOCUMENT_CHANNEL_NOT_FOUND": {
        "en": "Document channel not found",
        "zh_CN": "未找到文档频道",
    },
    "SEARCH_ARTICLE_CHANNEL_NOT_FOUND": {
        "en": "Article channel not found",
        "zh_CN": "未找到文章频道",
    },
    "DOCUMENT_NOT_FOUND": {
        "en": "Document not found",
        "zh_CN": "未找到文档",
    },
    "DOCUMENT_CHANNEL_NOT_FOUND": {
        "en": "Channel not found",
        "zh_CN": "未找到频道",
    },
    "DOCUMENT_EMPTY_FILE": {
        "en": "Empty file",
        "zh_CN": "文件为空",
    },
}


def translate(code: str, locale: str, **params: Any) -> str:
    row = MESSAGES.get(code)
    if not row:
        return code
    lang = "zh_CN" if locale == "zh_CN" else "en"
    template = row.get(lang) or row["en"]
    if params:
        try:
            return template.format(**params)
        except KeyError:
            return template
    return template
