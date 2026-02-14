#!/usr/bin/env python3
"""
Local OCR + TOON Converter - Privacy-First Structured Data Extraction

This script performs OCR on your local machine AND converts structured data (CSV, JSON, tables)
into TOON (Token-Oriented Object Notation) format for optimal LLM token efficiency.

TOON Format Benefits:
- 40% fewer tokens than JSON for structured data
- Human-readable, CSV-like compactness
- Perfect for spreadsheets, tables, and arrays

Privacy Guarantee: ALL processing happens locally. NO data sent to external APIs.

Dependencies:
    pip install pytesseract pillow pdf2image pandas camelot-py opencv-python

System Requirements:
    - Tesseract OCR: brew install tesseract
    - Poppler (PDF support): brew install poppler
    - Ghostscript (for camelot): brew install ghostscript
"""

import os
import sys
import glob
import json
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Union

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

try:
    import pytesseract
    from PIL import Image
    import pandas as pd
except ImportError:
    raise RuntimeError(
        "Required packages not installed. Install with: pip install pytesseract pillow pdf2image pandas"
    )

# Optional dependencies for advanced table extraction
try:
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    
try:
    import camelot
    CAMELOT_SUPPORT = True
except ImportError:
    CAMELOT_SUPPORT = False

# --- CONFIGURATION ---
DEFAULT_SOURCE_DIR = os.path.expanduser("~/Documents/ocr_input")
DEFAULT_OUTPUT_DIR = os.path.expanduser("~/Documents/ocr_output")

IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.gif', '.heic']
PDF_EXTENSIONS = ['.pdf']
STRUCTURED_EXTENSIONS = ['.csv', '.json', '.jsonl']


# =============================================================================
# TOON FORMAT ENCODER
# =============================================================================

class TOONEncoder:
    """
    Converts Python data structures to TOON (Token-Oriented Object Notation) format.
    
    TOON Features:
    - Tabular arrays: items[2]{name,qty,price}: Alice,5,9.99
    - Inline primitives: tags[3]: admin,ops,dev
    - Minimal syntax with indentation
    - 40% fewer tokens than JSON
    """
    
    def __init__(self, indent_size: int = 2):
        self.indent_size = indent_size
    
    def encode(self, data: Any, indent: int = 0) -> str:
        """Convert Python data to TOON format."""
        if isinstance(data, dict):
            return self._encode_object(data, indent)
        elif isinstance(data, list):
            return self._encode_array(data, indent)
        else:
            return self._encode_primitive(data)
    
    def _encode_primitive(self, value: Any) -> str:
        """Encode primitives (string, number, bool, null)."""
        if value is None:
            return "null"
        elif isinstance(value, bool):
            return "true" if value else "false"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, str):
            # Quote if contains comma, newline, or starts with special chars
            if ',' in value or '\n' in value or value.startswith(('-', '[', '{')):
                return f'"{value}"'
            return value
        else:
            return str(value)
    
    def _encode_object(self, obj: Dict, indent: int) -> str:
        """Encode object (dict) with indentation."""
        if not obj:
            return "{}"
        
        lines = []
        indent_str = ' ' * (indent * self.indent_size)
        
        for key, value in obj.items():
            if isinstance(value, dict):
                lines.append(f"{indent_str}{key}:")
                lines.append(self._encode_object(value, indent + 1))
            elif isinstance(value, list):
                lines.append(f"{indent_str}{key}{self._get_array_header(value)}:")
                lines.append(self._encode_array(value, indent + 1))
            else:
                prim = self._encode_primitive(value)
                lines.append(f"{indent_str}{key}: {prim}")
        
        return '\n'.join(lines)
    
    def _encode_array(self, arr: List, indent: int) -> str:
        """Encode array - tabular if uniform objects, inline if primitives, list otherwise."""
        if not arr:
            return ""  # Empty array already handled by header
        
        # Check if all primitives
        if all(not isinstance(x, (dict, list)) for x in arr):
            return self._encode_primitive_array(arr, indent)
        
        # Check if uniform objects (same keys, all primitive values)
        if self._is_tabular_array(arr):
            return self._encode_tabular_array(arr, indent)
        
        # Fall back to list format
        return self._encode_list_array(arr, indent)
    
    def _is_tabular_array(self, arr: List) -> bool:
        """Check if array can be encoded as table (uniform objects with primitive values)."""
        if not arr or not isinstance(arr[0], dict):
            return False
        
        # Get field set from first object
        first_keys = set(arr[0].keys())
        
        for obj in arr:
            if not isinstance(obj, dict):
                return False
            if set(obj.keys()) != first_keys:
                return False
            # Check all values are primitives
            for v in obj.values():
                if isinstance(v, (dict, list)):
                    return False
        
        return True
    
    def _encode_primitive_array(self, arr: List, indent: int) -> str:
        """Encode inline primitive array."""
        indent_str = ' ' * (indent * self.indent_size)
        values = [self._encode_primitive(v) for v in arr]
        # Ensure all values are strings before joining
        return f"{indent_str}{','.join(str(v) for v in values)}"
    
    def _encode_tabular_array(self, arr: List[Dict], indent: int) -> str:
        """Encode uniform array of objects as table."""
        if not arr:
            return ""
        
        indent_str = ' ' * (indent * self.indent_size)
        
        # Get field names from first object
        fields = list(arr[0].keys())
        
        lines = []
        for obj in arr:
            values = [self._encode_primitive(obj[k]) for k in fields]
            # Ensure all values are strings before joining
            lines.append(f"{indent_str}{','.join(str(v) for v in values)}")
        
        return '\n'.join(lines)
    
    def _encode_list_array(self, arr: List, indent: int) -> str:
        """Encode mixed/nested array as list."""
        indent_str = ' ' * (indent * self.indent_size)
        lines = []
        
        for item in arr:
            if isinstance(item, dict):
                lines.append(f"{indent_str}-")
                lines.append(self._encode_object(item, indent + 1))
            elif isinstance(item, list):
                header = self._get_array_header(item)
                lines.append(f"{indent_str}- {header}:")
                lines.append(self._encode_array(item, indent + 1))
            else:
                prim = self._encode_primitive(item)
                lines.append(f"{indent_str}- {prim}")
        
        return '\n'.join(lines)
    
    def _get_array_header(self, arr: List) -> str:
        """Generate array header: [length] and optional {fields} for tables."""
        length = len(arr)
        
        if self._is_tabular_array(arr) and arr:
            # Convert keys to strings (they might be integers from DataFrame columns)
            fields = ','.join(str(k) for k in arr[0].keys())
            return f"[{length}]{{{fields}}}"
        
        return f"[{length}]"


# =============================================================================
# FILE PROCESSORS
# =============================================================================

def check_tesseract() -> bool:
    """Verify Tesseract is installed."""
    try:
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract OCR found: v{version}")
        return True
    except Exception as e:
        print("❌ Error: Tesseract OCR not found.")
        print("\nInstall Tesseract:")
        print("  macOS:   brew install tesseract")
        print("  Ubuntu:  sudo apt install tesseract-ocr")
        print(f"\nDetails: {e}")
        return False


def process_csv(file_path: str, output_dir: str, output_format: str = 'toon') -> bool:
    """Process CSV file and convert to TOON or JSON."""
    file_name = os.path.basename(file_path)
    print(f"📊 Processing CSV: {file_name}...")
    
    try:
        # Try reading CSV with different strategies
        df = None
        
        # Strategy 1: Standard read
        try:
            df = pd.read_csv(file_path)
        except Exception as e1:
            # Strategy 2: Use Python engine (more forgiving)
            try:
                df = pd.read_csv(file_path, engine='python', on_bad_lines='warn')
            except Exception as e2:
                # Strategy 3: Try with different encoding and skip bad lines
                try:
                    df = pd.read_csv(file_path, encoding='utf-8', engine='python', 
                                    on_bad_lines='skip', encoding_errors='ignore')
                except Exception as e3:
                    # Strategy 4: Last resort - try latin-1 encoding
                    df = pd.read_csv(file_path, encoding='latin-1', engine='python', 
                                    on_bad_lines='skip')
        
        if df is None or len(df) == 0:
            print(f"❌ Could not read CSV or file is empty: {file_name}")
            return False
        
        # Convert to dict
        data = {
            'source': file_path,
            'rows': len(df),
            'columns': list(df.columns),
            'data': df.to_dict('records')
        }
        
        # Encode
        if output_format == 'toon':
            encoder = TOONEncoder()
            content = encoder.encode(data)
            ext = '.toon'
        else:
            content = json.dumps(data, indent=2)
            ext = '.json'
        
        # Save
        output_path = Path(output_dir) / (Path(file_name).stem + ext)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# Converted from: {file_name}\n")
            f.write(f"# Rows: {len(df)} | Columns: {len(df.columns)}\n")
            f.write("#" + "="*70 + "\n\n")
            f.write(content)
        
        print(f"✅ Converted {len(df)} rows × {len(df.columns)} columns")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing CSV {file_name}: {e}")
        return False


def process_json(file_path: str, output_dir: str, output_format: str = 'toon') -> bool:
    """Process JSON file and convert to TOON."""
    file_name = os.path.basename(file_path)
    print(f"📋 Processing JSON: {file_name}...")
    
    try:
        # Read JSON
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Encode
        if output_format == 'toon':
            encoder = TOONEncoder()
            content = encoder.encode(data)
            ext = '.toon'
        else:
            content = json.dumps(data, indent=2)
            ext = '.json'
        
        # Save
        output_path = Path(output_dir) / (Path(file_name).stem + ext)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# Converted from: {file_name}\n")
            f.write("#" + "="*70 + "\n\n")
            f.write(content)
        
        print(f"✅ Converted JSON structure")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing JSON {file_name}: {e}")
        return False


def is_table_mostly_empty(df) -> bool:
    """Check if a dataframe is mostly empty or whitespace."""
    total_cells = df.size
    empty_cells = 0
    
    for val in df.values.flatten():
        if pd.isna(val) or (isinstance(val, str) and val.strip() == ''):
            empty_cells += 1
    
    # If more than 70% empty, consider it a failed extraction
    return (empty_cells / total_cells) > 0.7


def process_pdf_ocr(file_path: str, output_dir: str, lang: str = 'eng', dpi: int = 300) -> bool:
    """Extract plain text from PDF using OCR."""
    if not PDF_SUPPORT:
        print("⚠️ PDF support not available. Install: pip install pdf2image")
        print("   Also requires poppler: brew install poppler")
        return False
    
    file_name = os.path.basename(file_path)
    print(f"📄 OCR processing PDF: {file_name}...")
    
    try:
        # Convert PDF to images
        images = convert_from_path(file_path, dpi=dpi)
        print(f"   Converting {len(images)} page(s) to text...")
        
        # OCR each page
        all_text = []
        for i, image in enumerate(images, 1):
            text = pytesseract.image_to_string(image, lang=lang)
            if text.strip():
                all_text.append(f"# Page {i}\n{text}")
        
        if not all_text:
            print(f"⚠️ No text extracted from {file_name}")
            return False
        
        # Save
        output_path = Path(output_dir) / (Path(file_name).stem + '_ocr.txt')
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# OCR Output: {file_name}\n")
            f.write(f"# Source: {file_path}\n")
            f.write(f"# Language: {lang}\n")
            f.write(f"# Pages: {len(images)}\n")
            f.write("#" + "="*70 + "\n\n")
            f.write('\n\n'.join(all_text))
        
        print(f"✅ Extracted text from {len(images)} page(s)")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing PDF {file_name}: {e}")
        return False


def process_pdf_tables(file_path: str, output_dir: str, output_format: str = 'toon') -> bool:
    """Extract tables from PDF using Camelot, fallback to OCR if tables are empty."""
    if not CAMELOT_SUPPORT:
        print("⚠️ Camelot not installed. Install: pip install camelot-py[cv]")
        return False
    
    file_name = os.path.basename(file_path)
    print(f"📊 Extracting tables from PDF: {file_name}...")
    
    try:
        # Extract tables
        tables = camelot.read_pdf(file_path, pages='all', flavor='lattice')
        
        if len(tables) == 0:
            print(f"⚠️ No tables found, trying OCR fallback...")
            return process_pdf_ocr(file_path, output_dir)
        
        print(f"   Found {len(tables)} table(s)")
        
        # Process each table and check if they're empty
        all_tables = []
        empty_count = 0
        
        for i, table in enumerate(tables, 1):
            df = table.df
            
            # Check if table is mostly empty
            if is_table_mostly_empty(df):
                empty_count += 1
                print(f"   Table {i}: {len(df)} rows × {len(df.columns)} cols (accuracy: {table.accuracy:.0f}%) - EMPTY")
                continue
            
            # Use first row as header if it looks like one
            if df.iloc[0].apply(lambda x: isinstance(x, str) and x.isupper()).any():
                df.columns = df.iloc[0]
                df = df[1:]
            
            table_data = {
                'table_number': i,
                'page': table.page,
                'accuracy': round(table.accuracy, 2),
                'rows': len(df),
                'columns': len(df.columns),
                'data': df.to_dict('records')
            }
            all_tables.append(table_data)
            print(f"   Table {i}: {len(df)} rows × {len(df.columns)} cols (accuracy: {table.accuracy:.0f}%)")
        
        # If all tables were empty, fall back to OCR
        if empty_count == len(tables):
            print(f"⚠️ All tables are empty, trying OCR fallback...")
            return process_pdf_ocr(file_path, output_dir)
        
        # If no valid tables extracted, fall back to OCR
        if not all_tables:
            print(f"⚠️ No valid tables extracted, trying OCR fallback...")
            return process_pdf_ocr(file_path, output_dir)
        
        # Encode all tables
        output_data = {
            'source': file_name,
            'tables': all_tables
        }
        
        if output_format == 'toon':
            encoder = TOONEncoder()
            content = encoder.encode(output_data)
            ext = '.toon'
        else:
            content = json.dumps(output_data, indent=2)
            ext = '.json'
        
        # Save
        output_path = Path(output_dir) / (Path(file_name).stem + '_tables' + ext)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# Extracted tables from: {file_name}\n")
            f.write(f"# Tables: {len(all_tables)}\n")
            f.write("#" + "="*70 + "\n\n")
            f.write(content)
        
        print(f"✅ Extracted {len(all_tables)} tables ({empty_count} empty skipped)")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error extracting tables from {file_name}: {e}")
        print("   Trying OCR fallback...")
        return process_pdf_ocr(file_path, output_dir)


def process_file(file_path: str, output_dir: str, output_format: str = 'toon', 
                extract_tables: bool = True, force_ocr: bool = False) -> bool:
    """Process a single file based on type."""
    file_ext = Path(file_path).suffix.lower()
    
    # Structured data (no OCR needed)
    if file_ext == '.csv':
        return process_csv(file_path, output_dir, output_format)
    elif file_ext in ['.json', '.jsonl']:
        return process_json(file_path, output_dir, output_format)
    
    # PDF processing
    elif file_ext == '.pdf':
        if force_ocr:
            # Skip table extraction, go straight to OCR
            return process_pdf_ocr(file_path, output_dir)
        elif extract_tables and CAMELOT_SUPPORT:
            # Try table extraction first, fallback to OCR if needed
            return process_pdf_tables(file_path, output_dir, output_format)
        else:
            # Plain OCR fallback
            return process_pdf_ocr(file_path, output_dir)
    
    # Images - plain OCR
    elif file_ext in IMAGE_EXTENSIONS:
        file_name = os.path.basename(file_path)
        print(f"🖼️  OCR processing image: {file_name}...")
        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            
            output_path = Path(output_dir) / (Path(file_name).stem + '_ocr.txt')
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(f"# OCR Output: {file_name}\n")
                f.write(f"# Source: {file_path}\n")
                f.write("#" + "="*70 + "\n\n")
                f.write(text)
            
            print(f"✅ Extracted text from image")
            print(f"   Saved to: {output_path}")
            return True
        except Exception as e:
            print(f"❌ Error processing image {file_name}: {e}")
            return False
    
    else:
        print(f"⚠️ Unsupported file type: {file_ext}")
        return False


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Local OCR + TOON Converter - Privacy-first structured data extraction",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert CSV to TOON
  python3 local_ocr_toon.py --file data.csv
  
  # Extract tables from PDF to TOON
  python3 local_ocr_toon.py --file report.pdf
  
  # Convert JSON to TOON
  python3 local_ocr_toon.py --file data.json
  
  # Process all files in directory
  python3 local_ocr_toon.py --source ~/Documents/data --output ~/Documents/toon
  
  # Output as JSON instead of TOON
  python3 local_ocr_toon.py --file data.csv --format json
        """
    )
    
    parser.add_argument("--source", default=DEFAULT_SOURCE_DIR,
                       help=f"Directory containing files (default: {DEFAULT_SOURCE_DIR})")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_DIR,
                       help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--file", help="Process single file")
    parser.add_argument("--format", choices=['toon', 'json'], default='toon',
                       help="Output format (default: toon)")
    parser.add_argument("--no-tables", action='store_true',
                       help="Skip table extraction from PDFs")
    parser.add_argument("--force-ocr", action='store_true',
                       help="Force OCR text extraction even for PDFs (skip table detection)")
    
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output, exist_ok=True)
    
    # Single file mode
    if args.file:
        if not os.path.exists(args.file):
            print(f"❌ File not found: {args.file}")
            return
        
        print(f"\n🔒 LOCAL PROCESSING - Privacy-First Conversion")
        print(f"   Output format: {args.format.upper()}")
        if args.force_ocr:
            print(f"   Mode: OCR (text extraction)")
        print(f"   All processing happens on your machine.\n")
        
        success = process_file(args.file, args.output, args.format,
                              extract_tables=not args.no_tables,
                              force_ocr=args.force_ocr)
        if not success:
            raise Exception(f"Failed to process file: {args.file}")
        return
    
    # Directory mode
    if not os.path.exists(args.source):
        print(f"❌ Source directory not found: {args.source}")
        return
    
    # Find all supported files
    all_files = []
    supported_extensions = STRUCTURED_EXTENSIONS + PDF_EXTENSIONS
    if args.force_ocr or not CAMELOT_SUPPORT:
        # Include images if doing OCR
        supported_extensions += IMAGE_EXTENSIONS
    
    for ext in supported_extensions:
        all_files.extend(glob.glob(os.path.join(args.source, f"*{ext}")))
        all_files.extend(glob.glob(os.path.join(args.source, f"*{ext.upper()}")))
    
    if not all_files:
        print(f"⚠️ No supported files found in {args.source}")
        print(f"   Supported: {', '.join(supported_extensions)}")
        return
    
    print(f"\n🔒 LOCAL PROCESSING - Privacy-First Conversion")
    print(f"   Source: {args.source}")
    print(f"   Output: {args.output}")
    print(f"   Format: {args.format.upper()}")
    print(f"   Files: {len(all_files)}")
    print(f"   All processing happens on your machine.\n")
    
    # Process all files
    success_count = 0
    for file_path in all_files:
        if process_file(file_path, args.output, args.format, 
                       extract_tables=not args.no_tables,
                       force_ocr=args.force_ocr):
            success_count += 1
        print()  # Blank line between files
    
    # Summary
    print("="*70)
    print(f"✅ Complete: {success_count}/{len(all_files)} files processed")
    print(f"📁 Output directory: {args.output}")
    print(f"\n💡 TOON format uses ~40% fewer tokens than JSON for structured data!")


def _main_wrapper(ctx):
    main()

if __name__ == "__main__":
    script_run(name='local-ocr-toon', mode='operational', main=_main_wrapper, services=[])

