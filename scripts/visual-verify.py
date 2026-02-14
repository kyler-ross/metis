#!/usr/bin/env python3
"""
Visual Verification Script for Ralph

Captures screenshots and uses Gemini vision to verify UI criteria.
Designed to close "the last 10%" by actually looking at the UI.

Usage:
    python3 visual-verify.py --prompt tasks/active/PROMPT.md
    python3 visual-verify.py --prompt PROMPT.md --output-dir .agent/screenshots
"""

import os
import sys
import re
import json
import argparse
import subprocess
from pathlib import Path
from datetime import datetime

from google import genai


# --- CONFIGURATION ---
DEFAULT_MODEL = "gemini-2.0-flash"
DEFAULT_OUTPUT_DIR = ".agent/screenshots"
SCRATCHPAD_FILE = ".agent/visual-verification.md"

# Verification prompt for Gemini
VERIFICATION_PROMPT = """
You are a UI verification assistant. Your task is to objectively verify whether the UI in this screenshot meets specific criteria.

## Criteria to Verify:
{criteria}

## Instructions:
1. Examine the screenshot carefully
2. For EACH criterion listed above, determine:
   - **PASS**: The criterion is clearly and unambiguously met
   - **FAIL**: The criterion is not met (provide specific observation of what's wrong)
   - **UNCLEAR**: Cannot determine from this screenshot (explain why)

3. Be STRICT:
   - If something is "almost right" but not exactly correct, mark FAIL
   - If an element should be visible but you can't find it, mark FAIL
   - Only mark PASS if you are certain the criterion is met

4. Focus on OBSERVABLE facts:
   - What elements are visible?
   - What text is displayed?
   - What is the layout/alignment?
   - Are there any error messages or broken UI?

## Output Format:
Return ONLY valid JSON in this exact format:
```json
{
  "overall": "PASS" or "FAIL",
  "criteria": [
    {
      "name": "criterion text here",
      "result": "PASS" or "FAIL" or "UNCLEAR",
      "observation": "specific observation about what you see"
    }
  ],
  "summary": "One sentence summary of verification result"
}
```

Return ONLY the JSON object, no additional text or markdown formatting.
"""


def get_api_key():
    """Gets the Gemini API key from environment or .zshrc."""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    if not api_key:
        # Try to load from .zshrc
        try:
            result = subprocess.run(
                ['zsh', '-c', 'source ~/.zshrc && echo $GOOGLE_API_KEY'],
                capture_output=True,
                text=True,
                timeout=5
            )
            api_key = result.stdout.strip()
        except Exception:
            pass

    if not api_key:
        print("❌ Error: GOOGLE_API_KEY not found.")
        print("\nTo get a Google API key:")
        print("  1. Visit: https://aistudio.google.com/app/api-keys")
        print("  2. Create or copy your API key")
        print("  3. Export it: export GOOGLE_API_KEY='your_key_here'")
        return None

    return api_key


def create_client():
    """Creates and returns a Gemini API client."""
    api_key = get_api_key()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def get_available_model(client, preferred_model):
    """Check if preferred model is available, otherwise find fallback."""
    try:
        available_models = [
            m.name.replace('models/', '')
            for m in client.models.list()
        ]

        if preferred_model in available_models:
            return preferred_model

        # Fallbacks
        fallbacks = [
            "gemini-2.5-flash-preview-04-17",
            "gemini-2.0-flash",
            "gemini-2.0-flash-exp",
            "gemini-1.5-flash"
        ]
        for fb in fallbacks:
            if fb in available_models:
                print(f"🔄 Using model: {fb}")
                return fb

        return preferred_model

    except Exception as e:
        print(f"⚠️ Could not verify model: {e}")
        return preferred_model


def capture_screenshot(output_path):
    """Capture a screenshot using macOS screencapture."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # -x = no sound, captures entire screen
        result = subprocess.run(
            ['screencapture', '-x', str(output_path)],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            print(f"❌ screencapture failed: {result.stderr}")
            return None

        if output_path.exists():
            print(f"📸 Screenshot saved: {output_path}")
            return output_path
        else:
            print("❌ Screenshot file not created")
            return None

    except FileNotFoundError:
        print("❌ screencapture not found (macOS only)")
        return None
    except subprocess.TimeoutExpired:
        print("❌ screencapture timed out")
        return None
    except Exception as e:
        print(f"❌ Error capturing screenshot: {e}")
        return None


def parse_visual_criteria(prompt_file):
    """Parse visual verification criteria from PROMPT.md."""
    prompt_path = Path(prompt_file)

    if not prompt_path.exists():
        print(f"❌ Prompt file not found: {prompt_file}")
        return []

    content = prompt_path.read_text()

    # Find the Visual Verification Criteria section
    pattern = r'## Visual Verification Criteria\s*(.*?)(?=\n## |\n---|\Z)'
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        print("⚠️ No '## Visual Verification Criteria' section found in PROMPT.md")
        return []

    section = match.group(1).strip()

    # Parse screenshot blocks
    screenshots = []
    screenshot_pattern = r'### Screenshot \d+:\s*(.+?)\n(.*?)(?=### Screenshot|\Z)'

    for match in re.finditer(screenshot_pattern, section, re.DOTALL):
        name = match.group(1).strip()
        block = match.group(2).strip()

        # Extract criteria (lines starting with - [ ])
        criteria = []
        for line in block.split('\n'):
            # Match checkbox items
            checkbox_match = re.match(r'\s*-\s*\[[ x]\]\s*(.+)', line)
            if checkbox_match:
                criteria.append(checkbox_match.group(1).strip())

        if criteria:
            screenshots.append({
                'name': name,
                'criteria': criteria
            })

    return screenshots


def verify_screenshot(client, screenshot_path, criteria_list, model_name):
    """Send screenshot to Gemini for verification."""
    try:
        # Upload the screenshot
        print(f"📤 Uploading screenshot to Gemini...")
        sample_file = client.files.upload(file=str(screenshot_path))

        # Wait for processing
        import time
        while sample_file.state.name == "PROCESSING":
            time.sleep(1)
            sample_file = client.files.get(name=sample_file.name)

        if sample_file.state.name == "FAILED":
            return {"overall": "FAIL", "criteria": [], "summary": "Failed to process screenshot"}

        # Format criteria for prompt
        criteria_text = "\n".join(f"- {c}" for c in criteria_list)
        prompt = VERIFICATION_PROMPT.format(criteria=criteria_text)

        # Generate verification
        print(f"🔍 Analyzing with {model_name}...")
        response = client.models.generate_content(
            model=model_name,
            contents=[prompt, sample_file]
        )

        # Cleanup uploaded file
        client.files.delete(name=sample_file.name)

        # Parse JSON response
        response_text = response.text.strip()

        # Handle markdown code blocks
        if response_text.startswith('```'):
            # Extract JSON from code block
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)

        result = json.loads(response_text)
        return result

    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse Gemini response as JSON: {e}")
        print(f"Response was: {response.text[:500]}...")
        return {
            "overall": "FAIL",
            "criteria": [],
            "summary": f"Failed to parse verification response: {e}"
        }
    except Exception as e:
        print(f"❌ Error during verification: {e}")
        return {
            "overall": "FAIL",
            "criteria": [],
            "summary": f"Verification error: {e}"
        }


def write_results(results, output_file):
    """Write verification results to scratchpad file."""
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().isoformat()

    lines = [
        "# Visual Verification Results",
        f"**Run**: {timestamp}",
        ""
    ]

    overall_pass = True

    for result in results:
        screenshot_name = result.get('screenshot_name', 'Unknown')
        verification = result.get('verification', {})
        screenshot_path = result.get('screenshot_path', '')

        overall = verification.get('overall', 'FAIL')
        if overall != 'PASS':
            overall_pass = False

        lines.append(f"## Screenshot: {screenshot_name}")
        lines.append(f"**File**: `{screenshot_path}`")
        lines.append(f"**Result**: {overall}")
        lines.append("")

        criteria = verification.get('criteria', [])
        if criteria:
            lines.append("| Criterion | Result | Observation |")
            lines.append("|-----------|--------|-------------|")
            for c in criteria:
                name = c.get('name', '')[:50]
                res = c.get('result', 'UNCLEAR')
                obs = c.get('observation', '')[:80].replace('|', '\\|')
                lines.append(f"| {name} | {res} | {obs} |")
            lines.append("")

        summary = verification.get('summary', '')
        if summary:
            lines.append(f"**Summary**: {summary}")
            lines.append("")

    # Overall result
    lines.append("---")
    lines.append(f"## Overall: {'PASS ✅' if overall_pass else 'FAIL ❌'}")

    if not overall_pass:
        lines.append("")
        lines.append("**Action Required**: Fix the failing criteria and re-run verification.")

    output_path.write_text('\n'.join(lines))
    print(f"📝 Results written to: {output_path}")

    return overall_pass


def main():
    parser = argparse.ArgumentParser(
        description='Visual verification for Ralph using Gemini vision'
    )
    parser.add_argument(
        '--prompt', '-p',
        default='tasks/active/PROMPT.md',
        help='Path to PROMPT.md file with visual criteria'
    )
    parser.add_argument(
        '--output-dir', '-o',
        default=DEFAULT_OUTPUT_DIR,
        help='Directory to save screenshots'
    )
    parser.add_argument(
        '--model', '-m',
        default=DEFAULT_MODEL,
        help='Gemini model to use'
    )
    parser.add_argument(
        '--scratchpad', '-s',
        default=SCRATCHPAD_FILE,
        help='Path to write results'
    )
    parser.add_argument(
        '--no-prompt',
        action='store_true',
        help='Skip user prompts (auto-capture immediately)'
    )

    args = parser.parse_args()

    print("🔍 Visual Verification for Ralph")
    print("=" * 40)

    # Create client
    client = create_client()
    if not client:
        raise RuntimeError("Failed to create Gemini client. Set GOOGLE_API_KEY or GEMINI_API_KEY.")

    # Get available model
    model_name = get_available_model(client, args.model)
    print(f"🤖 Using model: {model_name}")

    # Parse criteria from PROMPT.md
    print(f"\n📄 Parsing criteria from: {args.prompt}")
    screenshots = parse_visual_criteria(args.prompt)

    if not screenshots:
        raise RuntimeError(
            "No visual verification criteria found. "
            "Add a '## Visual Verification Criteria' section to your PROMPT.md"
        )

    print(f"Found {len(screenshots)} screenshot(s) to verify")

    # Process each screenshot
    results = []
    output_dir = Path(args.output_dir)

    for i, screenshot_config in enumerate(screenshots, 1):
        name = screenshot_config['name']
        criteria = screenshot_config['criteria']

        print(f"\n--- Screenshot {i}: {name} ---")
        print(f"Criteria to verify: {len(criteria)}")

        # Capture screenshot
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        screenshot_path = output_dir / f"screenshot_{i}_{timestamp}.png"

        if not args.no_prompt:
            print("\n⏳ Prepare the UI for screenshot, then press Enter...")
            input()

        captured_path = capture_screenshot(screenshot_path)
        if not captured_path:
            results.append({
                'screenshot_name': name,
                'screenshot_path': str(screenshot_path),
                'verification': {
                    'overall': 'FAIL',
                    'criteria': [],
                    'summary': 'Failed to capture screenshot'
                }
            })
            continue

        # Verify with Gemini
        verification = verify_screenshot(client, captured_path, criteria, model_name)

        results.append({
            'screenshot_name': name,
            'screenshot_path': str(captured_path),
            'verification': verification
        })

        # Print result
        overall = verification.get('overall', 'FAIL')
        print(f"\n{'✅ PASS' if overall == 'PASS' else '❌ FAIL'}: {name}")
        for c in verification.get('criteria', []):
            icon = '✅' if c['result'] == 'PASS' else '❌' if c['result'] == 'FAIL' else '❓'
            print(f"  {icon} {c['name'][:60]}")

    # Write results to scratchpad
    print("\n" + "=" * 40)
    all_passed = write_results(results, args.scratchpad)

    # Final summary
    if all_passed:
        print("\n🎉 All visual criteria PASSED!")
        print("You may now signal task completion.")
    else:
        print("\n⚠️ Some visual criteria FAILED.")
        print("Fix the issues and re-run verification.")
        raise RuntimeError("Some visual criteria FAILED. Fix the issues and re-run verification.")


if __name__ == '__main__':
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
        from script_runner import run as _run
        _run(name='visual-verify', mode='operational', main=lambda ctx: main(), services=['google'])
    except ImportError:
        main()
