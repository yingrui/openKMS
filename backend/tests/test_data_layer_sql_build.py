"""What a qualified table name looks like, and when it is refused.

One implementation, because the two callers that used to duplicate it (a quality rule, a row edit) each carried their own
copy of the identifier validation next to their own copy of the quoting — and that is how validation drifts away from the
string it is supposed to guard.
"""


class TestQualifiedTable:
    def test_quotes_both_parts(self):
        from app.services.data.sql_build import qualified_table

        assert qualified_table("tushare", "daily_basic") == '"tushare"."daily_basic"'

    def test_refuses_injection_and_emptiness(self):
        from app.services.data.sql_build import qualified_table

        assert qualified_table("tushare; drop table x", "t") is None
        assert qualified_table(None, "t") is None
        assert qualified_table("s", None) is None
        assert qualified_table("", "") is None
