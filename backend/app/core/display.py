def resolve_display_name(
    *,
    template_name: str,
    nickname: str | None,
    use_template_name: bool,
) -> str:
    primary, _ = resolve_connector_labels(
        template_name=template_name,
        nickname=nickname,
        use_template_name=use_template_name,
    )
    return primary


def resolve_connector_labels(
    *,
    template_name: str,
    nickname: str | None,
    use_template_name: bool,
) -> tuple[str, str | None]:
    """Return primary label and optional template subtitle for connector instances."""
    cleaned = nickname.strip() if nickname else None
    if use_template_name or not cleaned:
        return template_name, None
    return cleaned, template_name


def effective_instance_nickname(
    instance_nickname: str | None,
    slot_nickname: str | None = None,
) -> str | None:
    """Instance nickname wins; fall back to connector-slot nickname from the library."""
    if instance_nickname and instance_nickname.strip():
        return instance_nickname.strip()
    if slot_nickname and slot_nickname.strip():
        return slot_nickname.strip()
    return None


def resolve_connector_with_slot(
    *,
    template_name: str,
    instance_nickname: str | None,
    use_template_name: bool,
    slot_key: str | None = None,
    slot_nickname: str | None = None,
) -> tuple[str, str | None, str | None]:
    """Resolve connector display: primary label, template subtitle, slot key chip."""
    nickname = effective_instance_nickname(instance_nickname, slot_nickname)
    if nickname:
        return nickname, template_name, slot_key
    return template_name, None, slot_key
