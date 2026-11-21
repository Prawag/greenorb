import asyncio, httpx, os
from dotenv import load_dotenv
load_dotenv('../MiroFish/.env')
async def test():
    key = os.getenv('LLM_API_KEY')
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    payload = {'model': 'llama-3.3-70b-versatile', 'messages': [{'role': 'user', 'content': 'hello'}]}
    async with httpx.AsyncClient() as c:
        r = await c.post('https://api.groq.com/openai/v1/chat/completions', headers=headers, json=payload)
        print(r.status_code, r.text)
asyncio.run(test())
