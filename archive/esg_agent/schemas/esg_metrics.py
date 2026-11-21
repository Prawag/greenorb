"""Pydantic schemas for ESG metric extraction via Instructor + Claude."""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from enum import Enum


class MetricCategory(str, Enum):
    Environmental = "Environmental"
    Social = "Social"
    Governance = "Governance"


class ESGMetricValue(BaseModel):
    metric_name: str = Field(description="Exact standardised metric name, e.g. 'Scope 1 GHG Emissions'")
    category: MetricCategory = Field(description="One of: Environmental, Social, Governance")
    value: Optional[float] = Field(None, description="Numeric value if present")
    value_text: Optional[str] = Field(None, description="Raw text value if not numeric, e.g. 'Yes' or 'Policy adopted'")
    unit: Optional[str] = Field(None, description="Unit of measurement, e.g. 'tCO2e', '%', 'MWh'")
    year_reported: Optional[int] = Field(None, description="The year the metric applies to (not publication year)")
    confidence: float = Field(description="Your confidence 0.0-1.0 that this extraction is accurate")
    source_text: str = Field(description="The exact sentence or table cell from which you extracted this value")
    page_hint: Optional[int] = Field(None, description="Page number in the PDF if visible in context")

    @model_validator(mode='after')
    def validate_hallucination(self):
        val = self.value
        source = self.source_text
        # If there's a numeric value and source text, ensure the digits appear in the text
        if val is not None and source:
            # Check if the exact string or at least the non-zero digits appear in the source text
            # E.g. 5000 -> "5000", or 5,000 -> "5000" in source stripped of commas.
            val_str = str(val).replace(".0", "")
            source_clean = source.replace(",", "")
            if val_str not in source_clean:
                raise ValueError(f"HALLUCINATION DETECTED: The number {val} does not literally appear in the source text: '{source}'. Do not calculate or invent numbers.")
        return self


class ESGExtractionResult(BaseModel):
    company_name: Optional[str] = Field(None, description="Company name if found in the text")
    report_year: Optional[int] = Field(None, description="Primary reporting year of this document")
    report_type: Optional[str] = Field(None, description="Type: sustainability_report / annual_report / csr_report / tcfd_report / other")
    metrics: List[ESGMetricValue] = Field(default_factory=list, description="All ESG metrics found in this text chunk")


class DocumentClassification(BaseModel):
    report_type: str = Field(description="One of: sustainability_report, annual_report, csr_report, tcfd_report, press_release, other")
    confidence: float = Field(description="Confidence 0.0-1.0")
    reasoning: str = Field(description="One sentence explaining the classification")
