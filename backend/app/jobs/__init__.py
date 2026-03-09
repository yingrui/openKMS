"""Procrastinate job queue setup."""
import procrastinate

from app.config import settings


def _build_conninfo() -> str:
    """Build PostgreSQL connection string for psycopg (procrastinate)."""
    return (
        f"host={settings.database_host} "
        f"port={settings.database_port} "
        f"user={settings.database_user} "
        f"password={settings.database_password} "
        f"dbname={settings.database_name}"
    )


job_app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(conninfo=_build_conninfo()),
    import_paths=["app.jobs.tasks"],
)
