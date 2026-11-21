import json

import httpx

from greenorb_worker.config import Settings
from greenorb_worker.llm import LLMClient, parse_json_loose
from greenorb_worker.pipeline import analyse


def settings(**kw) -> Settings:
    s = Settings(database_url="unused", worker_id="test", embeddings_provider="none", llm_providers=["groq"])
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def test_parse_json_loose_repairs_truncation():
    assert parse_json_loose('```json\n{"metrics": [{"a": 1}]}\n```') == {"metrics": [{"a": 1}]}
    repaired = parse_json_loose('{"metrics": [{"a": 1}, {"a": 2, "b": "unfinish')
    assert repaired["metrics"][0] == {"a": 1}
    assert parse_json_loose("no json here") is None


def test_tables_only_analysis_and_flags(brsr_pdf):
    res = analyse(brsr_pdf, settings=settings(), llm=LLMClient(settings()))
    assert res["fiscal_year"] == 2024
    kept = {(c.metric, c.fiscal_year): c.value for c in res["candidates"] if c.status != "rejected"}
    assert kept[("ghg_scope1", 2024)] == 856434
    assert res["assurance"].level == "none"
    codes = {f.code for f in res["flags"]}
    assert "NO_ASSURANCE" in codes
    assert "SCOPE3_NOT_REPORTED" in codes
    assert "NET_ZERO_NO_INTERIM" in codes
    assert res["chunks"]


def _fake_llm(payload: dict) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(payload)}}]})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_llm_values_are_grounded_and_hallucinations_rejected(brsr_pdf):
    s = settings(groq_api_key="test-key")
    payload = {"metrics": [
        # agrees with the table -> upgraded to table+llm
        {"metric": "ghg_scope2", "fiscal_year": 2024, "value": "83,179", "unit": "Metric tonnes of CO2 equivalent", "page": 2},
        # number that is not in the PDF -> rejected
        {"metric": "ghg_scope3", "fiscal_year": 2024, "value": "4,20,000", "unit": "tCO2e", "page": 2},
    ]}
    llm = LLMClient(s, http=_fake_llm(payload))
    res = analyse(brsr_pdf, settings=s, llm=llm)
    by = {(c.metric, c.fiscal_year, c.method): c for c in res["candidates"]}
    assert by[("ghg_scope2", 2024, "table+llm")].confidence > 0.9
    s3 = by[("ghg_scope3", 2024, "llm")]
    assert s3.status == "rejected" and not s3.grounded


def test_llm_provider_failover():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if "groq" in str(request.url):
            return httpx.Response(401, json={"error": {"message": "bad key"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok": true}'}}]})

    s = settings(groq_api_key="x", gemini_api_key="y", llm_providers=["groq", "gemini"])
    llm = LLMClient(s, http=httpx.Client(transport=httpx.MockTransport(handler)))
    data, provider = llm.chat_json("sys", "user")
    assert data == {"ok": True} and provider == "gemini"
    assert any("groq" in c for c in calls)
