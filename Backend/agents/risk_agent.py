from orchestrator.state import AgentState
from sandbox.safe_eval import safe_eval

def risk_agent(state: AgentState) -> dict:
    """
    Risk Agent: Performs deterministic math execution + linguistic greenwashing detection.
    Three-layer risk analysis:
      1. AST math sandbox (hallucination detection)
      2. ClimateBERT linguistic analysis (vague language detection)
      3. Absence-as-signal (undisclosed metric detection) — requires DB
    """
    print(f"\n[Risk Agent] Initiating multi-layer risk analysis...")
    data = state.get("extracted_data", {})
    if not data:
        return {"status": "FAILED", "failed_at": "risk_agent", "error": "No data passed to Risk Agent."}

    # ---- Layer 1: Deterministic Math Verification ----
    s1 = data.get("scope_1", 0) or 0
    s2 = data.get("scope_2", 0) or 0
    reported = data.get("reported_total", 0) or 0
    formula = data.get("math_formula", "scope_1 + scope_2")

    log = state.get("math_verification_log", [])
    if not isinstance(log, list):
        log = []

    log.append(f"Received Formula: {formula}")
    log.append(f"Variables: Scope1={s1}, Scope2={s2}")

    safe_locals = {"scope_1": s1, "scope_2": s2}

    try:
        print(f"[Risk Agent] Executing AST math parser on: {formula}")
        computed_total = safe_eval(formula, safe_locals)
        log.append(f"Computed Total: {computed_total}")
        log.append(f"Reported Total: {reported}")

        is_verified = (float(computed_total) == float(reported))
        if is_verified:
            log.append("✅ VERDICT: Math matches exactly. No hallucination.")
            print("[Risk Agent] ✅ Verification PASS.")
        else:
            log.append(f"⚠️ VERDICT: Discrepancy! Computed {computed_total} != Reported {reported}.")
            print("[Risk Agent] ⚠️ Verification FAIL -> Discrepancy detected.")

    except Exception as e:
        log.append(f"❌ Execution Error: {e}")
        is_verified = False

    # ---- Layer 2: ClimateBERT Linguistic Analysis ----
    linguistic_flags = []
    raw_text = state.get("raw_text", "")
    if raw_text:
        try:
            from agents.linguistic_risk import extract_high_risk_claims
            linguistic_flags = extract_high_risk_claims(raw_text)
            if linguistic_flags:
                log.append(f"🔍 Linguistic Analysis: {len(linguistic_flags)} high/medium risk claims detected.")
                print(f"[Risk Agent] 🔍 ClimateBERT flagged {len(linguistic_flags)} claims.")
            else:
                log.append("✅ Linguistic Analysis: No vague/evasive language detected.")
        except Exception as e:
            log.append(f"⚠️ Linguistic analysis skipped: {e}")
            print(f"[Risk Agent] ClimateBERT skipped: {e}")

    # ---- Layer 3: Absence-as-Signal (if sector data available) ----
    absence_signals = []
    # Note: This layer requires a DB connection with sector data.
    # It will be activated when the DB has enough company records for baselines.
    # For now, it's a placeholder that logs the capability.
    log.append("📊 Absence detection: Ready (requires sector baseline in DB)")

    return {
        "math_verification_log": log,
        "is_verified": is_verified,
        "linguistic_flags": linguistic_flags,
        "absence_signals": absence_signals,
        "status": "RISK_COMPLETE"
    }
