#!/usr/bin/env python3
"""
Local OCR Script - Privacy-First Document Text Extraction

This script performs OCR (Optical Character Recognition) entirely on your local machine
using Tesseract OCR. NO data is sent to external APIs.

Use this for sensitive documents where privacy is paramount.

Dependencies:
    pip install pytesseract pillow pdf2image

System Requirements:
    - Tesseract OCR must be installed:
      macOS: brew install tesseract
      Ubuntu: sudo apt install tesseract-ocr
      Windows: https://github.com/UB-Mannheim/tesseract/wiki
    
    - For PDF support, install poppler:
      macOS: brew install poppler
      Ubuntu: sudo apt install poppler-utils
"""

import os
import sys
import glob
import argparse
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

try:
    import pytesseract
    from PIL import Image
except ImportError:
    raise RuntimeError(
        "Required packages not installed. Install with: pip install pytesseract pillow pdf2image"
    )

# PDF support (optional)
try:
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

# --- CONFIGURATION ---
DEFAULT_SOURCE_DIR = os.path.expanduser("~/Documents/ocr_input")
DEFAULT_OUTPUT_DIR = os.path.expanduser("~/Documents/ocr_output")

# Supported file extensions
IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.gif', '.heic']
PDF_EXTENSIONS = ['.pdf']

def check_tesseract() -> bool:
    """Verify Tesseract is installed and accessible."""
    try:
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract OCR found: v{version}")
        return True
    except Exception as e:
        print("❌ Error: Tesseract OCR not found.")
        print("\nInstall Tesseract:")
        print("  macOS:   brew install tesseract")
        print("  Ubuntu:  sudo apt install tesseract-ocr")
        print("  Windows: https://github.com/UB-Mannheim/tesseract/wiki")
        print(f"\nDetails: {e}")
        return False

def ocr_image(image_path: str, lang: str = 'eng') -> str:
    """
    Perform OCR on a single image file.
    
    Args:
        image_path: Path to image file
        lang: Tesseract language code (default: 'eng' for English)
        
    Returns:
        Extracted text as string
    """
    try:
        # Open and convert image to RGB (handles various formats)
        image = Image.open(image_path)
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Perform OCR
        text = pytesseract.image_to_string(image, lang=lang)
        return text.strip()
        
    except Exception as e:
        raise Exception(f"Failed to process image: {e}")

def ocr_pdf(pdf_path: str, lang: str = 'eng', dpi: int = 300) -> str:
    """
    Perform OCR on a PDF file by converting pages to images.
    
    Args:
        pdf_path: Path to PDF file
        lang: Tesseract language code
        dpi: DPI for PDF to image conversion (higher = better quality, slower)
        
    Returns:
        Extracted text as string
    """
    if not PDF_SUPPORT:
        raise Exception("PDF support not available. Install: pip install pdf2image")
    
    try:
        # Convert PDF pages to images
        print(f"   Converting PDF to images (DPI: {dpi})...")
        pages = convert_from_path(pdf_path, dpi=dpi)
        
        # OCR each page
        full_text = []
        for i, page in enumerate(pages, 1):
            print(f"   Processing page {i}/{len(pages)}...")
            text = pytesseract.image_to_string(page, lang=lang)
            full_text.append(f"--- Page {i} ---\n{text.strip()}")
        
        return "\n\n".join(full_text)
        
    except Exception as e:
        raise Exception(f"Failed to process PDF: {e}")

def process_file(file_path: str, output_dir: str, lang: str = 'eng', dpi: int = 300) -> bool:
    """
    Process a single file and save OCR output.
    
    Args:
        file_path: Path to input file
        output_dir: Directory to save output
        lang: OCR language
        dpi: DPI for PDF conversion
        
    Returns:
        True if successful, False otherwise
    """
    file_name = os.path.basename(file_path)
    file_ext = Path(file_path).suffix.lower()
    
    print(f"📄 Processing: {file_name}...")
    
    try:
        # Determine file type and process
        if file_ext in IMAGE_EXTENSIONS:
            text = ocr_image(file_path, lang=lang)
        elif file_ext in PDF_EXTENSIONS:
            text = ocr_pdf(file_path, lang=lang, dpi=dpi)
        else:
            print(f"⚠️ Unsupported file type: {file_ext}")
            return False
        
        # Check if we got any text
        if not text or len(text.strip()) < 10:
            print(f"⚠️ Warning: Very little text extracted from {file_name}")
            print(f"   Extracted: '{text[:100]}'")
        
        # Save to output file
        output_path = Path(output_dir) / (Path(file_name).stem + ".txt")
        with open(output_path, "w", encoding="utf-8") as f:
            # Add header with metadata
            f.write(f"# OCR Output: {file_name}\n")
            f.write(f"# Source: {file_path}\n")
            f.write(f"# Language: {lang}\n")
            f.write("#" + "="*70 + "\n\n")
            f.write(text)
        
        # Report statistics
        word_count = len(text.split())
        char_count = len(text)
        print(f"✅ Extracted {word_count} words ({char_count} characters)")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing {file_name}: {e}")
        return False

def get_supported_files(directory: str) -> List[str]:
    """Find all supported files in directory."""
    all_files = []
    
    # Get all supported extensions
    extensions = IMAGE_EXTENSIONS + (PDF_EXTENSIONS if PDF_SUPPORT else [])
    
    for ext in extensions:
        all_files.extend(glob.glob(os.path.join(directory, f"*{ext}")))
        all_files.extend(glob.glob(os.path.join(directory, f"*{ext.upper()}")))
    
    return sorted(all_files)

def main():
    parser = argparse.ArgumentParser(
        description="Local OCR - Extract text from images and PDFs (privacy-first, no cloud APIs)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all files in default directory
  python3 local_ocr.py
  
  # Process specific directory
  python3 local_ocr.py --source ~/Documents/scans --output ~/Documents/extracted
  
  # Process with higher quality (slower)
  python3 local_ocr.py --dpi 600
  
  # Process non-English documents
  python3 local_ocr.py --lang spa  # Spanish
        """
    )
    
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE_DIR,
        help=f"Directory containing files to OCR (default: {DEFAULT_SOURCE_DIR})"
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory to save text files (default: {DEFAULT_OUTPUT_DIR})"
    )
    parser.add_argument(
        "--lang",
        default="eng",
        help="Tesseract language code (eng, spa, fra, deu, etc. - default: eng)"
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="DPI for PDF conversion - higher is better quality but slower (default: 300)"
    )
    parser.add_argument(
        "--file",
        help="Process a single file instead of a directory"
    )
    
    args = parser.parse_args()
    
    # Check Tesseract installation
    if not check_tesseract():
        return
    
    # Check PDF support
    if not PDF_SUPPORT:
        print("⚠️ Warning: PDF support not available (install: pip install pdf2image)")
        print("   Only image files will be processed.\n")
    
    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)
    
    # Process single file or directory
    if args.file:
        if not os.path.exists(args.file):
            print(f"❌ File not found: {args.file}")
            return
        
        success = process_file(args.file, args.output, lang=args.lang, dpi=args.dpi)
        if not success:
            raise Exception(f"Failed to process file: {args.file}")
        return
    
    # Process directory
    if not os.path.exists(args.source):
        print(f"❌ Source directory not found: {args.source}")
        print(f"\nCreate it with: mkdir -p {args.source}")
        return
    
    # Find all supported files
    files = get_supported_files(args.source)
    
    if not files:
        supported = IMAGE_EXTENSIONS + (PDF_EXTENSIONS if PDF_SUPPORT else [])
        print(f"⚠️ No supported files found in {args.source}")
        print(f"   Supported formats: {', '.join(supported)}")
        return
    
    print(f"\n🔒 LOCAL OCR - Privacy-First Text Extraction")
    print(f"   Source: {args.source}")
    print(f"   Output: {args.output}")
    print(f"   Language: {args.lang}")
    print(f"   Files: {len(files)}")
    print(f"   All processing happens on your machine. No data sent externally.\n")
    
    # Process all files
    success_count = 0
    for file_path in files:
        if process_file(file_path, args.output, lang=args.lang, dpi=args.dpi):
            success_count += 1
        print()  # Blank line between files
    
    # Summary
    print("="*70)
    print(f"✅ Complete: {success_count}/{len(files)} files processed successfully")
    print(f"📁 Output directory: {args.output}")

def _main_wrapper(ctx):
    main()

if __name__ == "__main__":
    script_run(name='local-ocr', mode='operational', main=_main_wrapper, services=[])

