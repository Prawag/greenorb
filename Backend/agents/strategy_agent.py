from orchestrator.state import AgentState

def strategy_agent(state: AgentState) -> dict:
    """
    Strategy Agent: Finalizes the report state and decides whether to mint DB records/tokens.
    """
    print(f"\n[Strategy Agent] Finalizing report for {state.get('company', 'Unknown')}")
    if state.get("is_verified"):
        print("[Strategy Agent] Assets verified. Ready to mint $GORB tokens or write to DB.")
    else:
        print("[Strategy Agent] Audit flagged. Routing to human review queue.")
        
    return {"status": "COMPLETED"}
