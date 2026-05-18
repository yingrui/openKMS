#!/usr/bin/env bash
#
# openkms-skill CLI 命令清单 —— 既能 `bash tests/run_cli.sh` 一键跑,
# 也能逐行 copy-paste 到终端单独执行。
#
# 前置:
#   - openkms-skill/config.yml 已配 api_base_url + api_key
#   - 依赖: jq (用来从前一步抽 id 喂给后一步,避免手填)
#
# 一个命令失败不会中断后续(`set +e`),需要每条都过就改成 `set -e`。
# ---------------------------------------------------------------------------

set -u +e
cd "$(dirname "$0")/.."

CLI="python scripts/cli.py"

# ---- 测试问题 / 查询(直接改这里) ----------------------------------------
Q_SEARCH="保险"
Q_KB_NAME="HSBC Product"
Q_KB_SEARCH="既往症 核保"
Q_KB_ASK="客户52岁女性,母亲有乳腺癌史,本人体检发现甲状腺良性结节,投保重疾险时的核保关键点是什么?"
Q_CYPHER='MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c ORDER BY c DESC LIMIT 10'
Q_NL_CYPHER="列出与既往症相关的合规通函"
Q_ONTOLOGY_ASK="列出与既往症相关的合规通函"

banner() { echo; echo "============================================================"; echo "  $*"; echo "============================================================"; }

# ---- 1  ping --------------------------------------------------------------
banner "1. ping"
$CLI ping

# ---- 2  search ------------------------------------------------------------
# Real shape: {query, types_requested, documents:{items,total}, articles:{...},
# wiki_spaces:{...}, knowledge_bases:{...}}.
banner "2. search --q $Q_SEARCH"
$CLI search --q "$Q_SEARCH" --limit 10 \
  | jq '{
      query,
      documents:       {total: .documents.total,       sample: (.documents.items[:3]       | map(.name))},
      articles:        {total: .articles.total,        sample: (.articles.items[:3]        | map(.name))},
      wiki_spaces:     {total: .wiki_spaces.total,     sample: (.wiki_spaces.items[:3]     | map(.name))},
      knowledge_bases: {total: .knowledge_bases.total, sample: (.knowledge_bases.items[:3] | map(.name))}
    }'

# ---- 3  document-channels list -------------------------------------------
# Channels endpoint returns a TREE (top-level array), not {items:[]}.
banner "3. document-channels list"
$CLI document-channels list \
  | jq '[.. | objects | select(has("id") and has("name"))] | .[:8] | map({id, name})'

# ---- 4  documents list ----------------------------------------------------
banner "4. documents list"
DOCS=$($CLI documents list --limit 10)
echo "$DOCS" | jq '.items[:5] | map({id, name})'
DOC_ID=$(echo "$DOCS" | jq -r '.items[0].id // empty')
echo "[chain] DOC_ID=$DOC_ID"

# ---- 5  documents get -----------------------------------------------------
if [ -n "${DOC_ID:-}" ]; then
  banner "5. documents get --id $DOC_ID"
  $CLI documents get --id "$DOC_ID" | jq '{id, name, has_markdown: (.markdown != null), markdown_len: ((.markdown // "") | length)}'
fi

# ---- 6  documents markdown -> file ---------------------------------------
# Skip if step 5 said the doc has no markdown — saves a confusing CLI error.
if [ -n "${DOC_ID:-}" ]; then
  HAS_MD=$($CLI documents get --id "$DOC_ID" 2>/dev/null | jq -r '(.markdown // "") | length')
  if [ "${HAS_MD:-0}" -gt 0 ]; then
    banner "6. documents markdown --out /tmp/openkms_doc.md"
    $CLI documents markdown --id "$DOC_ID" --out /tmp/openkms_doc.md
    ls -lh /tmp/openkms_doc.md
  else
    banner "6. documents markdown  (SKIP — doc has no markdown body)"
  fi
fi

# ---- 7  article-channels list --------------------------------------------
banner "7. article-channels list"
$CLI article-channels list \
  | jq '[.. | objects | select(has("id") and has("name"))] | .[:8] | map({id, name})'

# ---- 8  articles list -----------------------------------------------------
banner "8. articles list"
ARTS=$($CLI articles list --limit 10)
echo "$ARTS" | jq '.items[:5] | map({id, name})'
ART_ID=$(echo "$ARTS" | jq -r '.items[0].id // empty')
echo "[chain] ART_ID=$ART_ID"

# ---- 9  articles markdown -------------------------------------------------
if [ -n "${ART_ID:-}" ]; then
  banner "9. articles markdown --out /tmp/openkms_art.md"
  $CLI articles markdown --id "$ART_ID" --out /tmp/openkms_art.md
  ls -lh /tmp/openkms_art.md
fi

# ---- 10 wiki-spaces list --------------------------------------------------
banner "10. wiki-spaces list"
SPACES=$($CLI wiki-spaces list)
echo "$SPACES" | jq '.items[:5] | map({id, name})'
SPACE_ID=$(echo "$SPACES" | jq -r '.items[0].id // empty')
echo "[chain] SPACE_ID=$SPACE_ID"

# ---- 11 wiki list-pages ---------------------------------------------------
PAGE_PATH=""
if [ -n "${SPACE_ID:-}" ]; then
  banner "11. wiki list-pages --space-id $SPACE_ID"
  PAGES=$($CLI wiki list-pages --space-id "$SPACE_ID")
  echo "$PAGES" | jq '.items[:5] | map({path, title})'
  PAGE_PATH=$(echo "$PAGES" | jq -r '.items[0].path // empty')
  echo "[chain] PAGE_PATH=$PAGE_PATH"
fi

# ---- 12 wiki get-page -----------------------------------------------------
if [ -n "${SPACE_ID:-}" ] && [ -n "${PAGE_PATH:-}" ]; then
  banner "12. wiki get-page --path $PAGE_PATH"
  $CLI wiki get-page --space-id "$SPACE_ID" --path "$PAGE_PATH" \
    | jq '{path, title, body_len: ((.markdown // .content // .body // .text // "") | length), keys: keys}'
fi

# ---- 13 kb list -> 找 HSBC Product (没找到就用第一个) ---------------------
banner "13. kb list  (target: $Q_KB_NAME)"
KBS=$($CLI kb list)
echo "$KBS" | jq '(.items // .) | map({id, name})'
KB_ID=$(echo "$KBS" | jq -r --arg name "$Q_KB_NAME" '(.items // .) | map(select(.name == $name)) | .[0].id // empty')
[ -z "$KB_ID" ] && KB_ID=$(echo "$KBS" | jq -r '(.items // .)[0].id // empty')
echo "[chain] KB_ID=$KB_ID"

# ---- 14 kb get ------------------------------------------------------------
if [ -n "${KB_ID:-}" ]; then
  banner "14. kb get --id $KB_ID"
  $CLI kb get --id "$KB_ID" | jq '{id, name, stats}'
fi

# ---- 15 kb search ---------------------------------------------------------
if [ -n "${KB_ID:-}" ]; then
  banner "15. kb search --q $Q_KB_SEARCH"
  $CLI kb search --id "$KB_ID" --q "$Q_KB_SEARCH" --limit 10 \
    | jq '{results_count: ((.results // .hits // .items // []) | length), top: ((.results // .hits // .items // [])[:3] | map({score, source: (.source_name // .name // .id)}))}'
fi

# ---- 16 kb ask  (LLM, 慢; 可能 10-30s) -----------------------------------
if [ -n "${KB_ID:-}" ]; then
  banner "16. kb ask  (slow)"
  echo "Q: $Q_KB_ASK"
  $CLI kb ask --id "$KB_ID" --question "$Q_KB_ASK" \
    | jq '{answer_len: (.answer | length), answer_head: (.answer[:400]), source_count: ((.sources // []) | length)}'
fi

# ---- 17 kb-faq list -------------------------------------------------------
if [ -n "${KB_ID:-}" ]; then
  banner "17. kb-faq list"
  $CLI kb-faq list --kb-id "$KB_ID" | jq '{count: ((.items // .faqs // .) | length), sample: ((.items // .faqs // .)[:3] | map({question}))}'
fi

# ---- 18 ontology cypher ---------------------------------------------------
banner "18. ontology cypher"
echo "Q: $Q_CYPHER"
$CLI ontology cypher --query "$Q_CYPHER" | jq '{columns, row_count: ((.rows // []) | length), rows: (.rows // [])[:10]}'

# ---- 19 ontology text-to-cypher ------------------------------------------
banner "19. ontology text-to-cypher"
echo "Q: $Q_NL_CYPHER"
$CLI ontology text-to-cypher --question "$Q_NL_CYPHER" | jq '{cypher, explanation}'

# ---- 20 ontology ask  (LLM, 慢) ------------------------------------------
banner "20. ontology ask  (slow)"
echo "Q: $Q_ONTOLOGY_ASK"
$CLI ontology ask --question "$Q_ONTOLOGY_ASK" \
  | jq '{cypher, row_count: ((.rows // []) | length), answer_head: (.answer[:400])}'

# ---- 21 evaluations list --------------------------------------------------
# Endpoint returns a top-level array, not {items:[]}.
banner "21. evaluations list"
$CLI evaluations list \
  | jq '[.. | objects | select(has("id") and (has("name") or has("title")))] | {count: length, sample: (.[:5] | map({id, name: (.name // .title)}))}'

# ---- 22 objects list -----------------------------------------------------
banner "22. objects list"
OBJ_TYPES=$($CLI ontology objects list)
echo "$OBJ_TYPES" | jq '.items[:5] | map({id, name, is_master_data, instance_count})'
OT_ID=$(echo "$OBJ_TYPES" | jq -r '.items[0].id // empty')
echo "[chain] OT_ID=$OT_ID"

# ---- 23 objects get + instances list ------------------------------------
if [ -n "${OT_ID:-}" ]; then
  banner "23. objects get + instances list (OT=$OT_ID)"
  $CLI ontology objects get --id "$OT_ID" | jq '{id, name, properties: (.properties | length), instance_count}'
  $CLI ontology objects instances list --type-id "$OT_ID" --limit 3 \
    | jq '{total, sample: (.items[:3] | map({id, data}))}'
fi

# ---- 24 links list -------------------------------------------------------
banner "24. links list"
LINK_TYPES=$($CLI ontology links list)
echo "$LINK_TYPES" | jq '.items[:5] | map({id, name, cardinality, link_count})'
LT_ID=$(echo "$LINK_TYPES" | jq -r '.items[0].id // empty')
echo "[chain] LT_ID=$LT_ID"

# ---- 25 links get + instances list --------------------------------------
if [ -n "${LT_ID:-}" ]; then
  banner "25. links get + instances list (LT=$LT_ID)"
  $CLI ontology links get --id "$LT_ID" \
    | jq '{id, name, cardinality, source_object_type_name, target_object_type_name}'
  $CLI ontology links instances list --type-id "$LT_ID" --limit 3 \
    | jq '{total, sample: (.items[:3] | map({id, source_object_id, target_object_id}))}'
fi

# ---- 26 objects create-type --dry-run  (write smoke; no actual mutation) -
banner "26. objects create-type --dry-run  (no mutation)"
$CLI ontology objects create-type \
  --name "smoke_$(date +%s)" \
  --properties-json '[{"name":"id","type":"string","required":true}]' \
  --dry-run

# ---- 27 objects update/delete/sync-neo4j  --dry-run ----------------------
banner "27. objects update-type / delete-type / sync-neo4j  (--dry-run)"
$CLI ontology objects update-type --id "${OT_ID:-bogus-id}" --description "smoke updated" --dry-run
echo
$CLI ontology objects delete-type --id "${OT_ID:-bogus-id}" --dry-run
echo
$CLI ontology objects sync-neo4j --neo4j-data-source-id bogus-ds --dry-run

# ---- 28 objects instances get + create/update/delete --dry-run ----------
OI_ID=""
if [ -n "${OT_ID:-}" ]; then
  OI_ID=$($CLI ontology objects instances list --type-id "$OT_ID" --limit 1 | jq -r '.items[0].id // empty')
  echo "[chain] OI_ID=$OI_ID"
fi
if [ -n "${OT_ID:-}" ] && [ -n "${OI_ID:-}" ]; then
  banner "28. objects instances get + create/update/delete (--dry-run)"
  $CLI ontology objects instances get --type-id "$OT_ID" --id "$OI_ID" | jq '{id, data}'
  echo
  $CLI ontology objects instances create --type-id "$OT_ID" --data-json '{"smoke":"x"}' --dry-run
  echo
  $CLI ontology objects instances update --type-id "$OT_ID" --id "$OI_ID" --data-json '{"smoke":"y"}' --dry-run
  echo
  $CLI ontology objects instances delete --type-id "$OT_ID" --id "$OI_ID" --dry-run
fi

# ---- 29 links create/update/delete/sync-neo4j  --dry-run ----------------
banner "29. links create-type / update-type / delete-type / sync-neo4j (--dry-run)"
$CLI ontology links create-type --name smoke_link \
  --source-type-id "${OT_ID:-bogus}" --target-type-id "${OT_ID:-bogus}" \
  --cardinality one-to-many --dry-run
echo
$CLI ontology links update-type --id "${LT_ID:-bogus-id}" --description "smoke updated" --dry-run
echo
$CLI ontology links delete-type --id "${LT_ID:-bogus-id}" --dry-run
echo
$CLI ontology links sync-neo4j --neo4j-data-source-id bogus-ds --dry-run

# ---- 30 links instances create/delete  --dry-run ------------------------
if [ -n "${LT_ID:-}" ]; then
  banner "30. links instances create / delete  (--dry-run)"
  $CLI ontology links instances create --type-id "$LT_ID" \
    --source-object-id oi-a --target-object-id oi-b --dry-run
  echo
  $CLI ontology links instances delete --type-id "$LT_ID" --id li-bogus --dry-run
fi

# ---- 31 confirm gating: non-TTY without --yes must abort (exit 2) -------
# Pipes stdin so isatty() returns False; the CLI should refuse and not POST.
banner "31. confirm gating: non-TTY without --yes  (expecting exit 2)"
echo | $CLI ontology objects delete-type --id non-existent-bogus 2>&1
rc=$?
if [ "$rc" -eq 2 ]; then
  echo "[OK] exit code = 2 (refused as expected)"
else
  echo "[WARN] expected exit code 2, got $rc"
fi

echo
echo "============================================================"
echo "  done"
echo "============================================================"
