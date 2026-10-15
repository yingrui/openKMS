"""Exceptions the spreadsheet/mindmap preview builders raise on an unreadable upload.

Kept together so the four call sites in ``app/api/documents.py`` catch exactly "this file
could not be previewed" — a bug in the builders themselves should still surface.
"""

from __future__ import annotations

from zipfile import BadZipFile

from openpyxl.utils.exceptions import InvalidFileException

PREVIEW_ERRORS: tuple[type[BaseException], ...] = (
    BadZipFile,
    InvalidFileException,
    KeyError,
    TypeError,
    ValueError,
)
