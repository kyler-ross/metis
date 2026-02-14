#!/usr/bin/env python3
"""
Backfill Transcript Metadata

Processes all existing transcripts with Gemini to add:
- Tags and topics
- Name corrections (e.g., "Derat" → "Dheeraj")
- Detected attendees
- Searchable index

This is a one-time script to backfill metadata on existing transcripts.
For new transcripts, use granola-auto-extract-all.py which integrates Gemini processing.

Usage:
    python backfill-transcript-metadata.py                  # Process all unprocessed transcripts
    python backfill-transcript-metadata.py --force          # Reprocess all transcripts
    python backfill-transcript-metadata.py --since 2025-11-01  # Process since date
    python backfill-transcript-metadata.py --dry-run        # Show what would be processed
    python backfill-transcript-metadata.py --rebuild-index  # Just rebuild index (no Gemini)

Requires:
    - GEMINI_API_KEY environment variable
    - pip install google-generativeai

Output:
    - Updates transcript files with new frontmatter (tags, topics, attendees)
    - Creates/updates .ai/local/private_transcripts/.transcript-index.json
"""

import argparse
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

def main(ctx):
    parser = argparse.ArgumentParser(
        description="Backfill metadata on existing transcripts using Gemini"
    )
    parser.add_argument('--force', action='store_true',
                        help='Reprocess already-processed transcripts')
    parser.add_argument('--since', help='Process transcripts since date (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be processed without making changes')
    parser.add_argument('--rebuild-index', action='store_true',
                        help='Only rebuild the index from existing files (no Gemini)')

    args = parser.parse_args()

    # Import the processor
    script_dir = Path(__file__).parent
    sys.path.insert(0, str(script_dir))

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "gemini_processor",
        script_dir / "gemini-transcript-processor.py"
    )
    processor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(processor)

    # Build arguments for the processor
    processor_args = []

    if args.rebuild_index:
        processor_args.append('--rebuild-index')
    else:
        processor_args.append('--backfill')

        if args.force:
            processor_args.append('--force')

        if args.since:
            processor_args.extend(['--since', args.since])

        if args.dry_run:
            processor_args.append('--dry-run')

    # Run the processor
    print("=" * 60)
    print("Transcript Metadata Backfill")
    print("=" * 60)
    print(f"\nOptions:")
    print(f"  Force reprocess: {args.force}")
    print(f"  Since date: {args.since or 'all'}")
    print(f"  Dry run: {args.dry_run}")
    print(f"  Rebuild index only: {args.rebuild_index}")
    print()

    # Patch sys.argv for the processor
    original_argv = sys.argv
    sys.argv = ['gemini-transcript-processor.py'] + processor_args

    try:
        return processor.main()
    finally:
        sys.argv = original_argv

run(name='backfill-transcript-metadata', mode='operational', main=main, services=['google', 'granola'])
