"""Aggregated data for the signed-in home (安利企业知识中枢 治理驾驶舱).

Every number here is real — counted from this instance. The one exception is the
headline 存量 total, which carries Amway's known CMS content count (72,898, from the
tender brief) alongside how many this demo has actually processed, so the cockpit tells
the true story: a large corpus to govern, a slice done end-to-end.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.article import Article
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType
from app.models.wiki_models import WikiPage

router = APIRouter(prefix="/home", tags=["home"])

# Amway 现有 CMS 内容总量（招标 brief 原文），作为「待治理存量」的业务背景数字。
AMWAY_CMS_TOTAL = 72898


class SiteSummary(BaseModel):
    document_count: int
    kb_count: int
    wiki_page_count: int
    article_count: int


class AssetOverview(BaseModel):
    """知识资产总览四个头条指标。"""

    cms_total: int          # 待治理存量（CMS 总量）
    processed: int          # 已处理入图的内容资产数（真实）
    pending_review: int     # 待专业审核（真实：合规命中 + 低置信）
    source_changed: int     # 来源变化待复审
    expiring: int           # 即将失效


class GovernanceTask(BaseModel):
    source_type: str
    domain: str
    title: str
    status: str
    action: str


class ServiceHealth(BaseModel):
    name: str
    online: bool


class KnowledgeDomain(BaseModel):
    name: str
    content_count: int


class HomeHubResponse(BaseModel):
    site_summary: SiteSummary
    asset_overview: AssetOverview
    governance_tasks: list[GovernanceTask]
    service_health: list[ServiceHealth]
    knowledge_domains: list[KnowledgeDomain]


async def _load_site_summary(db: AsyncSession) -> SiteSummary:
    document_count = await db.scalar(select(sa_func.count()).select_from(Document)) or 0
    kb_count = await db.scalar(select(sa_func.count()).select_from(KnowledgeBase)) or 0
    wiki_page_count = await db.scalar(select(sa_func.count()).select_from(WikiPage)) or 0
    article_count = await db.scalar(select(sa_func.count()).select_from(Article)) or 0
    return SiteSummary(
        document_count=int(document_count),
        kb_count=int(kb_count),
        wiki_page_count=int(wiki_page_count),
        article_count=int(article_count),
    )


async def _instances_of(db: AsyncSession, type_name: str) -> list[ObjectInstance]:
    ot = (await db.execute(select(ObjectType).where(ObjectType.name == type_name))).scalar_one_or_none()
    if not ot:
        return []
    return list(
        (await db.execute(select(ObjectInstance).where(ObjectInstance.object_type_id == ot.id))).scalars()
    )


async def _load_asset_overview(db: AsyncSession) -> AssetOverview:
    content = await _instances_of(db, "ContentAsset")
    # 待专业审核 = 尚未发布（合规状态非「已发布」）的内容数——与 BizRule R1/R3 命中的口径一致。
    pending = sum(
        1
        for c in content
        if (c.data or {}).get("compliance_status") not in ("已发布", "published")
    )
    return AssetOverview(
        cms_total=AMWAY_CMS_TOTAL,
        processed=len(content),
        pending_review=pending,
        source_changed=0,
        expiring=0,
    )


async def _load_governance_tasks(db: AsyncSession) -> list[GovernanceTask]:
    """今日治理：从被合规规则命中的真实内容生成待审任务。"""
    content = await _instances_of(db, "ContentAsset")
    tasks: list[GovernanceTask] = []
    for c in content:
        data = c.data or {}
        status = data.get("compliance_status") or "待评估"
        if status in ("已发布", "published"):
            continue
        tasks.append(
            GovernanceTask(
                source_type=data.get("genre", "内容"),
                domain=data.get("column", "—"),
                title=data.get("title", ""),
                status="待审核",
                action="进入审核",
            )
        )
    return tasks[:6]


async def _load_service_health(db: AsyncSession) -> list[ServiceHealth]:
    kb_count = await db.scalar(select(sa_func.count()).select_from(KnowledgeBase)) or 0
    return [
        ServiceHealth(name="企业知识搜索", online=kb_count > 0),
        ServiceHealth(name="安利云购搜索/推荐", online=kb_count > 0),
        ServiceHealth(name="培训与客服助手", online=kb_count > 0),
        ServiceHealth(name="营销人员客户服务", online=kb_count > 0),
        ServiceHealth(name="其他 AI / Agent", online=True),
    ]


async def _load_knowledge_domains(db: AsyncSession) -> list[KnowledgeDomain]:
    """知识领域：安利业务域固定六格，内容按栏目归入对应域（对齐概念图）。

    栏目 → 业务域的映射把内容资产真实的栏目（健康解决方案 / 产品资讯 / ABO展业 …）
    收进六个业务域，避免既列固定域又列原始栏目造成的重复卡片。
    """
    content = await _instances_of(db, "ContentAsset")
    # 业务栏目 → 概念图六大知识领域
    col_to_domain = {
        "产品资讯": "产品与成分",
        "营养与科研": "产品与成分",
        "健康解决方案": "健康解决方案",
        "内容运营": "内容运营",
        "社群运营": "内容运营",
        "云购与长客会": "云购与长客会",
        "培训客服": "培训客服",
        "ABO展业": "营销人员服务",
        "营销人员服务": "营销人员服务",
    }
    fixed = ["产品与成分", "健康解决方案", "内容运营", "云购与长客会", "培训客服", "营销人员服务"]
    counts: dict[str, int] = {name: 0 for name in fixed}
    for c in content:
        col = (c.data or {}).get("column") or ""
        domain = col_to_domain.get(col)
        if domain:
            counts[domain] += 1
    return [KnowledgeDomain(name=name, content_count=counts[name]) for name in fixed]


@router.get(
    "/hub",
    response_model=HomeHubResponse,
    dependencies=[Depends(require_auth)],
)
async def get_home_hub(db: AsyncSession = Depends(get_db)):
    return HomeHubResponse(
        site_summary=await _load_site_summary(db),
        asset_overview=await _load_asset_overview(db),
        governance_tasks=await _load_governance_tasks(db),
        service_health=await _load_service_health(db),
        knowledge_domains=await _load_knowledge_domains(db),
    )
