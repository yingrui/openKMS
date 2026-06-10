"""Dispatch sync connector jobs by kind."""

from __future__ import annotations

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector


async def run_connector_sync_for_row(
    db: AsyncSession,
    connector: Connector,
    *,
    start_date: date | str | None = None,
    end_date: date | str | None = None,
) -> dict[str, int]:
    if connector.kind == "tushare":
        from app.services.connector_sync.tushare.sync import sync_tushare_connector

        return await sync_tushare_connector(
            db, connector, start_date=start_date, end_date=end_date
        )
    raise ValueError(f"Sync is not implemented for connector kind '{connector.kind}'.")
