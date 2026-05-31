"""Tests for the LLM extractor module."""
import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas.esg_metrics import ESGExtractionResult, ESGMetricValue, MetricCategory, DocumentClassification


class TestExtractEsgFromChunk:
    @patch("modules.llm_extractor.client")
    def test_returns_extraction_result(self, mock_client):
        expected = ESGExtractionResult(
            company_name="TestCorp",
            report_year=2024,
            metrics=[
                ESGMetricValue(
                    metric_name="Scope 1 GHG Emissions",
                    category=MetricCategory.Environmental,
                    value=5000.0,
                    unit="tCO2e",
                    year_reported=2024,
                    confidence=0.95,
                    source_text="Scope 1 emissions were 5,000 tCO2e in 2024."
                )
            ]
        )
        mock_client.messages.create.return_value = expected

        from modules.llm_extractor import extract_esg_from_chunk
        result = extract_esg_from_chunk("Scope 1 emissions were 5,000 tCO2e in 2024.", chunk_page=1)
        assert len(result.metrics) == 1
        assert result.metrics[0].metric_name == "Scope 1 GHG Emissions"

    @patch("modules.llm_extractor.client")
    def test_handles_api_failure_gracefully(self, mock_client):
        mock_client.messages.create.side_effect = Exception("API Error")

        from modules.llm_extractor import extract_esg_from_chunk
        result = extract_esg_from_chunk("Some text", chunk_page=1)
        assert result.metrics == []


class TestClassifyDocument:
    @patch("modules.llm_extractor.client")
    def test_classifies_document(self, mock_client):
        expected = DocumentClassification(
            report_type="sustainability_report",
            confidence=0.95,
            reasoning="Document is a dedicated sustainability report."
        )
        mock_client.messages.create.return_value = expected

        from modules.llm_extractor import classify_document
        result = classify_document("This is a sustainability report for FY2024.")
        assert result.report_type == "sustainability_report"

    @patch("modules.llm_extractor.client")
    def test_handles_failure(self, mock_client):
        mock_client.messages.create.side_effect = Exception("API Error")

        from modules.llm_extractor import classify_document
        result = classify_document("Some text")
        assert result.report_type == "other"
        assert result.confidence == 0.0
