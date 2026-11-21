import sys
import os
import json

# Ensure internal modules can be imported if this is run directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, END
from orchestrator.state import AgentState

from agents.scout_agent import scout_agent
from agents.analyst_agent import analyst_agent
from agents.risk_agent import risk_agent
from agents.strategy_agent import strategy_agent

def failed_node(state: AgentState):
    print(f"\n[FAILED] Execution aborted at node: {state.get('failed_at')}. Error: {state.get('error')}")
    return state

def route_after_scout(state: AgentState):
    if state.get("status") == "FAILED": return "failed"
    if state.get("status") == "SCOUT_COMPLETE": return "analyst"
    return END

def route_after_analyst(state: AgentState):
    if state.get("status") == "FAILED": return "failed"
    if state.get("status") == "ANALYST_COMPLETE": return "risk"
    return END

def route_after_risk(state: AgentState):
    if state.get("status") == "FAILED": return "failed"
    if state.get("status") == "RISK_COMPLETE": return "strategy"
    return END

def build_workflow():
    workflow = StateGraph(AgentState)

    workflow.add_node("scout", scout_agent)
    workflow.add_node("analyst", analyst_agent)
    workflow.add_node("risk", risk_agent)
    workflow.add_node("strategy", strategy_agent)
    workflow.add_node("failed", failed_node)

    workflow.set_entry_point("scout")

    workflow.add_conditional_edges("scout", route_after_scout)
    workflow.add_conditional_edges("analyst", route_after_analyst)
    workflow.add_conditional_edges("risk", route_after_risk)
    
    workflow.add_edge("strategy", END)
    workflow.add_edge("failed", END)
    
    return workflow.compile()

app = build_workflow()

if __name__ == "__main__":
    print("🚀 Initializing GreenOrb Modular LangGraph Pipeline")
    initial_state = {
        "company": "Tata Steel", 
        "pdf_path": "", 
        "raw_text": "", 
        "extracted_data": {}, 
        "math_verification_log": [], 
        "is_verified": False, 
        "status": "INIT", 
        "error": "",
        "failed_at": "",
        "cache_hit": False,
        "llm_provider": "",
        "linguistic_flags": [],
        "absence_signals": [],
        "framework_tags": {},
        "schema_used": "",
        "schema_confidence": 0.0
    }
    
    final_state = app.invoke(initial_state)
    print("\n" + "="*50)
    print("🏁 FINAL ORCHESTRATION STATE")
    print("="*50)
    print(json.dumps({
        k: v for k, v in final_state.items() if k not in ["raw_text"]
    }, indent=2))
