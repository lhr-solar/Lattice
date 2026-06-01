def resolve_display_name(
    *,
    template_name: str,
    nickname: str | None,
    use_template_name: bool,
) -> str:
    if use_template_name:
        return template_name
    return nickname or template_name
