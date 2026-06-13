"""Helpers for slot pin_mapping JSON and applying overrides when spawning pins."""

from __future__ import annotations

from typing import Any


def normalize_pin_mapping(raw: Any) -> list[dict[str, Any]]:
    if not raw:
        return []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        pin_number = item.get("pin_number")
        name = item.get("name")
        if pin_number is None:
            continue
        try:
            pin_number_int = int(pin_number)
        except (TypeError, ValueError):
            continue
        if pin_number_int < 1:
            continue
        if name is None:
            continue
        name_str = str(name).strip()
        if not name_str:
            continue
        out.append({"pin_number": pin_number_int, "name": name_str})
    return out


def pin_mapping_lookup(pin_mapping: Any) -> dict[int, str]:
    return {row["pin_number"]: row["name"] for row in normalize_pin_mapping(pin_mapping)}


def resolve_pin_name(
    pin_number: int,
    template_default: str,
    pin_mapping: Any | None = None,
) -> str:
    if pin_mapping is not None:
        override = pin_mapping_lookup(pin_mapping).get(pin_number)
        if override:
            return override
    return template_default


def pin_mapping_from_names(
    pins: list[dict[str, Any]],
    *,
    template_defaults: dict[int, str] | None = None,
) -> list[dict[str, Any]]:
    """Build slot pin_mapping from explicit pin names; omit default-number names."""
    out: list[dict[str, Any]] = []
    for row in pins:
        pin_number = int(row["pin_number"])
        name = str(row["name"]).strip()
        if not name:
            continue
        default = (template_defaults or {}).get(pin_number, str(pin_number))
        if name == default:
            continue
        out.append({"pin_number": pin_number, "name": name})
    return out
