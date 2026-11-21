"""
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  DEPRECATED — DO NOT USE OR IMPORT                     ║
║  This is the legacy monolithic LangGraph orchestrator.      ║
║  It has been replaced by the modular pipeline at:           ║
║    orchestrator/langgraph_pipeline.py                       ║
║    orchestrator/state.py                                    ║
║    agents/scout_agent.py                                    ║
║    agents/analyst_agent.py       (with LLM router + cache)  ║
║    agents/risk_agent.py          (with ClimateBERT)          ║
║    agents/strategy_agent.py                                  ║
║  This file is kept only for historical reference.           ║
╚══════════════════════════════════════════════════════════════╝
"""

raise ImportError(
    "langgraph_orchestrator.py is DEPRECATED. "
    "Use 'from orchestrator.langgraph_pipeline import app' instead."
)
