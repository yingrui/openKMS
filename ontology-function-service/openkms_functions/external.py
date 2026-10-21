"""Call a registered external HTTP service from a Function.

`client.external("turtle").post("/api/jobs", {...})` — the service (base URL, credential, allowed
path prefixes, timeout) is registered next to the Functions that use it, so the source code carries
a name rather than a URL and a secret.

The sandbox really does make the request (that is the chosen design: the Function runtime is not
proxied). What the registry buys is a single place to see and rotate the credential, and a path
allowlist the client refuses to step outside.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request

from openkms_functions.errors import OntologyApiError


class ExternalService:
    """One resolved external service. Use it via ``client.external(name)``."""

    def __init__(self, client: "ExternalClientProtocol", resolution: dict):
        self._client = client
        self.api_name = str(resolution.get("api_name") or "")
        self.kind = str(resolution.get("kind") or "http")
        #: `backend` for a cluster Service (the sandbox cannot resolve its DNS); `direct` otherwise.
        self.transport = str(resolution.get("transport") or "direct")
        self.base_url = str(resolution.get("base_url") or "").rstrip("/")
        self.auth_kind = str(resolution.get("auth_kind") or "none")
        self.auth_header_name = resolution.get("auth_header_name")
        self._secret = resolution.get("secret")
        self.allowed_paths = [str(p) for p in (resolution.get("allowed_paths") or [])]
        self.timeout_seconds = int(resolution.get("timeout_seconds") or 10)

    def get(self, path: str, *, query: dict | None = None) -> object:
        return self.request("GET", path, query=query)

    def post(self, path: str, body: object | None = None) -> object:
        return self.request("POST", path, body=body)

    def put(self, path: str, body: object | None = None) -> object:
        return self.request("PUT", path, body=body)

    def patch(self, path: str, body: object | None = None) -> object:
        return self.request("PATCH", path, body=body)

    def delete(self, path: str) -> object:
        return self.request("DELETE", path)

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict | None = None,
        body: object | None = None,
    ) -> object:
        self._check_path(path)
        if self.transport == "backend":
            return self._relay(method, path, query=query, body=body)
        url = self._url_for(path, query)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method.upper())
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if self.auth_kind == "bearer" and self._secret:
            req.add_header("Authorization", f"Bearer {self._secret}")
        elif self.auth_kind == "header" and self.auth_header_name and self._secret:
            req.add_header(str(self.auth_header_name), str(self._secret))
        elif self.auth_kind == "hmac" and self._secret:
            # Signed over the exact bytes sent, so the receiver can verify the body it got.
            digest = hmac.new(
                str(self._secret).encode("utf-8"), data or b"", hashlib.sha256
            ).hexdigest()
            req.add_header(str(self.auth_header_name or "X-OpenKMS-Signature"), f"sha256={digest}")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:2000]
            raise OntologyApiError(
                f"{self.api_name} {method.upper()} {path} failed: {detail or e.reason}",
                status_code=e.code,
            ) from e
        except urllib.error.URLError as e:
            raise OntologyApiError(f"{self.api_name} {method.upper()} {path} unreachable: {e.reason}") from e

    def _check_path(self, path: str) -> str:
        """Absolute URLs are refused and the path must match a registered prefix."""
        cleaned = (path or "").strip()
        if "://" in cleaned or not cleaned.startswith("/"):
            raise OntologyApiError(
                f"external({self.api_name!r}): path must start with '/' and be relative "
                f"(got {path!r})"
            )
        if not any(cleaned.startswith(prefix) for prefix in self.allowed_paths):
            raise OntologyApiError(
                f"external({self.api_name!r}): path {cleaned!r} is not in the allowed prefixes "
                f"{self.allowed_paths}"
            )
        return cleaned

    def _relay(
        self, method: str, path: str, *, query: dict | None, body: object | None
    ) -> object:
        """Ask the openKMS backend to make the call (cluster Service: no route from the sandbox)."""
        payload = self._client._request(  # noqa: SLF001 - the registry client is the only caller
            "POST",
            f"/api/ontology/external-services/by-api-name/"
            f"{urllib.parse.quote(self.api_name, safe='')}/call",
            body={
                "method": method.upper(),
                "path": self._check_path(path),
                "query": query,
                "body": body,
            },
        )
        if not isinstance(payload, dict):
            raise OntologyApiError(f"{self.api_name}: invalid relay response")
        status = int(payload.get("status") or 0)
        if status >= 400:
            raise OntologyApiError(
                f"{self.api_name} {method.upper()} {path} failed: {payload.get('body')}",
                status_code=status,
            )
        return payload.get("body")

    def _url_for(self, path: str, query: dict | None) -> str:
        cleaned = self._check_path(path)
        if not self.base_url:
            raise OntologyApiError(
                f"external({self.api_name!r}): no base_url — a cluster service is called through "
                "the backend"
            )
        url = f"{self.base_url}{cleaned}"
        if query:
            qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
            if qs:
                url = f"{url}?{qs}"
        return url


class ExternalClientProtocol:
    """What `ExternalService` needs from the Client (kept explicit for readability)."""

    def resolve_external_service(self, api_name: str) -> dict:  # pragma: no cover - protocol
        raise NotImplementedError
