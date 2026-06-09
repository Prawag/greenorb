import os
import httpx
import asyncio
from pathlib import Path
from dotenv import load_dotenv

base_dir = Path(__file__).resolve().parent.parent
load_dotenv(base_dir / 'MiroFish/.env')
load_dotenv(base_dir / 'Backend/.env')
load_dotenv(base_dir / 'esg_agent/.env')

async def test_cerebras_large():
    key = os.getenv('CEREBRAS_API_KEY')
    url = "https://api.cerebras.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    # Send a prompt with ~15k characters of dummy text
    dummy_text = "Here is some context about ESG reporting. " * 300
    prompt = f"Extract ESG metrics for test. Context: {dummy_text}"
    payload = {
        "model": "gpt-oss-120b",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            print("Cerebras Status:", resp.status_code)
            print("Cerebras Response Headers:", dict(resp.headers))
            print("Cerebras Response Body:", resp.text[:1000])
    except Exception as e:
        print("Cerebras Error:", e)

async def main():
    await test_cerebras_large()

if __name__ == "__main__":
    asyncio.run(main())
