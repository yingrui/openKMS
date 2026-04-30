"""Tests for pure parser helpers (layout / bbox)."""

from __future__ import annotations

from openkms_cli.parser import (
    _annotate_layout_boxes,
    _bbox_iou,
    _find_best_matching_block,
    _get_block_field,
    _iter_layout_boxes,
)


def test_bbox_iou_overlap() -> None:
    # identical boxes
    assert _bbox_iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    # half overlap of equal areas -> 0.25 / 0.5 = 0.5? two 100 area, intersection 50 -> 50/(100+100-50)=50/150
    assert abs(_bbox_iou([0, 0, 10, 10], [5, 0, 15, 10]) - 50 / 150) < 1e-6


def test_bbox_iou_invalid() -> None:
    assert _bbox_iou([], [0, 0, 1, 1]) == 0.0
    assert _bbox_iou([0, 0, 1], [0, 0, 1, 1]) == 0.0


def test_find_best_matching_block() -> None:
    blocks = [{"bbox": [0, 0, 10, 10]}, {"bbox": [100, 100, 110, 110]}]
    idx = _find_best_matching_block([0, 0, 10, 10], blocks, iou_threshold=0.01)
    assert idx == 0
    assert _find_best_matching_block([200, 200, 210, 210], blocks) == -1


def test_iter_layout_boxes_list_and_dict() -> None:
    layout = [{"boxes": [{"id": 1}, {"id": 2}]}]
    assert len(_iter_layout_boxes(layout)) == 2
    assert _iter_layout_boxes({"boxes": [{"id": 3}]}) == [{"id": 3}]


def test_annotate_layout_boxes_sets_block_index() -> None:
    layout = {"boxes": [{"coordinate": [0, 0, 10, 10]}]}
    blocks = [{"bbox": [0, 0, 10, 10], "label": "x"}]
    _annotate_layout_boxes(layout, blocks, iou_threshold=0.01)
    assert layout["boxes"][0].get("block_index") == 0


def test_get_block_field_dict_and_attr() -> None:
    class Obj:
        block_label = "t"

    assert _get_block_field(Obj(), "block_label", "block_label", "") == "t"
    assert _get_block_field({"block_label": "d"}, "block_label", "block_label", "") == "d"
