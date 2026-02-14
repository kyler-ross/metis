import os
import time
import glob
import argparse
import subprocess
from pathlib import Path
from google import genai
from google.api_core import exceptions

# --- CONFIGURATION ---
# Default directories (expands to current user's Documents folder)
DEFAULT_SOURCE_DIR = os.path.expanduser("~/Documents/pdfs_to_convert")
DEFAULT_OUTPUT_DIR = os.path.expanduser("~/Documents/converted_md")

# Supported file extensions
SUPPORTED_EXTENSIONS = ['.pdf', '.png', '.heic', '.jpg', '.jpeg']

# Instructions for the AI
PROMPT = """
You are a highly accurate data conversion assistant. 
Your task is to convert the attached document or image into a Markdown file.

1. **Text Content**: Transcribe all text content exactly as it appears (literal conversion). Use appropriate markdown headers (#, ##, ###) to reflect the document structure.
2. **Visual Content**: For any charts, graphs, diagrams, or images:
   - Do NOT just say "[Image of a chart]".
   - **Describe** the visual content in detail.
   - If it is a chart or table, **recreate it** as a Markdown table or a data list so the data is preserved.
   - If it is a trend line or visual graphic, describe the trend (e.g., "Line chart showing growth from 10% in Q1 to 50% in Q4").
   - **CRITICAL**: Provide BOTH:
     a) A literal translation/description of what you see
     b) An editorial interpretation explaining what the image represents, what insights it conveys, and what it tells us about the content
   - Your goal is that a reader of the markdown file gets 99% of the information they would get from looking at the original file.
3. **Formatting**: Ensure the final output is clean, readable Markdown.
"""

def get_api_key():
    """Gets the Gemini API key from environment or .zshrc."""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    # If not in environment, try to load from .zshrc
    if not api_key:
        try:
            # Source .zshrc and get the API key
            result = subprocess.run(
                ['zsh', '-c', 'source ~/.zshrc && echo $GOOGLE_API_KEY'],
                capture_output=True,
                text=True,
                timeout=5
            )
            api_key = result.stdout.strip()

            if not api_key:
                print("❌ Error: GOOGLE_API_KEY environment variable not found.")
                print("\nTo get a Google API key:")
                print("  1. Visit: https://aistudio.google.com/app/api-keys")
                print("  2. Create or copy your API key")
                print("  3. Add it to your ~/.zshrc file:")
                print("     echo 'export GOOGLE_API_KEY=\"your_key_here\"' >> ~/.zshrc")
                print("     source ~/.zshrc")
                print("\n  Or contact Kyler on Slack if you need help getting a key.")
                return None
        except Exception as e:
            print(f"❌ Error loading API key from .zshrc: {e}")
            print("\nTo get a Google API key:")
            print("  1. Visit: https://aistudio.google.com/app/api-keys")
            print("  2. Create or copy your API key")
            print("  3. Export it: export GOOGLE_API_KEY='your_key_here'")
            print("\n  Or contact Kyler on Slack if you need help getting a key.")
            return None

    return api_key


def create_client():
    """Creates and returns a Gemini API client."""
    api_key = get_api_key()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

def get_available_model(client, preferred_model):
    """Checks if the preferred model is available, otherwise suggests alternatives."""
    try:
        available_models = [m.name for m in client.models.list()]

        # Normalize names for comparison (remove 'models/' prefix if present)
        cleaned_available = [m.replace('models/', '') for m in available_models]

        if preferred_model in cleaned_available:
            return preferred_model

        # Try to find a close match or a good default
        print(f"⚠️ Model '{preferred_model}' not found. Available models:")
        for m in cleaned_available:
            print(f"  - {m}")

        # Fallbacks in order of preference
        fallbacks = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-exp",
            "gemini-flash-latest",
            "gemini-1.5-flash",
            "gemini-1.5-flash-001",
            "gemini-1.5-pro",
            "gemini-1.5-pro-001",
            "gemini-pro"
        ]
        for fb in fallbacks:
            if fb in cleaned_available:
                print(f"🔄 Switching to available model: {fb}")
                return fb

        # If no exact match, try to find one that *contains* flash
        for m in cleaned_available:
            if "flash" in m and "latest" in m:
                print(f"🔄 Switching to available model: {m}")
                return m

        return preferred_model  # Return original and let it fail if no fallback found

    except Exception as e:
        print(f"⚠️ Could not list models to verify: {e}")
        return preferred_model

def convert_file(client, file_path, output_dir, model_name="gemini-1.5-flash"):
    """Uploads a file (PDF, PNG, HEIC, etc.) and requests a Markdown conversion."""
    file_name = os.path.basename(file_path)
    print(f"📄 Processing: {file_name}...")

    try:
        # 1. Upload the file
        print(f"   Uploading to Gemini...")
        sample_file = client.files.upload(file=file_path)

        # Wait for file to be active
        while sample_file.state.name == "PROCESSING":
            print("   Waiting for file processing...")
            time.sleep(2)
            sample_file = client.files.get(name=sample_file.name)

        if sample_file.state.name == "FAILED":
            print(f"❌ Failed to process file: {sample_file.state.name}")
            return

        # 2. Generate content
        print(f"   Generating Markdown...")
        response = client.models.generate_content(
            model=model_name,
            contents=[PROMPT, sample_file]
        )

        # 3. Save to file
        output_path = Path(output_dir) / (Path(file_name).stem + ".md")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(response.text)

        print(f"✅ Saved to: {output_path}")

        # Cleanup: Delete the file from Gemini to avoid clutter
        client.files.delete(name=sample_file.name)

    except Exception as e:
        print(f"❌ Error converting {file_name}: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description="Bulk convert documents/images to Markdown using Gemini AI.")
    parser.add_argument("--source", default=DEFAULT_SOURCE_DIR, help="Directory containing files to convert")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR, help="Directory to save Markdown files")
    parser.add_argument("--model", default="gemini-1.5-flash", help="Gemini model to use (gemini-1.5-flash or gemini-1.5-pro)")

    args = parser.parse_args()

    client = create_client()
    if not client:
        return

    # Select model
    model_name = get_available_model(client, args.model)

    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)

    # Find all supported files
    all_files = []
    for ext in SUPPORTED_EXTENSIONS:
        all_files.extend(glob.glob(os.path.join(args.source, f"*{ext}")))
        all_files.extend(glob.glob(os.path.join(args.source, f"*{ext.upper()}")))

    if not all_files:
        print(f"⚠️ No supported files found in {args.source}")
        print(f"   Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}")
        return

    print(f"Found {len(all_files)} file(s) to convert.")

    for file_path in all_files:
        convert_file(client, file_path, args.output, model_name)
        # Sleep briefly to avoid hitting rate limits too hard if on free tier
        time.sleep(1)

if __name__ == "__main__":
    main()

