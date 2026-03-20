#!/usr/bin/env python3
"""Create mock diseases, insurance products, and disease-insurance relationships in DB.

Data extracted from HSBC critical illness insurance terms:
  - 汇丰长佑康宁重大疾病保险 MIY
  - 汇丰汇佑康宁 D 款重大疾病保险 MIL

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


# Diseases extracted from HSBC critical illness insurance terms (product-1, product-2)
# Format: (id, name, icd_code, description, parent_id)
# parent_id: None for top-level categories; otherwise parent disease id
DISEASES = [
    # --- Parent categories ---
    ("dp01", "恶性肿瘤", None, "恶性细胞不受控制的进行性增长和扩散", None),
    ("dp02", "心血管疾病", None, "心脏及血管相关疾病", None),
    ("dp03", "神经系统疾病", None, "脑、脊髓及神经相关疾病", None),
    ("dp04", "器官移植及衰竭", None, "重大器官移植或功能衰竭", None),
    ("dp05", "呼吸系统疾病", None, "肺部及呼吸相关疾病", None),
    ("dp06", "消化系统疾病", None, "肝、胰、肠等消化器官疾病", None),
    ("dp07", "肾脏疾病", None, "肾脏功能相关疾病", None),
    ("dp08", "自身免疫及结缔组织病", None, "免疫系统异常导致的疾病", None),
    ("dp09", "感染性疾病", None, "病原体感染导致的疾病", None),
    ("dp10", "代谢及内分泌疾病", None, "代谢、激素相关疾病", None),
    # --- 重大疾病 (Critical Illness) ---
    ("d01", "恶性肿瘤——重度", "C00-D48", "恶性细胞浸润破坏周围组织，可转移", "dp01"),
    ("d02", "较重急性心肌梗死", "I21", "冠状动脉闭塞导致急性心肌坏死", "dp02"),
    ("d03", "严重脑中风后遗症", "I60-I69", "脑血管出血、栓塞或梗塞致永久功能障碍", "dp03"),
    ("d04", "重大器官移植术或造血干细胞移植术", "Z94", "肾、肝、心、肺或造血干细胞移植", "dp04"),
    ("d05", "冠状动脉搭桥术", "I25", "切开心包进行的冠状动脉旁路移植术", "dp02"),
    ("d06", "严重慢性肾衰竭", "N18.5", "慢性肾脏病5期，规律透析90天以上", "dp07"),
    ("d07", "多个肢体缺失", "S48/S58/T14", "两肢及以上自腕/踝关节以上完全断离", None),
    ("d08", "急性重症肝炎或亚急性重症肝炎", "K72", "肝炎病毒致急性肝功能衰竭", "dp06"),
    ("d09", "严重非恶性颅内肿瘤", "D32-D33", "脑、脑神经、脑被膜非恶性肿瘤", "dp03"),
    ("d10", "严重慢性肝衰竭", "K72.1", "慢性肝病致肝衰竭，黄疸腹水肝性脑病等", "dp06"),
    ("d11", "严重脑炎后遗症或严重脑膜炎后遗症", "G04-G05", "脑炎/脑膜炎致神经系统永久功能障碍", "dp03"),
    ("d12", "深度昏迷", "R40.2", "GCS≤5分，呼吸机等生命维持96小时以上", "dp03"),
    ("d13", "双耳失聪", "H91.3", "双耳听力永久不可逆丧失，平均听阈≥91dB", None),
    ("d14", "双目失明", "H54.0", "双眼视力永久不可逆丧失", None),
    ("d15", "瘫痪", "G82", "两肢及以上肢体随意运动功能永久完全丧失", "dp03"),
    ("d16", "心脏瓣膜手术", "I35-I38", "切开心脏进行瓣膜置换或修复", "dp02"),
    ("d17", "严重阿尔茨海默病", "G30", "大脑进行性不可逆改变致智能严重衰退", "dp03"),
    ("d18", "严重脑损伤", "S06", "头部机械性外力致神经系统永久功能障碍", "dp03"),
    ("d19", "严重原发性帕金森病", "G20", "中枢神经系统退行性疾病", "dp03"),
    ("d20", "严重Ⅲ度烧伤", "T29", "Ⅲ度烧伤达体表面积20%及以上", None),
    ("d21", "严重特发性肺动脉高压", "I27.0", "不明原因肺动脉压力持续性增高", "dp02"),
    ("d22", "严重运动神经元病", "G12.2", "进行性脊肌萎缩、延髓麻痹、ALS等", "dp03"),
    ("d23", "语言能力丧失", "R47.1", "无法发出语音或声带切除", "dp03"),
    ("d24", "重型再生障碍性贫血", "D61.9", "骨髓造血功能慢性持续性衰竭", None),
    ("d25", "主动脉手术", "I71", "开胸/开腹切除置换修补主动脉", "dp02"),
    ("d26", "严重慢性呼吸衰竭", "J96.1", "FEV1<30%，PaO2<50mmHg", "dp05"),
    ("d27", "严重克罗恩病", "K50", "慢性肉芽肿性肠炎，瘘管并肠梗阻或穿孔", "dp06"),
    ("d28", "严重溃疡性结肠炎", "K51", "急性暴发性全结肠病变，结肠切除或造瘘", "dp06"),
    ("d29", "严重多发性硬化", "G35", "中枢神经系统多灶性脱髓鞘病变", "dp03"),
    ("d30", "严重脊髓灰质炎", "A80", "脊髓灰质炎病毒致瘫痪", "dp03"),
    ("d31", "严重全身性重症肌无力", "G70.0", "神经肌肉接头传递障碍", "dp03"),
    ("d32", "严重原发性心肌病", "I42", "扩张型/肥厚型/限制型心肌病", "dp02"),
    ("d33", "系统性红斑狼疮并发III型或以上狼疮性肾炎", "M32.1+N08", "狼疮性肾炎ISN III/IV/V/VI型", "dp08"),
    ("d34", "因职业关系导致的HIV感染", "B20", "职业暴露感染HIV", "dp09"),
    ("d35", "经输血导致的HIV感染", "B20", "输血感染HIV", "dp09"),
    ("d36", "严重肺源性心脏病", "I27.9", "慢性肺部疾病致心功能衰竭", "dp02"),
    ("d37", "植物人状态", "G93.8", "大脑皮质全面坏死，意识丧失", "dp03"),
    ("d38", "严重系统性硬皮病", "M34", "皮肤血管内脏弥漫性纤维化", "dp08"),
    ("d39", "丝虫病所致严重象皮肿", "B74", "丝虫感染致淋巴水肿III期", "dp09"),
    ("d40", "胰腺移植", "Z94.4", "胰腺异体移植手术", "dp04"),
    ("d41", "急性坏死性胰腺炎开腹手术", "K85", "急性出血坏死性胰腺炎开腹手术", "dp06"),
    ("d42", "严重慢性复发性胰腺炎", "K86.1", "胰腺进行性破坏，外分泌内分泌不全", "dp06"),
    ("d43", "严重肾髓质囊性病", "N28.8", "肾髓质多发囊肿，GFR<30", "dp07"),
    ("d44", "严重原发性硬化性胆管炎", "K83.0", "胆道慢性纤维化狭窄致肝硬化", "dp06"),
    ("d45", "自身免疫性慢性肾上腺皮质功能减退", "E27.1", "肾上腺萎缩，ACTH>100pg/ml", "dp10"),
    ("d46", "开颅手术", None, "全麻下开颅手术（不含脑垂体瘤等）", "dp03"),
    ("d47", "严重肌营养不良症", "G71.0", "遗传性肌肉变性，骨骼肌进行性无力萎缩", "dp03"),
    ("d48", "严重心肌炎", "I40", "心肌炎性病变致心功能衰竭", "dp02"),
    ("d49", "破裂脑动脉瘤夹闭手术", "I60", "脑动脉瘤破裂蛛网膜下腔出血开颅夹闭", "dp03"),
    ("d50", "嗜铬细胞瘤经手术切除", "D35.0", "肾上腺嗜铬组织神经内分泌肿瘤切除", "dp10"),
    ("d51", "严重自身免疫性肝炎", "K75.4", "自身免疫介导慢性进行性肝病", "dp06"),
    ("d52", "严重的Ⅲ度房室传导阻滞", "I44.2", "心室率<40次/分，依赖起搏器", "dp02"),
    ("d53", "肺淋巴管肌瘤病", "J84.8", "肺间质支气管血管淋巴管平滑肌异常增生", "dp05"),
    ("d54", "严重肺泡蛋白沉积症", "J84.0", "肺泡表面活性物质大量沉积", "dp05"),
    ("d55", "严重出血性登革热", "A91", "登革热病毒致休克出血器官损害", "dp09"),
    ("d56", "艾森曼格综合征", "I27.8", "先天性心脏病致肺动脉高压右向左分流", "dp02"),
    ("d57", "严重慢性缩窄型心包炎", "I31.1", "心包瘢痕粘连增厚钙化", "dp02"),
    ("d58", "一肢及单眼缺失", None, "单眼视力丧失及一肢腕/踝以上断离", None),
    ("d59", "严重面部烧伤", "T20", "面部Ⅲ度烧伤达80%及以上", None),
    ("d60", "重症急性坏死性筋膜炎", "M72.6", "细菌致皮下筋膜坏死，肢体截除", "dp09"),
    ("d61", "严重类风湿性关节炎", "M06", "多关节病变，自主生活能力完全丧失", "dp08"),
    ("d62", "严重亚急性硬化性全脑炎", "A81.1", "麻疹病毒致中枢神经系统慢性感染", "dp03"),
    ("d63", "严重脊髓小脑共济失调", "G11", "小脑萎缩共济失调", "dp03"),
    ("d64", "进行性多灶性白质脑病", "A81.2", "免疫缺陷病人亚急性脱髓鞘性脑病", "dp03"),
    ("d65", "严重结核性脑膜炎后遗症", "G01", "结核杆菌脑膜炎致神经系统永久损害", "dp03"),
    ("d66", "脑型疟疾", "B50.0", "恶性疟原虫致脑型疟疾昏迷", "dp09"),
    ("d67", "严重感染性心内膜炎", "I33.0", "感染致心脏瓣膜中度以上关闭不全或狭窄", "dp02"),
    ("d68", "埃博拉出血热", "A98.4", "埃博拉病毒急性出血性传染病", "dp09"),
    ("d69", "肠道疾病或意外导致严重并发症", "K63", "小肠切除2/3以上，肠外营养>3月", "dp06"),
    ("d70", "风湿热导致的心脏瓣膜疾病", "I09", "风湿热致中度以上瓣膜关闭不全或狭窄", "dp02"),
    ("d71", "严重幼年型类风湿性关节炎", "M08", "儿童期发病慢性关节炎", "dp08"),
    ("d72", "严重川崎病", "M30.3", "系统性血管炎并发冠状动脉瘤", "dp08"),
    ("d73", "严重原发性轻链型淀粉样变（AL型）", "E85.4", "单克隆浆细胞病，轻链沉积", None),
    ("d74", "严重继发性肺动脉高压", "I27.2", "多种疾病致肺动脉压力持续增高", "dp02"),
    ("d75", "严重结核性脊髓炎", "G05.0", "结核杆菌脊髓炎致永久神经功能障碍", "dp03"),
    ("d76", "心包膜切除术", None, "心包剥脱或心包切除手术", "dp02"),
    ("d77", "严重肺孢子菌肺炎", "B59", "肺孢子菌间质性浆细胞肺炎", "dp05"),
    ("d78", "范可尼综合征", "E72.0", "近端肾小管功能异常", "dp07"),
    ("d79", "肾上腺脑白质营养不良", "E71.5", "过氧化物酶体脂代谢异常", "dp10"),
    ("d80", "狂犬病", "A82", "狂犬病毒急性传染病", "dp09"),
    ("d81", "原发性噬血细胞综合征", "D76.1", "HLH，需异体骨髓移植", None),
    ("d82", "席汉氏综合征", "E23.0", "产后大出血致垂体缺血坏死", "dp10"),
    ("d83", "神经白塞病", "M35.2", "白塞病累及神经系统", "dp08"),
    ("d84", "严重气性坏疽", "A48.0", "梭状芽胞杆菌肌坏死", "dp09"),
    ("d85", "严重强直性脊柱炎", "M45", "脊柱畸形，自主生活能力完全丧失", "dp08"),
    ("d86", "溶血性链球菌引起的坏疽", None, "浅/深筋膜溶血性链球菌感染", "dp09"),
    ("d87", "左心室室壁瘤切除手术", "I25.3", "切开心脏室壁瘤切除", "dp02"),
    ("d88", "心脏粘液瘤", "D15.1", "切开心脏粘液瘤切除", "dp02"),
    ("d89", "因严重心功能衰竭接受心脏再同步治疗（CRT）", "I50", "CRT治疗", "dp02"),
    ("d90", "头臂动脉型多发性大动脉炎", "M31.4", "主动脉及分支慢性炎症", "dp08"),
    ("d91", "严重横贯性脊髓炎", "G37.3", "炎症横贯脊髓致永久神经损害", "dp03"),
    ("d92", "严重脊髓空洞症", "G95.0", "脊髓内空洞形成", "dp03"),
    ("d93", "严重脊髓血管病后遗症", "G95.1", "脊髓梗塞或出血致截瘫四肢瘫", "dp03"),
    ("d94", "严重巨细胞动脉炎", "M31.5", "颅动脉炎致肢体失能或单眼失明", "dp08"),
    ("d95", "严重大动脉炎", "M31.4", "主动脉及主要分支狭窄", "dp08"),
    ("d96", "多处臂丛神经根性撕脱", "S14.3", "臂丛神经根性撕脱致手臂功能丧失", "dp03"),
    ("d97", "Brugada综合征", "I45.8", "典型I型Brugada波，已装除颤器", "dp02"),
    ("d98", "严重瑞氏综合征", "G93.7", "线粒体功能障碍，脑水肿昏迷", "dp03"),
    ("d99", "非阿尔茨海默病所致严重痴呆", "F03", "脑器质性疾病致严重痴呆", "dp03"),
    ("d100", "严重克-雅氏病（疯牛病）", "A81.0", "传染性海绵状脑病", "dp03"),
    ("d101", "严重的1型糖尿病", "E10", "胰岛素绝对不足，依赖外源性胰岛素", "dp10"),
    ("d102", "肺朗格罕细胞组织细胞增生症", "D76.0", "组织细胞异常增生致呼吸衰竭", "dp05"),
    ("d103", "湿性年龄相关性黄斑变性", "H35.3", "脉络膜新生血管异常生长", None),
    ("d104", "严重进行性核上性麻痹", "G23.1", "假球麻痹、垂直性核上性眼肌麻痹", "dp03"),
    ("d105", "弥漫性血管内凝血", "D65", "微血管血栓、凝血因子消耗、纤溶亢进", None),
    ("d106", "疾病或外伤所致智力障碍", "F70-F73", "头部创伤或疾病致智力低下", "dp03"),
    ("d107", "侵蚀性葡萄胎（恶性葡萄胎）", "D39.2", "绒毛组织浸润子宫肌层或转移", "dp01"),
    ("d108", "严重哮喘", "J45", "反复发作严重支气管阻塞", "dp05"),
    ("d109", "严重甲型或乙型血友病", "D66-D67", "凝血因子VIII或IX缺乏", None),
    ("d110", "白血病", "C91-C95", "造血器官恶性疾病，骨髓异常增生", "dp01"),
]

# Insurance products: 2 HSBC critical illness products (产品不用多)
INSURANCE_PRODUCTS = [
    ("MIY", "汇丰长佑康宁重大疾病保险", "adult", "18-65周岁投保"),
    ("MIL", "汇丰汇佑康宁D款重大疾病保险", "all_ages", "出生满30天至65周岁投保"),
]

# disease_id -> list of insurance_product_ids
# Both products cover all 110 critical diseases (plus light diseases)
# Link all specific diseases (d01-d110) to both products
DISEASE_INSURANCE_MAP = {
    did: ["MIY", "MIL"] for did in [f"d{i:02d}" for i in range(1, 111)]
}


async def main() -> int:
    url = get_db_url()
    engine = create_async_engine(url)

    try:
        async with engine.begin() as conn:
            # Create schema
            await conn.execute(text("CREATE SCHEMA IF NOT EXISTS mock"))

            # Drop tables to allow schema changes
            await conn.execute(text("DROP TABLE IF EXISTS mock.disease_insurance_product"))
            await conn.execute(text("DROP TABLE IF EXISTS mock.diseases"))
            await conn.execute(text("DROP TABLE IF EXISTS mock.insurance_products"))

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
                CREATE TABLE mock.insurance_products (
                    id VARCHAR(32) PRIMARY KEY,
                    name VARCHAR(256) NOT NULL,
                    product_type VARCHAR(64),
                    premium_range VARCHAR(32)
                )
            """))
            await conn.execute(text("""
                CREATE TABLE mock.disease_insurance_product (
                    disease_id VARCHAR(32) NOT NULL REFERENCES mock.diseases(id) ON DELETE CASCADE,
                    insurance_product_id VARCHAR(32) NOT NULL REFERENCES mock.insurance_products(id) ON DELETE CASCADE,
                    PRIMARY KEY (disease_id, insurance_product_id)
                )
            """))

            # Insert diseases (parents first, then children - order in DISEASES ensures this)
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
