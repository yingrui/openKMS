"""Database connection and session management."""
import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

from app.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""

    pass


engine = create_async_engine(
    settings.database_url,
    echo=settings.sql_echo,
    pool_pre_ping=True,   # Test connections before use; discard closed ones
    pool_recycle=300,     # Recycle connections before PostgreSQL idle timeout
    pool_size=10,         # Base pool size
    max_overflow=20,      # Allow overflow connections under load
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Create pgvector extension and database tables."""
    from app.models import document, document_channel, pipeline, api_model, api_provider, feature_toggle  # noqa: F401
    from app.models import knowledge_base, kb_document, faq, chunk  # noqa: F401
    from app.models import glossary, glossary_term  # noqa: F401
    from app.models import user  # noqa: F401
    from app.models import security_role, security_permission, access_group  # noqa: F401
    from app.models import system_settings  # noqa: F401
    from app.models import knowledge_map  # noqa: F401
    from app.models import wiki_models, agent_models  # noqa: F401
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            logger.warning("Could not create pgvector extension (requires superuser). Assuming it already exists.")
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI to get async database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
