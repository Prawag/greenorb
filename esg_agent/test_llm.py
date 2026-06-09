import os
import httpx
import asyncio
from pathlib import Path
from dotenv import load_dotenv

base_dir = Path(__file__).resolve().parent.parent
load_dotenv(base_dir / 'MiroFish/.env')
load_dotenv(base_dir / 'Backend/.env')
load_dotenv(base_dir / 'esg_agent/.env')

async def test_gemini_primary():
    key = os.getenv('GEMINI_API_KEY', 'AIzaSyCK1Q2xg2rO9pJtnBMBshXOqKhUkS1vyy4')
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": "Hello, write a 3-word response."}]}]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            print("Gemini Primary Status:", resp.status_code)
            print("Gemini Primary Response:", resp.text[:300])
    except Exception as e:
        print("Gemini Primary Error:", e)

async def test_gemini_secondary():
    key = os.getenv('VITE_GEMINI_KEY', 'AIzaSyD2IaDVX6JNm8QwW1fr_gXXIQ0C_-Kgt4s')
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": "Hello, write a 3-word response."}]}]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            print("Gemini Secondary Status:", resp.status_code)
            print("Gemini Secondary Response:", resp.text[:300])
    except Exception as e:
        print("Gemini Secondary Error:", e)

async def test_groq_llm_key():
    key = os.getenv('LLM_API_KEY')
    print("LLM_API_KEY (from MiroFish/.env):", key[:15] if key else "None")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Hello, write a 3-word response."}]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            print("Groq LLM_API_KEY Status:", resp.status_code)
            print("Groq LLM_API_KEY Response:", resp.text[:300])
    except Exception as e:
        print("Groq LLM_API_KEY Error:", e)

async def test_groq_backend_key():
    key = os.getenv('GROQ_API_KEY')
    print("GROQ_API_KEY (from Backend/.env):", key[:15] if key else "None")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": "Hello, write a 3-word response."}]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            print("Groq GROQ_API_KEY Status:", resp.status_code)
            print("Groq GROQ_API_KEY Response:", resp.text[:300])
    except Exception as e:
        print("Groq GROQ_API_KEY Error:", e)

async def test_cerebras():
    key = os.getenv('CEREBRAS_API_KEY')
    print("CEREBRAS_API_KEY:", key[:15] if key else "None")
    url = "https://api.cerebras.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    # Test both llama-3.3-70b and gpt-oss-120b
    for model in ["llama-3.3-70b", "gpt-oss-120b"]:
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Hello, write a 3-word response."}]
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                print(f"Cerebras ({model}) Status:", resp.status_code)
                print(f"Cerebras ({model}) Response:", resp.text[:300])
        except Exception as e:
            print(f"Cerebras ({model}) Error:", e)

async def main():
    await test_gemini_primary()
    await test_gemini_secondary()
    await test_groq_llm_key()
    await test_groq_backend_key()
    await test_cerebras()

if __name__ == "__main__":
    asyncio.run(main())
