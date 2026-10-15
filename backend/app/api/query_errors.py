"""Turn a classified query failure into the localized HTTP detail the Playground renders.

The data-layer service decides *what* failed (`QueryFailure`); the i18n catalog decides how to
say it in the caller's language; the client branches on `kind` (definition / data / request) to
decide where to point the user, and shows `detail` (the source's own text) in a details line.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request

from app.i18n.errors import error_detail_extra
from app.services.data_layer.query_errors import QueryFailure


def query_failure_detail(request: Request | None, failure: QueryFailure) -> dict[str, Any]:
    extra: dict[str, Any] = {"kind": failure.kind}
    if failure.detail:
        extra["detail"] = failure.detail
    return error_detail_extra(request, failure.code, extra=extra)
