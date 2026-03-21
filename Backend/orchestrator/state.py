from typing import TypedDict, Any, Dict, List

class AgentState(TypedDict):
    company: str
    pdf_path: str
    raw_text: str
    extracted_data: Dict[str, Any]
    math_verification_log: List[str]
    is_verified: bool
    status: str
    error: str
    failed_at: str
    cache_hit: bool
    llm_provider: str
    linguistic_flags: List[Dict[str, Any]]
    absence_signals: List[Dict[str, Any]]
    framework_tags: Dict[str, Any]
    schema_used: str
    schema_confidence: float
