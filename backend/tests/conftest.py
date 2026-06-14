"""Shared pytest fixtures for the backend test suite.

These fixtures spin up a dedicated PostgreSQL test database (separate from the
dev ``lattice`` database) and build the full schema from the SQLAlchemy
metadata. The models use PostgreSQL-specific column types (``UUID``/``JSONB``),
so tests run against a real Postgres instance rather than SQLite.

The session-scoped ``db_loop`` + ``session_factory`` pair lets Hypothesis
property tests drive async projection code: the loop and engine are created
once and reused across all generated examples, while each example opens a fresh
session inside a transaction that is rolled back for isolation.
"""

import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.infra.db.models  # noqa: F401  (registers all tables on Base.metadata)
from app.infra.db.base import Base

_DB_USER = os.environ.get("TEST_DB_USER", "lattice")
_DB_PASS = os.environ.get("TEST_DB_PASSWORD", "lattice")
_DB_HOST = os.environ.get("TEST_DB_HOST", "localhost")
_DB_PORT = os.environ.get("TEST_DB_PORT", "5432")
_TEST_DB_NAME = os.environ.get("TEST_DB_NAME", "lattice_test")

_ADMIN_URL = f"postgresql+asyncpg://{_DB_USER}:{_DB_PASS}@{_DB_HOST}:{_DB_PORT}/postgres"
_TEST_DB_URL = f"postgresql+asyncpg://{_DB_USER}:{_DB_PASS}@{_DB_HOST}:{_DB_PORT}/{_TEST_DB_NAME}"


@pytest.fixture(scope="session")
def db_loop():
    """A single persistent event loop reused across all examples in a session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def session_factory(db_loop):
    """Create the test database + schema once, yield an async session factory."""

    async def _setup():
        admin_engine = create_async_engine(_ADMIN_URL, isolation_level="AUTOCOMMIT")
        async with admin_engine.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": _TEST_DB_NAME},
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{_TEST_DB_NAME}"'))
        await admin_engine.dispose()

        engine = create_async_engine(_TEST_DB_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        return engine

    engine = db_loop.run_until_complete(_setup())
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    db_loop.run_until_complete(engine.dispose())
