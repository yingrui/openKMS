"""一次性:用新的飞书纪要式 prompt 重生成已有媒体资产的摘要(复用现有转写稿,不重新转写)。

按 anli demo 环境的 DB 运行。对每个有 transcript 的 media_asset 调用 summarize_transcript
(新 system_prompt 产出 ## 分节 Markdown),写回 summary 列。顺序执行,避免 429。
"""
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_maker
from app.models.api_model import ApiModel
from app.models.media_asset import MediaAsset
from app.models.media_channel import MediaChannel  # noqa: F401 — 注册 media_channels 表以解析 FK
from app.services.media.media_understanding import summarize_transcript, transcript_plain_text

MODEL_ID = "model_2c2a9383"  # GLM-4.5 Chat


async def main() -> None:
    async with async_session_maker() as session:
        model = (
            await session.execute(
                select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == MODEL_ID)
            )
        ).scalar_one_or_none()
        if not model:
            print(f"model {MODEL_ID} not found", file=sys.stderr)
            return

        assets = (await session.execute(select(MediaAsset).where(MediaAsset.transcript.isnot(None)))).scalars().all()
        print(f"{len(assets)} media assets with transcript")
        for a in assets:
            text = transcript_plain_text(a.transcript)
            if not text.strip():
                print(f"- skip (empty transcript): {a.title}")
                continue
            summary = await summarize_transcript(text, a.title, model)
            if summary:
                a.summary = summary
                await session.commit()
                print(f"- OK: {a.title}  ({len(summary)} chars)")
            else:
                print(f"- FAIL (no summary returned): {a.title}")
        print("done")


if __name__ == "__main__":
    asyncio.run(main())
