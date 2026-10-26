

class TestBoundedReads:
    """A grid asking for 100 rows must not materialise a season of tick data.

    The bounds are the protection: `columns` prunes at the parser, `nrows` caps the rows, and an absurd file is
    refused by name rather than by OOM.
    """

    def test_nrows_and_columns_bound_what_is_read(self):
        from app.services.data_layer.file_datasets import read_file_bytes

        csv = b"a,b\n1,10\n2,20\n3,30\n"
        frame = read_file_bytes(csv, "x.csv", nrows=2, columns=["b"])
        assert list(frame.columns) == ["b"]
        assert len(frame) == 2

    def test_an_oversized_file_is_refused_with_its_name(self, monkeypatch):
        import pytest

        from app.services.data_layer import file_datasets

        monkeypatch.setattr(file_datasets, "MAX_READ_BYTES", 8)
        with pytest.raises(file_datasets.FileDatasetError, match="over the 0 MB read limit"):
            file_datasets.read_file_bytes(b"a,b\n1,10\n2,20\n3,30\n", "big.csv")

    def test_an_unsupported_suffix_still_says_which_types_work(self):
        import pytest

        from app.services.data_layer.file_datasets import FileDatasetError, read_file_bytes

        with pytest.raises(FileDatasetError, match="parquet, csv, jsonl or json"):
            read_file_bytes(b"x", "x.xlsx")
