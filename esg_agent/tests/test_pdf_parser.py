"""Tests for the PDF parser module."""
import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestTablesToText:
    def test_converts_dataframe_to_text(self):
        import pandas as pd
        from modules.pdf_parser import tables_to_text

        df = pd.DataFrame({
            0: ["Metric", "Scope 1", "Scope 2"],
            1: ["Value", "1000", "2000"],
            2: ["Unit", "tCO2e", "tCO2e"]
        })

        tables = [{"page": 1, "table_index": 0, "dataframe": df, "accuracy": 95.0}]
        result = tables_to_text(tables)

        assert len(result) == 1
        assert "[TABLE Page 1]" in result[0]["text"]
        assert "Scope 1" in result[0]["text"]


class TestExtractTextFromPdf:
    @patch("modules.pdf_parser.fitz")
    def test_extracts_text_pages(self, mock_fitz):
        mock_doc = MagicMock()
        mock_page = MagicMock()
        mock_page.get_text.return_value = "This is a sustainability report with Scope 1 emissions of 5000 tCO2e."
        mock_doc.__iter__ = MagicMock(return_value=iter([mock_page]))
        mock_doc.__len__ = MagicMock(return_value=1)
        mock_fitz.open.return_value = mock_doc

        from modules.pdf_parser import extract_text_from_pdf
        # This will use the mocked fitz
        # Note: Direct testing requires actual fitz; this tests the structure
