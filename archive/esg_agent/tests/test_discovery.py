"""Tests for the discovery module."""
import pytest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestScoreUrl:
    """Test URL scoring logic (no API calls needed)."""

    def test_esg_keywords_boost_score(self):
        from modules.discovery import score_url
        url = "https://company.com/sustainability/esg-report-2024.pdf"
        score = score_url(url)
        assert score > 0, "URL with ESG keywords should have positive score"

    def test_pdf_extension_bonus(self):
        from modules.discovery import score_url
        url_pdf = "https://company.com/report.pdf"
        url_html = "https://company.com/report.html"
        assert score_url(url_pdf) > score_url(url_html)

    def test_news_sites_penalized(self):
        from modules.discovery import score_url
        url = "https://reuters.com/sustainability/esg-report"
        score = score_url(url)
        assert score < 0, "News aggregator URLs should have negative score"

    def test_clean_corporate_url(self):
        from modules.discovery import score_url
        url = "https://microsoft.com/sustainability"
        score = score_url(url)
        assert score >= 2


class TestGenerateSearchQueries:
    """Test query generation with mocked LLM."""

    @patch("modules.discovery.anthropic_client")
    def test_generates_four_queries(self, mock_client):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='["q1", "q2", "q3", "q4"]')]
        mock_client.messages.create.return_value = mock_response

        from modules.discovery import generate_search_queries
        queries = generate_search_queries("Microsoft")
        assert len(queries) == 4
        assert all(isinstance(q, str) for q in queries)


class TestSearchEsgUrls:
    """Test full search flow with mocked APIs."""

    @patch("modules.discovery.tavily_client")
    @patch("modules.discovery.anthropic_client")
    def test_returns_scored_candidates(self, mock_anthropic, mock_tavily):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='["q1", "q2", "q3", "q4"]')]
        mock_anthropic.messages.create.return_value = mock_response

        mock_tavily.search.return_value = {
            "results": [
                {"url": "https://company.com/sustainability.pdf", "title": "ESG Report"},
                {"url": "https://company.com/about", "title": "About Us"},
            ]
        }

        from modules.discovery import search_esg_urls
        candidates = search_esg_urls("TestCompany")
        assert len(candidates) > 0
        assert candidates[0]["score"] >= candidates[-1]["score"]
