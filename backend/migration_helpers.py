from alembic import op
from sqlalchemy import inspect


def column_exists(table_name: str, column_name: str) -> bool:
    insp = inspect(op.get_bind())
    return any(c["name"] == column_name for c in insp.get_columns(table_name))


def table_exists(table_name: str) -> bool:
    return inspect(op.get_bind()).has_table(table_name)


def fk_exists(table_name: str, fk_name: str) -> bool:
    insp = inspect(op.get_bind())
    return any(fk["name"] == fk_name for fk in insp.get_foreign_keys(table_name))
