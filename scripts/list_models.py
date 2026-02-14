from google import genai
import os

api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not api_key:
    print("GOOGLE_API_KEY or GEMINI_API_KEY not found")
else:
    try:
        client = genai.Client(api_key=api_key)
        for m in client.models.list():
            print(m.name)
    except Exception as e:
        print(f"Error: {e}")

