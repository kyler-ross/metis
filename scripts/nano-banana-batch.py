#!/usr/bin/env python3
"""
Nano Banana Batch Processor (Gemini Image Editing)
--------------------------------------------------
Batch processes images using Google's Gemini 2.5 Flash Image model (aka Nano Banana).
Takes a directory of images and a prompt, and applies the edit to all images.

Usage:
    python nano-banana-batch.py --input ./photos --output ./edited --prompt "Make it look like a sketch"

    # With expansion (outpainting):
    python nano-banana-batch.py --input ./photos --output ./edited --prompt "Fill background" --expand 0.25

Requirements:
    pip install google-genai pillow
    export GEMINI_API_KEY=your_key
"""

import os
import sys
import argparse
import time
import base64
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

try:
    from google import genai
    from google.genai import types
    from PIL import Image
except ImportError:
    print("Error: Missing dependencies. Please run: pip install google-genai pillow")
    raise

# Supported image extensions
VALID_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}

def setup_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise Exception("GEMINI_API_KEY environment variable not set. Please set it with: export GEMINI_API_KEY='your_key_here'")

    return genai.Client(api_key=api_key)

def expand_image(img: Image.Image, expansion_ratio: float) -> Image.Image:
    """
    Creates a larger canvas and centers the image.
    expansion_ratio: 0.25 means add 25% width/height to EACH side (total 50% larger).
    """
    width, height = img.size

    # Calculate padding for each side
    pad_w = int(width * expansion_ratio)
    pad_h = int(height * expansion_ratio)

    new_width = width + (pad_w * 2)
    new_height = height + (pad_h * 2)

    # Create new image with transparent background (RGBA)
    # If original is RGB, convert to RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    new_img = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))

    # Paste original in center
    new_img.paste(img, (pad_w, pad_h))

    return new_img

def process_image(client, image_path: Path, output_dir: Path, prompt: str, model: str, expand: float = 0.0):
    """Process a single image and save the result."""
    try:
        print(f"Processing: {image_path.name}...")

        # Load image
        try:
            img = Image.open(image_path)

            # Apply expansion if requested
            if expand > 0.0:
                print(f"  Expanding canvas by {expand*100}% on each side...")
                img = expand_image(img, expand)
                # DEBUG: Save the expanded input to verify it has transparency
                # debug_path = output_dir / f"debug_input_{image_path.name}"
                # img.save(debug_path)
                # print(f"  Debug: Saved expanded input to {debug_path}")

                # Append stronger instruction for outpainting
                prompt = f"{prompt}. The input image has a transparent border. Use outpainting to fill this transparent area seamlessly, extending the existing background pattern. Do NOT change the central subject."

        except Exception as e:
            print(f"  Failed to open/prepare image: {e}")
            return False

        # Call API
        try:
            response = client.models.generate_content(
                model=model,
                contents=[prompt, img]
            )
        except Exception as e:
            print(f"  API Error: {e}")
            return False

        # Save result
        output_filename = f"{image_path.stem}_expanded.png" if expand > 0 else f"{image_path.stem}_edited.png"
        output_path = output_dir / output_filename

        saved = False
        if hasattr(response, 'parts'):
            for part in response.parts:
                if part.inline_data:
                    try:
                        result_img = part.as_image()
                        result_img.save(output_path)
                        print(f"  Saved to: {output_path}")
                        saved = True
                        break
                    except Exception:
                         if hasattr(part.inline_data, 'data'):
                             with open(output_path, 'wb') as f:
                                 f.write(part.inline_data.data)
                             print(f"  Saved to: {output_path}")
                             saved = True
                             break

        if not saved:
            print("  No image content returned in response.")
            for part in response.parts:
                if part.text:
                    print(f"  Response text: {part.text}")
            return False

        return True

    except Exception as e:
        print(f"  Unexpected error processing {image_path.name}: {e}")
        return False

def main(ctx):
    parser = argparse.ArgumentParser(description="Batch edit images using Gemini (Nano Banana)")
    parser.add_argument("--input", "-i", required=True, help="Input directory containing images")
    parser.add_argument("--output", "-o", required=True, help="Output directory for edited images")
    parser.add_argument("--prompt", "-p", required=True, help="Editing prompt")
    parser.add_argument("--model", "-m", default="gemini-2.5-flash-image", help="Model (default: gemini-2.5-flash-image)")
    parser.add_argument("--expand", "-e", type=float, default=0.0, help="Expansion ratio (e.g. 0.25 for 25%% padding per side)")

    args = parser.parse_args(ctx.args)

    input_dir = Path(args.input)
    output_dir = Path(args.output)

    if not input_dir.exists():
        raise Exception(f"Input directory '{input_dir}' does not exist.")

    output_dir.mkdir(parents=True, exist_ok=True)
    client = setup_client()

    # Fix: Some files might not have extensions or have weird ones.
    # Let's be more permissive or check if they are files.
    image_files = [
        f for f in input_dir.iterdir()
        if f.is_file() and f.suffix.lower() in VALID_EXTENSIONS
    ]

    if not image_files:
        print(f"No valid images found in {input_dir}")
        print(f"Files found: {[f.name for f in input_dir.iterdir()]}")
        return

    print(f"Found {len(image_files)} images.")
    print(f"Model: {args.model}")
    print(f"Prompt: {args.prompt}")
    if args.expand > 0:
        print(f"Expansion: {args.expand} (outpainting)")

    print("-" * 40)

    success_count = 0
    for img_path in image_files:
        if process_image(client, img_path, output_dir, args.prompt, args.model, args.expand):
            success_count += 1
        time.sleep(1)

    print("-" * 40)
    print(f"Batch complete. {success_count}/{len(image_files)} processed.")

run(name='nano-banana-batch', mode='operational', main=main, services=['google'])
