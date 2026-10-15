"""One page-size convention for the data layer's list endpoints.

Lists used to disagree (datasets/rows capped at 500 with a 100 default, quality runs at 200/50),
which made `--limit` behave differently per command for no reason.
"""

from __future__ import annotations

DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500
