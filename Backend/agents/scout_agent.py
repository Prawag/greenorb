import os
from orchestrator.state import AgentState

def scout_agent(state: AgentState) -> dict:
    """
    Scout Agent: Locates and acquires the ESG PDF report for a given company.
    """
    print(f"\n[Scout Agent] Locating ESG report for: {state['company']}")
    raw_dir = os.path.join(os.path.dirname(__file__), "..", "..", "RawData")
    
    found_pdf = ""
    if os.path.exists(raw_dir):
        for f in os.listdir(raw_dir):
            if state["company"].lower() in f.lower() and f.endswith(".pdf"):
                found_pdf = os.path.join(raw_dir, f)
                break
                
    if not found_pdf:
        # Fallback for testing
        if os.path.exists(raw_dir):
            for f in os.listdir(raw_dir):
                if f.endswith(".pdf"):
                    found_pdf = os.path.join(raw_dir, f)
                    break

    if not found_pdf:
        return {"status": "FAILED", "failed_at": "scout_agent", "error": "No PDFs found in RawData for testing."}
        
    print(f"[Scout Agent] Acquired document: {os.path.basename(found_pdf)}")
    return {"pdf_path": found_pdf, "status": "SCOUT_COMPLETE"}
