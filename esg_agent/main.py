"""Entry point: CLI + API server + scheduler."""
import argparse
import sys
import os

# Add project root to path so imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from loguru import logger
from core.config import settings

# Configure loguru
logger.remove()
logger.add(sys.stderr, level=settings.log_level, format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> — <level>{message}</level>")


def main():
    parser = argparse.ArgumentParser(description="ESG Intelligence Agent")
    parser.add_argument("--init-db", action="store_true", help="Initialize the database schema")
    parser.add_argument("--serve", action="store_true", help="Start the FastAPI server")
    parser.add_argument("--company", type=str, help="Run pipeline for a specific company")
    parser.add_argument("--company-domain", type=str, default=None, help="Optional domain override")
    parser.add_argument("--agent", action="store_true", help="Use LangChain agent (vs direct pipeline)")
    parser.add_argument("--schedule", action="store_true", help="Enable APScheduler for recurring jobs")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="API host")
    parser.add_argument("--port", type=int, default=8000, help="API port")
    args = parser.parse_args()

    if args.init_db:
        logger.info("Initializing database...")
        from core.database import init_db
        init_db()
        logger.success("Database initialized successfully!")
        if not args.serve and not args.company:
            return

    if args.company:
        logger.info(f"Running ESG pipeline for: {args.company}")
        if args.agent:
            from agent.orchestrator import run_pipeline_for_company
            result = run_pipeline_for_company(args.company)
            logger.info(f"Agent result: {result.get('output', 'No output')}")
        else:
            from agent.orchestrator import run_direct_pipeline
            result = run_direct_pipeline(args.company, args.company_domain)
            logger.info(f"Pipeline result: {result}")
        if not args.serve:
            return

    if args.serve:
        import uvicorn
        logger.info(f"Starting API server on {args.host}:{args.port}")

        if args.schedule:
            from apscheduler.schedulers.background import BackgroundScheduler
            scheduler = BackgroundScheduler()
            # Example: scheduled job runs every 24 hours
            # scheduler.add_job(func=some_function, trigger="interval", hours=24)
            scheduler.start()
            logger.info("APScheduler started")

        uvicorn.run(
            "api.app:app",
            host=args.host,
            port=args.port,
            reload=False,
            log_level=settings.log_level.lower()
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
