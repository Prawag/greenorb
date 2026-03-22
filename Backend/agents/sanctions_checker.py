import httpx
import logging

logger = logging.getLogger("sanctions_checker")
OPENSANCTIONS_URL = "https://api.opensanctions.org/search/default"

def check_sanctions(company_name: str) -> dict:
    """
    Check company name against OpenSanctions database.
    Returns: {found: bool, matches: list, highest_score: float, risk_level: str}
    """
    if not company_name:
        return {"found": False, "matches": [], "highest_score": 0, "risk_level": "NONE"}

    try:
        with httpx.Client(timeout=15) as client:
            r = client.get(
                OPENSANCTIONS_URL,
                params={
                    "q":      company_name,
                    "schema": "Company",
                    "limit":  5,
                }
            )
            data = r.json()

        results = data.get("results", [])
        if not results:
            return {"found": False, "matches": [], "highest_score": 0, "risk_level": "NONE"}

        # Score > 0.85: very likely match
        # Score 0.7-0.85: possible match, flag for review
        best = max(results, key=lambda x: x.get("score", 0))
        score = best.get("score", 0)

        risk_level = "NONE"
        if score > 0.85:
            risk_level = "CRITICAL"
        elif score > 0.70:
            risk_level = "HIGH"
        elif score > 0.55:
            risk_level = "MEDIUM"

        return {
            "found":         score > 0.55,
            "highest_score": round(score, 3),
            "risk_level":    risk_level,
            "matches": [{
                "name":      m.get("caption"),
                "score":     m.get("score"),
                "datasets":  m.get("datasets", []),
                "url":       f"https://www.opensanctions.org/entities/{m.get('id')}/"
            } for m in results if m.get("score", 0) > 0.55],
            "message": (
                f"Company name '{company_name}' matched OpenSanctions database "
                f"with {score:.1%} confidence. Sanctioned entities frequently "
                f"engage in illegal environmental crimes."
            ) if score > 0.55 else None
        }

    except Exception as e:
        logger.error(f"OpenSanctions check failed for {company_name}: {e}")
        return {"found": False, "matches": [], "highest_score": 0,
                "risk_level": "UNKNOWN", "error": str(e)}
