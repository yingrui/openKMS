"""Catalog of API error messages (English + Simplified Chinese)."""

from __future__ import annotations

from typing import Any

# Keys match stable ``code`` strings returned in JSON error bodies.
MESSAGES: dict[str, dict[str, str]] = {
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
