from orchestrator.state import AgentState
from sandbox.safe_eval import safe_eval

def verify_scope2_with_grid(state: dict) -> dict:
    """
    Cross-check reported Scope 2 against Electricity Maps grid factor.
    If company uses self-reported grid factor that differs significantly
    from the actual grid carbon intensity for their country, flag it.
    """
    country = state.get("company_country")
    extracted = state.get("extracted_data", {})
    reported_scope2 = extracted.get("scope_2")
    reported_energy = extracted.get("energy_consumption")  # GJ

    if not all([country, reported_scope2, reported_energy]):
        return state

    try:
        import httpx
        with httpx.Client(timeout=10) as client:
            r = client.get(f"http://localhost:5000/api/globe/grid")
            grid_data = r.json().get("data", [])

        # Find matching zone
        country_grid = next(
            (z for z in grid_data if country.lower() in z["name"].lower()),
            None
        )

        if country_grid:
            ci = country_grid["carbon_intensity"]  # gCO2eq/kWh
            energy_kwh = float(reported_energy) * 277.778  # GJ to kWh
            calculated_scope2 = (energy_kwh * ci) / 1e6  # tonnes CO2e

            tolerance = 0.25  # 25% tolerance
            if float(reported_scope2) > 0:
                ratio = abs(calculated_scope2 - float(reported_scope2)) / float(reported_scope2)
                if ratio > tolerance:
                    state["scope2_grid_flag"] = {
                        "reported_scope2":   float(reported_scope2),
                        "calculated_scope2": round(calculated_scope2, 0),
                        "grid_carbon_intensity": ci,
                        "discrepancy_pct":   round(ratio * 100, 1),
                        "severity": "HIGH" if ratio > 0.5 else "MEDIUM",
                        "message": (
                            f"Reported Scope 2 ({float(reported_scope2):,.0f} tCO₂e) differs "
                            f"{ratio*100:.1f}% from grid-verified estimate "
                            f"({calculated_scope2:,.0f} tCO₂e) using actual grid "
                            f"intensity of {ci} gCO₂eq/kWh for {country}."
                        )
                    }
    except Exception as e:
        import logging
        logging.getLogger("risk_agent").warning(f"Grid verification failed: {e}")

    return state

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

    # ---- Layer 1b: Grid Carbon Verification (Scope 2) ----
    state = verify_scope2_with_grid(state)
    if "scope2_grid_flag" in state:
        msg = state["scope2_grid_flag"]["message"]
        log.append(f"⚠️ GRID VERDICT: {msg}")
        print(f"[Risk Agent] ⚠️ Grid Scope 2 Discrepancy detected.")
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

    # ---- Layer 4: OpenSanctions Checker ----
    from agents.sanctions_checker import check_sanctions
    sanctions_result = check_sanctions(state.get("company_name", ""))
    state["sanctions_check"] = sanctions_result

    if sanctions_result.get("risk_level") in ("CRITICAL", "HIGH"):
        state["has_critical_flag"] = True
        log.append(f"🚨 SANCTIONS: {sanctions_result.get('message')}")
        print(f"[Risk Agent] 🚨 OpenSanctions Match: {state.get('company_name')}!")

    return {
        "math_verification_log": log,
        "is_verified": is_verified,
        "linguistic_flags": linguistic_flags,
        "absence_signals": absence_signals,
        "sanctions_check": sanctions_result,
        "status": "RISK_COMPLETE"
    }
