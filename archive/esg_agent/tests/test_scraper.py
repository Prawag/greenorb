"""Tests for the scraper module."""
import pytest
import sys
import os
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestIsEsgPdfLink:
    def test_positive_match(self):
        from modules.scraper import is_esg_pdf_link
        assert is_esg_pdf_link("sustainability-report-2024.pdf", "ESG Report")

    def test_negative_non_pdf(self):
        from modules.scraper import is_esg_pdf_link
        assert not is_esg_pdf_link("sustainability-report-2024.html", "ESG Report")

    def test_negative_unrelated_pdf(self):
        from modules.scraper import is_esg_pdf_link
        assert not is_esg_pdf_link("financial-summary.pdf", "Q3 Earnings")


class TestBuildLocalFilename:
    def test_builds_expected_filename(self):
        from modules.scraper import build_local_filename
        path = build_local_filename("Microsoft", "https://example.com/report-2024.pdf")
        assert "microsoft" in str(path).lower()
        assert "2024" in str(path)
        assert str(path).endswith(".pdf")

    def test_handles_no_year(self):
        from modules.scraper import build_local_filename
        path = build_local_filename("Apple", "https://example.com/report.pdf")
        assert "unknown" in str(path)


class TestComputeFileHash:
    def test_computes_hash(self, tmp_path):
        from modules.scraper import compute_file_hash
        test_file = tmp_path / "test.pdf"
        test_file.write_bytes(b"test content for hashing")
        h = compute_file_hash(test_file)
        assert len(h) == 64  # SHA-256 hex digest length
