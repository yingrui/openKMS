"""Media channel helpers."""

from __future__ import annotations

from app.models.media_channel import MediaChannel


def collect_media_channel_and_descendants(
    channels: list[MediaChannel], channel_id: str, out: set[str]
) -> None:
    out.add(channel_id)
    for c in channels:
        if c.parent_id == channel_id:
            collect_media_channel_and_descendants(channels, c.id, out)
