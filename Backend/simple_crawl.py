import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    try:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url="https://example.com")
            print(f"Success: {result.success}")
            if result.success:
                print(f"Content length: {len(result.markdown)}")
            else:
                print(f"Error: {result.error_message}")
    except Exception as e:
        print(f"Exception: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
