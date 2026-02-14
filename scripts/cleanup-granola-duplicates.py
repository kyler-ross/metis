#!/usr/bin/env python3
"""
Cleanup script for duplicate/incomplete Granola transcript files.

This script:
1. Finds files without transcripts (only have notes from API sync)
2. Checks if a proper version with transcript exists (same granola_id)
3. Removes the incomplete duplicates

Usage:
    python cleanup-granola-duplicates.py --dry-run   # Preview what would be deleted
    python cleanup-granola-duplicates.py --execute   # Actually delete files
"""

import argparse
import os
import re
from pathlib import Path
from collections import defaultdict

def extract_granola_id(filepath):
    """Extract granola_id from file frontmatter"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read(2000)  # Just read frontmatter
            match = re.search(r'granola_id:\s*([a-f0-9-]+)', content)
            if match:
                return match.group(1)
    except:
        pass
    return None

def has_transcript(filepath):
    """Check if file has actual transcript content"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Must have transcript section with actual content after it
            if '## Transcript' not in content:
                return False
            # Check there's meaningful content after transcript header
            transcript_idx = content.find('## Transcript')
            after_header = content[transcript_idx + len('## Transcript'):].strip()
            return len(after_header) > 100  # At least 100 chars of transcript
    except:
        return False

def main():
    parser = argparse.ArgumentParser(description='Cleanup duplicate Granola transcripts')
    parser.add_argument('--dry-run', action='store_true', help='Preview deletions without executing')
    parser.add_argument('--execute', action='store_true', help='Actually delete files')
    parser.add_argument('--path', type=str, help='Path to transcripts directory (defaults to .ai/local/private_transcripts)')
    args = parser.parse_args()

    if not args.dry_run and not args.execute:
        print("Please specify --dry-run or --execute")
        return 1

    # Find transcript directory
    if args.path:
        transcript_dir = Path(args.path)
    else:
        script_dir = Path(__file__).parent
        transcript_dir = script_dir.parent / 'local' / 'private_transcripts'
    
    if not transcript_dir.exists():
        print(f"Transcript directory not found: {transcript_dir}")
        return 1

    # Group files by granola_id
    files_by_id = defaultdict(list)
    orphan_files = []  # Files without granola_id
    
    for filepath in transcript_dir.glob('*.md'):
        if filepath.name.startswith('.'):
            continue
        
        gid = extract_granola_id(filepath)
        if gid:
            files_by_id[gid].append(filepath)
        else:
            orphan_files.append(filepath)

    # Analyze and find files to delete
    files_to_delete = []
    
    for gid, files in files_by_id.items():
        if len(files) == 1:
            # Only one file for this meeting
            f = files[0]
            if not has_transcript(f):
                # Single file without transcript - might want to re-extract later
                # Don't delete, but warn
                print(f"⚠ Missing transcript (no duplicate): {f.name}")
            continue
        
        # Multiple files for same meeting - keep the one with transcript
        with_transcript = [f for f in files if has_transcript(f)]
        without_transcript = [f for f in files if not has_transcript(f)]
        
        if with_transcript and without_transcript:
            # Have a good version, delete the bad ones
            for f in without_transcript:
                files_to_delete.append((f, f"Duplicate of {with_transcript[0].name}"))
        elif not with_transcript:
            # All copies are bad - keep the newest one
            files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
            for f in files[1:]:
                files_to_delete.append((f, f"Older duplicate (all missing transcripts)"))
            print(f"⚠ All duplicates missing transcript for: {files[0].name}")

    # Check for files from the API sync (have synced_at but not extracted_at)
    for filepath in transcript_dir.glob('*.md'):
        if filepath.name.startswith('.'):
            continue
        if any(filepath == f[0] for f in files_to_delete):
            continue  # Already marked for deletion
            
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read(2000)
                # API-synced files have synced_at, proper extracts have extracted_at
                has_synced_at = 'synced_at:' in content
                has_extracted_at = 'extracted_at:' in content
                
                if has_synced_at and not has_extracted_at and not has_transcript(filepath):
                    files_to_delete.append((filepath, "API sync without transcript"))
        except:
            pass

    # Report and optionally delete
    print(f"\n{'='*60}")
    print(f"Found {len(files_to_delete)} files to delete")
    print(f"{'='*60}\n")

    for filepath, reason in files_to_delete:
        print(f"{'DELETE' if args.execute else 'WOULD DELETE'}: {filepath.name}")
        print(f"  Reason: {reason}")
        
        if args.execute:
            try:
                filepath.unlink()
                print(f"  ✓ Deleted")
            except Exception as e:
                print(f"  ✗ Error: {e}")
        print()

    if args.dry_run:
        print(f"\nRun with --execute to delete these {len(files_to_delete)} files")
    else:
        print(f"\n✓ Deleted {len(files_to_delete)} files")

    return 0

if __name__ == "__main__":
    exit(main())

