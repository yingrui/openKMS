#!/usr/bin/env python3
"""百度 PaddleOCR-VL 云服务解析 + 注入 openKMS(VPS) 文档。

真·PaddleOCR-VL 质量,云端异步 job,不占 VPS 算力。绕开 openkms-cli(它只支持
OpenAI 兼容 backend),直接:云 API 解析 -> 注入 openKMS 文档(markdown + 图 + 状态)。

用法:
  纯解析(本地文件 -> 本地 markdown+图):
    python paddle_cloud_ocr.py parse --file doc.pdf --out ./out
  注入 VPS 文档(取原件->云解析->回填 markdown/图/状态):
    python paddle_cloud_ocr.py inject --doc-id <vps_doc_id>

环境变量(有默认值,可覆盖):
  PADDLE_AISTUDIO_TOKEN, OKMS_VPS(ubuntu@ip), OKMS_COMPOSE_DIR, OKMS_MINIO_CONTAINER,
  OKMS_BACKEND_SERVICE, OKMS_BUCKET
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time

import requests

TOKEN = os.environ.get("PADDLE_AISTUDIO_TOKEN", "")  # 必填: export PADDLE_AISTUDIO_TOKEN=...
JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
MODEL = os.environ.get("PADDLE_MODEL", "PaddleOCR-VL-1.6")

VPS = os.environ.get("OKMS_VPS", "ubuntu@124.223.69.223")
COMPOSE_DIR = os.environ.get("OKMS_COMPOSE_DIR", "~/openkms-anli/docker")
BACKEND_SVC = os.environ.get("OKMS_BACKEND_SERVICE", "backend")
BUCKET = os.environ.get("OKMS_BUCKET", "openkms-anli")

_SSH = ["ssh", "-o", "BatchMode=yes", VPS]


def _clean(out: str) -> str:
    # 过滤腾讯云 SSH 登录横幅噪声
    import re
    return "\n".join(
        l for l in out.splitlines()
        if not re.search(r"微信|WeChat|qcloud|扫码|^\*{6,}$|^█", l)
    )


# ---------- 云 API 解析 ----------
def parse_file(path: str):
    """提交 job -> 轮询 -> 返回 pages: [{'markdown': str, 'images': {relpath: bytes}}]"""
    headers = {"Authorization": f"bearer {TOKEN}"}
    data = {"model": MODEL, "optionalPayload": json.dumps({
        "useDocOrientationClassify": False, "useDocUnwarping": False, "useChartRecognition": False,
    })}
    with open(path, "rb") as f:
        r = requests.post(JOB_URL, headers=headers, data=data, files={"file": f}, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"submit failed {r.status_code}: {r.text[:300]}")
    jid = r.json()["data"]["jobId"]
    print(f"  jobId={jid}, polling...")
    jsonl_url = ""
    while True:
        jr = requests.get(f"{JOB_URL}/{jid}", headers=headers, timeout=60).json()["data"]
        st = jr["state"]
        if st == "running":
            ep = jr.get("extractProgress", {})
            print(f"  running {ep.get('extractedPages','?')}/{ep.get('totalPages','?')} pages")
        elif st == "done":
            jsonl_url = jr["resultUrl"]["jsonUrl"]
            break
        elif st == "failed":
            raise RuntimeError(f"job failed: {jr.get('errorMsg')}")
        else:
            print(f"  {st}")
        time.sleep(5)
    lines = requests.get(jsonl_url, timeout=120).text.strip().split("\n")
    pages = []
    for line in lines:
        if not line.strip():
            continue
        result = json.loads(line)["result"]
        for res in result["layoutParsingResults"]:
            md = res["markdown"]["text"]
            imgs = {}
            for relpath, url in res["markdown"].get("images", {}).items():
                imgs[relpath] = requests.get(url, timeout=60).content
            pages.append({"markdown": md, "images": imgs})
    return pages


# ---------- VPS 文档元信息 ----------
def vps_doc_meta(doc_id: str):
    code = (
        "import asyncio,sqlalchemy as sa,json\n"
        "from app.database import async_session_maker\n"
        "async def m():\n"
        " async with async_session_maker() as db:\n"
        f"  r=(await db.execute(sa.text(\"select id,name,file_hash,file_type from documents where id=:i\"),{{'i':'{doc_id}'}})).first()\n"
        "  print(json.dumps(dict(r._mapping)) if r else 'null')\n"
        "asyncio.run(m())"
    )
    out = _backend_py(code)
    line = [l for l in out.splitlines() if l.strip().startswith("{")]
    if not line:
        raise RuntimeError(f"doc meta not found: {out[:300]}")
    return json.loads(line[-1])


def _backend_py(code: str) -> str:
    """在 VPS backend 容器内跑一段 python(base64 传入避免转义地狱)。"""
    b64 = base64.b64encode(code.encode()).decode()
    remote = (
        f"cd {COMPOSE_DIR}; cid=$(docker compose ps -q {BACKEND_SVC}); "
        f"echo {b64} | base64 -d > /tmp/_okms_run.py; "
        f"docker cp /tmp/_okms_run.py $cid:/app/_okms_run.py >/dev/null 2>&1; "
        f"docker exec $cid sh -c 'cd /app && python _okms_run.py'; "
        f"docker exec $cid rm -f /app/_okms_run.py; rm -f /tmp/_okms_run.py"
    )
    p = subprocess.run(_SSH + [remote], capture_output=True, text=True, timeout=180)
    return _clean(p.stdout + p.stderr)


def download_original(doc_id: str, file_hash: str, file_type: str, dest: str):
    """用 backend s3 client 正确取原始文件到 VPS /tmp, 再 scp 回本地 dest。"""
    ext = (file_type or "bin").lower()
    key = f"documents/{file_hash}/original.{ext}"
    code = (
        "import os,boto3\n"
        "s3=boto3.client('s3',endpoint_url=os.environ['AWS_ENDPOINT_URL'],"
        "aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])\n"
        f"o=s3.get_object(Bucket=os.environ['AWS_BUCKET_NAME'],Key='{key}')\n"
        "open('/app/_orig','wb').write(o['Body'].read()); print('OK',end='')"
    )
    out = _backend_py_keepfile(code, "/app/_orig", "/tmp/_orig")
    subprocess.run(["scp", "-o", "BatchMode=yes", f"{VPS}:/tmp/_orig", dest],
                   capture_output=True, text=True, timeout=120)
    subprocess.run(_SSH + ["rm -f /tmp/_orig"], capture_output=True, text=True)


def _backend_py_keepfile(code: str, container_path: str, vps_tmp: str) -> str:
    b64 = base64.b64encode(code.encode()).decode()
    remote = (
        f"cd {COMPOSE_DIR}; cid=$(docker compose ps -q {BACKEND_SVC}); "
        f"echo {b64} | base64 -d > /tmp/_okms_run.py; "
        f"docker cp /tmp/_okms_run.py $cid:/app/_okms_run.py >/dev/null 2>&1; "
        f"docker exec $cid sh -c 'cd /app && python _okms_run.py'; "
        f"docker cp $cid:{container_path} {vps_tmp} >/dev/null 2>&1; "
        f"docker exec $cid rm -f /app/_okms_run.py {container_path}; rm -f /tmp/_okms_run.py"
    )
    p = subprocess.run(_SSH + [remote], capture_output=True, text=True, timeout=180)
    return _clean(p.stdout + p.stderr)


# ---------- 注入 VPS ----------
def inject(doc_id: str, file_hash: str, pages):
    markdown = "\n\n".join(p["markdown"] for p in pages)
    # 汇总所有图: relpath(如 imgs/xxx.jpg) -> bytes
    images = {}
    for p in pages:
        images.update(p["images"])
    parsing_result = {"parser": "paddleocr-vl-cloud", "page_count": len(pages),
                      "file_hash": file_hash, "markdown": markdown}

    payload = {
        "doc_id": doc_id, "file_hash": file_hash, "markdown": markdown,
        "parsing_result": parsing_result,
        "images": {k: base64.b64encode(v).decode() for k, v in images.items()},
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tf:
        json.dump(payload, tf)
        local_payload = tf.name
    subprocess.run(["scp", "-o", "BatchMode=yes", local_payload, f"{VPS}:/tmp/_inject.json"],
                   capture_output=True, text=True, timeout=180)
    os.unlink(local_payload)

    # 容器内: 图 put_object 到 documents/{hash}/markdown_out/{relpath}, 更新 postgres
    code = (
        "import os,json,base64,boto3,asyncio,sqlalchemy as sa\n"
        "from app.database import async_session_maker\n"
        "p=json.load(open('/app/_inject.json'))\n"
        "s3=boto3.client('s3',endpoint_url=os.environ['AWS_ENDPOINT_URL'],"
        "aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])\n"
        "bkt=os.environ['AWS_BUCKET_NAME']; h=p['file_hash']; n=0\n"
        "for rel,b64 in p['images'].items():\n"
        "    key='documents/%s/markdown_out/%s'%(h,rel)\n"
        "    ct='image/jpeg' if rel.lower().endswith(('jpg','jpeg')) else 'image/png'\n"
        "    s3.put_object(Bucket=bkt,Key=key,Body=base64.b64decode(b64),ContentType=ct); n+=1\n"
        "print('images uploaded:',n)\n"
        "async def m():\n"
        " async with async_session_maker() as db:\n"
        "  cols=[r[0] for r in (await db.execute(sa.text(\"select column_name from information_schema.columns where table_name='documents'\"))).fetchall()]\n"
        "  sets=['status=:st','updated_at=now()']; params={'id':p['doc_id'],'st':'completed','md':p['markdown'],'pr':json.dumps(p['parsing_result'])}\n"
        "  if 'markdown' in cols: sets.append('markdown=:md')\n"
        "  if 'parsing_result' in cols: sets.append('parsing_result=cast(:pr as jsonb)')\n"
        "  q='update documents set '+', '.join(sets)+' where id=:id'\n"
        "  res=await db.execute(sa.text(q),params); await db.commit()\n"
        "  row=(await db.execute(sa.text('select status,length(markdown) as ml from documents where id=:id'),{'id':p['doc_id']})).first()\n"
        "  print('db updated:',dict(row._mapping))\n"
        "asyncio.run(m())"
    )
    b64 = base64.b64encode(code.encode()).decode()
    remote = (
        f"cd {COMPOSE_DIR}; cid=$(docker compose ps -q {BACKEND_SVC}); "
        f"docker cp /tmp/_inject.json $cid:/app/_inject.json >/dev/null 2>&1; "
        f"echo {b64} | base64 -d > /tmp/_okms_run.py; "
        f"docker cp /tmp/_okms_run.py $cid:/app/_okms_run.py >/dev/null 2>&1; "
        f"docker exec $cid sh -c 'cd /app && python _okms_run.py'; "
        f"docker exec $cid rm -f /app/_okms_run.py /app/_inject.json; rm -f /tmp/_okms_run.py /tmp/_inject.json"
    )
    p = subprocess.run(_SSH + [remote], capture_output=True, text=True, timeout=300)
    return _clean(p.stdout + p.stderr)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    pp = sub.add_parser("parse"); pp.add_argument("--file", required=True); pp.add_argument("--out", default="./out")
    ip = sub.add_parser("inject"); ip.add_argument("--doc-id", required=True)
    ns = ap.parse_args()

    if not TOKEN:
        sys.exit("请先设置环境变量 PADDLE_AISTUDIO_TOKEN(百度 PaddleOCR-VL 云服务 access token)")

    if ns.cmd == "parse":
        pages = parse_file(ns.file)
        os.makedirs(ns.out, exist_ok=True)
        md = "\n\n".join(p["markdown"] for p in pages)
        open(os.path.join(ns.out, "markdown.md"), "w").write(md)
        for p in pages:
            for rel, b in p["images"].items():
                fp = os.path.join(ns.out, rel); os.makedirs(os.path.dirname(fp), exist_ok=True)
                open(fp, "wb").write(b)
        print(f"parsed {len(pages)} page(s) -> {ns.out}/markdown.md ({len(md)} chars)")

    elif ns.cmd == "inject":
        meta = vps_doc_meta(ns.doc_id)
        print(f"doc: {meta['name']} | hash={meta['file_hash'][:12]} | type={meta['file_type']}")
        with tempfile.NamedTemporaryFile(suffix="."+(meta['file_type'] or 'bin').lower(), delete=False) as tf:
            orig = tf.name
        print("downloading original from VPS...")
        download_original(ns.doc_id, meta["file_hash"], meta["file_type"], orig)
        sz = os.path.getsize(orig)
        print(f"  original {sz} bytes")
        print("parsing via PaddleOCR-VL cloud...")
        pages = parse_file(orig)
        os.unlink(orig)
        total = sum(len(p["images"]) for p in pages)
        print(f"  parsed {len(pages)} page(s), {total} images")
        print("injecting to VPS...")
        print(inject(ns.doc_id, meta["file_hash"], pages))


if __name__ == "__main__":
    main()
