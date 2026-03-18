#!/usr/bin/env python3
"""Create mock diseases, insurance products, and disease-insurance relationships in DB.

Creates schema 'mock' with tables:
  - diseases
  - insurance_products
  - disease_insurance_product (link table)

Run from project root: python backend/scripts/seed_mock_insurance_data.py

After running, add these as Datasets in Console:
  - mock.diseases
  - mock.insurance_products
  - mock.disease_insurance_product
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    load_dotenv(env_file)

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def get_db_url() -> str:
    """Build async PostgreSQL URL from env."""
    host = os.getenv("OPENKMS_DATABASE_HOST", "localhost")
    port = os.getenv("OPENKMS_DATABASE_PORT", "5432")
    user = os.getenv("OPENKMS_DATABASE_USER", "postgres")
    password = os.getenv("OPENKMS_DATABASE_PASSWORD", "")
    name = os.getenv("OPENKMS_DATABASE_NAME", "openkms")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}?ssl=prefer"


# Mock data: (id, name, icd_code, description, parent_id)
# Parents have parent_id=None; children reference parent id (e.g. Heart Disease is parent of Coronary Heart Disease)
DISEASES = [
    # Parent categories
    ("dp01", "Heart Disease", None, "General category for conditions affecting the heart", None),
    ("dp02", "Metabolic Disorder", None, "Disorders of metabolism", None),
    ("dp03", "Respiratory Disease", None, "Conditions affecting the lungs and airways", None),
    ("dp04", "Cardiovascular Disease", None, "Conditions affecting heart and blood vessels", None),
    ("dp05", "Kidney Disease", None, "Conditions affecting kidney function", None),
    ("dp06", "Mental Health Disorder", None, "Conditions affecting mood and mental state", None),
    ("dp07", "Arthritis", None, "Inflammatory and degenerative joint conditions", None),
    # Child diseases (specific conditions under parents)
    ("d01", "Diabetes Type 2", "E11", "Chronic metabolic disorder affecting blood sugar regulation", "dp02"),
    ("d02", "Hypertension", "I10", "High blood pressure, often asymptomatic", "dp04"),
    ("d03", "Asthma", "J45", "Chronic respiratory condition causing airway inflammation", "dp03"),
    ("d04", "Coronary Heart Disease", "I25", "Reduced blood flow to the heart muscle", "dp01"),
    ("d05", "Chronic Kidney Disease", "N18", "Progressive loss of kidney function", "dp05"),
    ("d06", "Major Depressive Disorder", "F32", "Mood disorder causing persistent sadness", "dp06"),
    ("d07", "Osteoarthritis", "M17", "Degenerative joint disease", "dp07"),
    ("d08", "Rheumatoid Arthritis", "M06", "Autoimmune inflammatory joint disease", "dp07"),
    ("d09", "Heart Failure", "I50", "Heart cannot pump enough blood to meet body needs", "dp01"),
    ("d10", "Atrial Fibrillation", "I48", "Irregular heart rhythm, often causing poor blood flow", "dp01"),
]

INSURANCE_PRODUCTS = [
    ("ip01", "Aetna Managed Choice HMO", "individual", "low"),
    ("ip02", "Aetna Open Choice PPO", "individual", "medium"),
    ("ip03", "UnitedHealthcare Advantage", "individual", "high"),
    ("ip04", "Blue Cross Blue Shield Blue Advantage", "family", "medium"),
    ("ip05", "Cigna Plus PPO", "individual", "high"),
    ("ip06", "Humana Gold Plus Medicare Advantage", "individual", "high"),
    ("ip07", "Anthem EPO", "group", "low"),
    ("ip08", "UnitedHealthcare Value", "group", "medium"),
]

# disease_id -> list of insurance_product_ids (which products cover which diseases)
# Only specific diseases (not parent categories) are linked to products
DISEASE_INSURANCE_MAP = {
    "d01": ["ip01", "ip02", "ip03", "ip04", "ip05", "ip06", "ip07", "ip08"],
    "d02": ["ip01", "ip02", "ip03", "ip04", "ip05", "ip06", "ip07", "ip08"],
    "d03": ["ip01", "ip02", "ip03", "ip04", "ip05", "ip07", "ip08"],
    "d04": ["ip02", "ip03", "ip04", "ip05", "ip06", "ip08"],
    "d05": ["ip03", "ip05", "ip06", "ip08"],
    "d06": ["ip02", "ip03", "ip04", "ip05", "ip07", "ip08"],
    "d07": ["ip01", "ip02", "ip03", "ip04", "ip05", "ip06", "ip07", "ip08"],
    "d08": ["ip02", "ip03", "ip04", "ip05", "ip06", "ip08"],
    "d09": ["ip02", "ip03", "ip04", "ip05", "ip06", "ip08"],
    "d10": ["ip02", "ip03", "ip04", "ip05", "ip06", "ip08"],
}


async def main() -> int:
    url = get_db_url()
    engine = create_async_engine(url)

    try:
        async with engine.begin() as conn:
            # Create schema
            await conn.execute(text("CREATE SCHEMA IF NOT EXISTS mock"))

            # Drop tables to allow schema changes (parent_id column)
            await conn.execute(text("DROP TABLE IF EXISTS mock.disease_insurance_product"))
            await conn.execute(text("DROP TABLE IF EXISTS mock.diseases"))

            # Create tables
            await conn.execute(text("""
                CREATE TABLE mock.diseases (
                    id VARCHAR(32) PRIMARY KEY,
                    name VARCHAR(256) NOT NULL,
                    icd_code VARCHAR(16),
                    description TEXT,
                    parent_id VARCHAR(32) REFERENCES mock.diseases(id) ON DELETE SET NULL
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS mock.insurance_products (
                    id VARCHAR(32) PRIMARY KEY,
                    name VARCHAR(256) NOT NULL,
                    product_type VARCHAR(64),
                    premium_range VARCHAR(32)
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS mock.disease_insurance_product (
                    disease_id VARCHAR(32) NOT NULL REFERENCES mock.diseases(id) ON DELETE CASCADE,
                    insurance_product_id VARCHAR(32) NOT NULL REFERENCES mock.insurance_products(id) ON DELETE CASCADE,
                    PRIMARY KEY (disease_id, insurance_product_id)
                )
            """))

            # Check if already seeded (optional: skip if you want idempotent re-run)
            exists = await conn.execute(
                text("SELECT 1 FROM mock.diseases LIMIT 1")
            )
            if exists.scalar() is not None:
                print("Mock data already present. Truncating and re-seeding...")

            await conn.execute(text("TRUNCATE mock.disease_insurance_product, mock.diseases, mock.insurance_products CASCADE"))

            # Insert diseases (parents first, then children with parent_id)
            for did, name, icd, desc, parent_id in DISEASES:
                await conn.execute(
                    text(
                        "INSERT INTO mock.diseases (id, name, icd_code, description, parent_id) VALUES (:id, :name, :icd, :desc, :parent_id)"
                    ),
                    {"id": did, "name": name, "icd": icd, "desc": desc, "parent_id": parent_id},
                )
            print(f"Inserted {len(DISEASES)} diseases")

            # Insert insurance products
            for pid, name, ptype, premium in INSURANCE_PRODUCTS:
                await conn.execute(
                    text(
                        "INSERT INTO mock.insurance_products (id, name, product_type, premium_range) VALUES (:id, :name, :ptype, :premium)"
                    ),
                    {"id": pid, "name": name, "ptype": ptype, "premium": premium},
                )
            print(f"Inserted {len(INSURANCE_PRODUCTS)} insurance products")

            # Insert relationships
            count = 0
            for disease_id, product_ids in DISEASE_INSURANCE_MAP.items():
                for product_id in product_ids:
                    await conn.execute(
                        text(
                            "INSERT INTO mock.disease_insurance_product (disease_id, insurance_product_id) VALUES (:d, :p)"
                        ),
                        {"d": disease_id, "p": product_id},
                    )
                    count += 1
            print(f"Inserted {count} disease-insurance relationships")

        print("")
        print("Done. Add these 3 tables as Datasets in Console (Data Source: main DB):")
        print("  - mock.diseases")
        print("  - mock.insurance_products")
        print("  - mock.disease_insurance_product")
        return 0

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
