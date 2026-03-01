import asyncio
import sys
import json
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        return

    url = sys.argv[1]
    
    browser_conf = BrowserConfig(headless=True)
    run_conf = CrawlerRunConfig(
        word_count_threshold=10,
        exclude_external_links=True,
        remove_overlay_elements=True
    )

    try:
        async with AsyncWebCrawler(config=browser_conf) as crawler:
            result = await crawler.arun(url=url, config=run_conf)
            
            if result.success:
                print(json.dumps({
                    "success": True, 
                    "markdown": result.markdown
                }))
            else:
                print(json.dumps({
                    "success": False,
                    "error": result.error_message
                }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))

if __name__ == "__main__":
    # Fix encoding issues for Python print -> ChildProcess stdout
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
