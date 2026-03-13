import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Add backend to path for app imports
sys.path.insert(0, ".")

from app.config import settings
from app.database import Base
import app.models.document  # noqa: F401 - register models with Base.metadata
import app.models.document_channel  # noqa: F401 - register models with Base.metadata
import app.models.pipeline  # noqa: F401 - register models with Base.metadata
import app.models.api_model  # noqa: F401 - register models with Base.metadata
import app.models.api_provider  # noqa: F401 - register models with Base.metadata
import app.models.feature_toggle  # noqa: F401 - register models with Base.metadata
import app.models.knowledge_base  # noqa: F401 - register models with Base.metadata
import app.models.kb_document  # noqa: F401 - register models with Base.metadata
import app.models.faq  # noqa: F401 - register models with Base.metadata
import app.models.chunk  # noqa: F401 - register models with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Use database URL from app config
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

EXCLUDE_TABLES = {"procrastinate_jobs", "procrastinate_events",
                  "procrastinate_periodic_defers", "procrastinate_workers"}


def include_name(name, type_, parent_names):
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
