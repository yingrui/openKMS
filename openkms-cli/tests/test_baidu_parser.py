"""Tests for Baidu Cloud document parser helpers."""

from unittest.mock import MagicMock, patch

import pytest

from openkms_cli.baidu_parser import (
    BaiduParseError,
    _build_result_from_baidu_json,
    _position_to_bbox,
    _rewrite_markdown_image_urls,
    _scale_layout_coordinates_to_preview,
    create_parse_task,
    get_access_token,
    poll_parse_task,
    query_parse_task,
)


def test_position_to_bbox():
    assert _position_to_bbox([10, 20, 100, 50]) == [10.0, 20.0, 110.0, 70.0]
    assert _position_to_bbox([]) == []


def test_rewrite_markdown_image_urls():
    md = "![img](https://bos.example/a.png) text https://bos.example/a.png"
    out = _rewrite_markdown_image_urls(md, {"https://bos.example/a.png": "baidu_img_0_0.png"})
    assert "baidu_img_0_0.png" in out
    assert "https://bos.example/a.png" not in out


def test_get_access_token_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"access_token": "tok123", "expires_in": 2592000}
    with patch("openkms_cli.baidu_parser.requests.post", return_value=mock_resp):
        assert get_access_token("key", "secret") == "tok123"


def test_get_access_token_missing_credentials():
    with pytest.raises(BaiduParseError, match="required"):
        get_access_token("", "")


def test_create_parse_task_file_data_success():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "error_code": 0,
        "result": {"task_id": "task-abc"},
    }
    with patch("openkms_cli.baidu_parser.requests.post", return_value=mock_resp) as mock_post:
        task_id = create_parse_task("tok", "doc.pdf", file_bytes=b"%PDF-1.4")
    assert task_id == "task-abc"
    payload = mock_post.call_args.kwargs.get("data") or mock_post.call_args[1].get("data")
    assert "file_data" in payload
    assert "file_url" not in payload
    assert payload["file_name"] == "doc.pdf"


def test_create_parse_task_file_url_success():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "error_code": 0,
        "result": {"task_id": "task-url-1"},
    }
    file_url = "https://kms.example.com/api/public/documents/d1/original.pdf?exp=1&sig=abc"
    with patch("openkms_cli.baidu_parser.requests.post", return_value=mock_resp) as mock_post:
        task_id = create_parse_task("tok", "doc.pdf", file_url=file_url)
    assert task_id == "task-url-1"
    payload = mock_post.call_args.kwargs.get("data") or mock_post.call_args[1].get("data")
    assert payload["file_url"] == file_url
    assert "file_data" not in payload


def test_create_parse_task_requires_input():
    with pytest.raises(BaiduParseError, match="file_bytes or file_url"):
        create_parse_task("tok", "doc.pdf")


def test_validate_file_data_size_image_too_large():
    from openkms_cli.baidu_parser import validate_file_data_size

    with pytest.raises(BaiduParseError, match="10MB"):
        validate_file_data_size(b"x" * (11 * 1024 * 1024), "photo.jpg")


def test_validate_file_data_size_document_over_50mb():
    from openkms_cli.baidu_parser import MAX_FILE_DATA_BYTES, validate_file_data_size

    with pytest.raises(BaiduParseError, match="50MB"):
        validate_file_data_size(b"x" * (MAX_FILE_DATA_BYTES + 1), "report.pdf")


def test_validate_file_data_size_document_at_limit_ok():
    from openkms_cli.baidu_parser import MAX_FILE_DATA_BYTES, validate_file_data_size

    validate_file_data_size(b"x" * MAX_FILE_DATA_BYTES, "report.pdf")


def test_query_parse_task_error():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"error_code": 282007, "error_msg": "task not exist"}
    with patch("openkms_cli.baidu_parser.requests.post", return_value=mock_resp):
        with pytest.raises(BaiduParseError, match="task not exist"):
            query_parse_task("tok", "bad-id")


def test_poll_parse_task_success():
    results = [
        {"status": "pending"},
        {"status": "processing"},
        {"status": "success", "markdown_url": "https://x/md", "parse_result_url": "https://x/json"},
    ]
    with patch("openkms_cli.baidu_parser.query_parse_task", side_effect=results):
        with patch("openkms_cli.baidu_parser.time.sleep"):
            out = poll_parse_task("tok", "task-1", poll_interval=1, max_wait=30)
    assert out["status"] == "success"


def test_build_result_from_baidu_json(tmp_path):
    baidu_json = {
        "file_name": "test.pdf",
        "file_id": "file-1",
        "pages": [
            {
                "page_num": 0,
                "text": "Title\nBody",
                "layouts": [
                    {"layout_id": "p0-l1", "type": "doc_title", "text": "Title", "position": [0, 0, 100, 20]},
                    {"layout_id": "p0-l2", "type": "text", "text": "Body", "position": [0, 30, 200, 40]},
                    {"layout_id": "p0-l3", "type": "table", "text": "", "position": [0, 80, 300, 120]},
                    {"layout_id": "p0-l4", "type": "footer", "text": "Page footer", "position": [0, 700, 400, 20]},
                    {"layout_id": "p0-l5", "type": "chart", "text": "", "position": [50, 200, 200, 100]},
                ],
                "tables": [
                    {
                        "layout_id": "p0-l3",
                        "markdown": "| A | B |\n|---|---|\n| 1 | 2 |",
                    }
                ],
                "images": [
                    {
                        "layout_id": "p0-l5",
                        "data_url": "https://bos.example/chart.png",
                        "position": [50, 200, 200, 100],
                    }
                ],
                "meta": {"page_width": 612, "page_height": 792},
            },
            {
                "page_num": 1,
                "layouts": [
                    {"layout_id": "p1-l1", "type": "header", "text": "Header line", "position": [0, 10, 500, 20]},
                ],
                "tables": [],
                "images": [],
                "meta": {"page_width": 612, "page_height": 792},
            },
        ],
    }
    file_hash = "a" * 64

    def fake_download(url: str, *, session=None, timeout=300):
        if url.endswith("chart.png"):
            return b"\x89PNG\r\n"
        raise AssertionError(f"unexpected url {url}")

    with patch("openkms_cli.baidu_parser._download_bytes", side_effect=fake_download):
        result = _build_result_from_baidu_json(
            baidu_json,
            "# Title\n\nBody",
            file_hash,
            tmp_path,
        )

    assert result["file_hash"] == file_hash
    assert result["page_count"] == 2
    assert result["width"] == 612
    assert result["height"] == 792
    assert len(result["parsing_res_list"]) == 6
    table_block = next(b for b in result["parsing_res_list"] if b["label"] == "table")
    assert "| A | B |" in table_block["content"]
    footer = next(b for b in result["parsing_res_list"] if b["label"] == "footer")
    assert footer["content"] == "Page footer"
    assert len(result["layout_det_res"]) == 2
    assert result["layout_det_res"][0]["input_img"] == f"{file_hash}/layout_det_0_input_img_0.png"
    assert result["layout_det_res"][1]["input_img"] == f"{file_hash}/layout_det_1_input_img_0.png"
    box = result["layout_det_res"][0]["boxes"][0]
    assert box["coordinate"] == [0.0, 0.0, 100.0, 20.0]
    assert box["block_index"] == 0
    assert result["parser"] == "baidu-cloud-paddle-vl"
    chart_block = next(b for b in result["parsing_res_list"] if b["label"] == "chart")
    assert chart_block["image_path"] == f"{file_hash}/block_0.png"


def test_build_result_from_baidu_json_requires_pages(tmp_path):
    file_hash = "a" * 64
    with pytest.raises(BaiduParseError, match="no pages"):
        _build_result_from_baidu_json({"file_name": "x.pdf", "pages": []}, "# x", file_hash, tmp_path)


def test_scale_layout_coordinates_to_preview(tmp_path):
    pytest.importorskip("PIL")
    from PIL import Image

    Image.new("RGB", (1224, 1584)).save(tmp_path / "layout_det_0_input_img_0.png")

    blocks = [{"label": "text", "content": "Hi", "bbox": [0.0, 0.0, 100.0, 20.0], "image_path": None}]
    layout_list = [
        {
            "page_index": 0,
            "boxes": [
                {
                    "label": "text",
                    "coordinate": [0.0, 0.0, 100.0, 20.0],
                    "bbox": None,
                    "polygon_points": [[0, 0], [100, 0], [100, 20], [0, 20]],
                    "block_index": 0,
                }
            ],
            "input_img": "hash/layout_det_0_input_img_0.png",
        }
    ]
    preview_w, preview_h = _scale_layout_coordinates_to_preview(
        blocks, layout_list, tmp_path, [(612.0, 792.0)]
    )
    assert preview_w == 1224.0
    assert preview_h == 1584.0
    assert blocks[0]["bbox"] == [0.0, 0.0, 200.0, 40.0]
    assert layout_list[0]["boxes"][0]["coordinate"] == [0.0, 0.0, 200.0, 40.0]
    assert layout_list[0]["width"] == 1224.0
    assert layout_list[0]["height"] == 1584.0
