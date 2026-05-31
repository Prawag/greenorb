"""Orchestrator: LangChain agent that wires all four modules together."""
import asyncio
from typing import Optional
from langchain_anthropic import ChatAnthropic
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from loguru import logger

from core.config import settings
from core.database import SessionLocal
from modules.discovery import find_best_esg_url
from modules.scraper import scrape_and_download
from modules.pdf_parser import parse_pdf_full
from modules.analyst import filter_relevant_pages
from modules.chunker import create_chunks
from modules.llm_extractor import extract_all_from_document, classify_document
from modules.storage import (
    get_or_create_company, create_document,
    save_chunks_with_embeddings, save_esg_values
)
from urllib.parse import urlparse

from agent.tools.discovery_tool import discover_esg_page, search_esg_pages
from agent.tools.extraction_tool import download_esg_reports
from agent.tools.processing_tool import process_esg_pdf
from agent.tools.storage_tool import process_and_store_report


def get_tools():
    """Return all agent tools."""
    return [
        discover_esg_page,
        search_esg_pages,
        download_esg_reports,
        process_esg_pdf,
        process_and_store_report,
    ]


def create_agent() -> AgentExecutor:
    """Create and return the LangChain agent executor."""
    llm = ChatAnthropic(
        model="claude-sonnet-4-20250514",
        temperature=0,
        max_tokens=4096,
        anthropic_api_key=settings.anthropic_api_key,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an ESG Intelligence Agent. Your job is to discover, download, 
process, and store ESG (Environmental, Social, Governance) sustainability reports for companies.

You have access to the following tools:
1. discover_esg_page - Find the best ESG page URL for a company
2. search_esg_pages - Find multiple candidate ESG page URLs
3. download_esg_reports - Download PDF reports from an ESG page
4. process_esg_pdf - Parse a PDF and extract ESG metrics (without storing)
5. process_and_store_report - Full pipeline: parse, extract, embed, and store in database

Workflow for processing a company:
1. First, use discover_esg_page to find the company's ESG page
2. Then use download_esg_reports to download PDFs from that page
3. Finally, use process_and_store_report for each downloaded PDF to extract and store metrics

Always extract the company domain from the ESG page URL for the storage step.
Be thorough and process all available reports."""),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    tools = get_tools()
    agent = create_tool_calling_agent(llm, tools, prompt)

    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=15,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
    )


def run_pipeline_for_company(company_name: str) -> dict:
    """Run the full ESG pipeline for a company using the agent."""
    logger.info(f"Starting ESG pipeline for: {company_name}")
    agent_executor = create_agent()
    result = agent_executor.invoke({
        "input": f"Find, download, and process all ESG/sustainability reports for the company: {company_name}. "
                 f"Store all extracted metrics in the database."
    })
    logger.info(f"Pipeline completed for {company_name}")
    return result


def run_direct_pipeline(company_name: str, company_domain: str = None) -> dict:
    """Run the pipeline directly without the LangChain agent (deterministic)."""
    logger.info(f"Starting direct pipeline for: {company_name}")
    results = {"company": company_name, "documents_processed": 0, "metrics_extracted": 0, "errors": []}

    try:
        # Step 1: Discovery
        logger.info("Step 1: Discovering ESG page...")
        esg_url = find_best_esg_url(company_name)
        if not esg_url:
            results["errors"].append("No ESG page found")
            return results

        domain = company_domain or urlparse(esg_url).netloc.replace("www.", "")

        # Step 2: Scrape and download
        logger.info(f"Step 2: Scraping {esg_url}...")
        downloads = asyncio.run(scrape_and_download(company_name, esg_url))
        if not downloads:
            results["errors"].append("No PDFs downloaded")
            return results

        # Step 3: Process each PDF
        db = SessionLocal()
        try:
            company = get_or_create_company(db, name=company_name, domain=domain)

            for dl in downloads:
                try:
                    logger.info(f"Step 3: Processing {dl['title']}...")

                    # Parse PDF
                    text_blocks = parse_pdf_full(dl["local_path"])
                    if not text_blocks:
                        results["errors"].append(f"No text from {dl['title']}")
                        continue

                    # Classify
                    first_text = " ".join([b["text"] for b in text_blocks[:3]])
                    classification = classify_document(first_text)

                    # Create document
                    doc = create_document(
                        db=db,
                        company_id=company.id,
                        url=dl["source_url"],
                        title=dl["title"],
                        report_type=classification.report_type,
                        local_path=dl["local_path"],
                        content_hash=dl["content_hash"]
                    )

                    # Filter blocks with Analyst Module
                    filtered_blocks = filter_relevant_pages(text_blocks)
                    if not filtered_blocks:
                        logger.warning(f"No relevant carbon data found in {dl['title']}")
                        continue

                    # Chunk and embed ONLY relevant pages
                    chunks = create_chunks(filtered_blocks)
                    save_chunks_with_embeddings(db, doc.id, chunks)

                    # Extract metrics
                    extraction_results = extract_all_from_document(chunks)
                    
                    # ---------------------------------------------------------
                    # THE DILIGENCE AGENT: Verify all metrics before saving
                    # ---------------------------------------------------------
                    from modules.verifier import verify_extraction_results
                    verified_results = []
                    for res in extraction_results:
                        verified_metrics = verify_extraction_results(res.metrics)
                        if verified_metrics:
                            res.metrics = verified_metrics
                            verified_results.append(res)
                    
                    saved = save_esg_values(db, doc.id, company.id, verified_results)

                    results["documents_processed"] += 1
                    results["metrics_extracted"] += saved
                    logger.info(f"Processed {dl['title']}: {saved} verified metrics saved")

                except Exception as e:
                    logger.error(f"Error processing {dl.get('title', 'unknown')}: {e}")
                    results["errors"].append(str(e))
                    db.rollback()
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Pipeline failed for {company_name}: {e}")
        results["errors"].append(str(e))

    logger.info(f"Pipeline results for {company_name}: {results}")
    return results
