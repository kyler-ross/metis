#!/usr/bin/env python3
"""
Granola Helper - CLI Tool for Agent Integration

Provides JSON output for agent to parse and act on.
Supports listing, filtering, and syncing transcripts.

Usage:
    # List all transcripts
    python granola-helper.py list
    
    # Filter by date
    python granola-helper.py list --date 2025-11-21
    
    # Search by pattern
    python granola-helper.py list --search "standup"
    
    # Sync transcripts (to LOCAL)
    python granola-helper.py sync --ids "abc123,def456"
    
    # Sync by date (to LOCAL)
    python granola-helper.py sync --date 2025-11-21
    
    # Share transcripts to TEAM
    python granola-helper.py share --ids "abc123,def456"
    
    # Share by pattern
    python granola-helper.py share --search "scrum"
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import requests
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

def load_credentials():
    """Load Granola credentials"""
    creds_path = Path.home() / "Library/Application Support/Granola/supabase.json"
    
    if not creds_path.exists():
        return None, "Credentials file not found"
    
    try:
        with open(creds_path, 'r') as f:
            data = json.load(f)
        workos_tokens = json.loads(data.get('workos_tokens', '{}'))
        access_token = workos_tokens.get('access_token')
        
        if not access_token:
            return None, "No access token in credentials"
        return access_token, None
    except Exception as e:
        return None, str(e)

def fetch_granola_documents(token, limit=100):
    """Fetch documents from Granola API"""
    url = "https://api.granola.ai/v2/get-documents"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": "Granola/5.354.0",
        "X-Client-Version": "5.354.0"
    }
    data = {
        "limit": limit,
        "offset": 0,
        "include_last_viewed_panel": True
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json(), None
    except Exception as e:
        return None, str(e)

def parse_date(date_str):
    """Parse various date formats"""
    # ISO format
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        pass
    
    # YYYY-MM-DD
    try:
        return datetime.strptime(date_str, '%Y-%m-%d')
    except:
        pass
    
    return None

def filter_transcripts(documents, date_filter=None, search_pattern=None, since_date=None, until_date=None):
    """Filter transcripts by various criteria"""
    filtered = []
    
    for doc in documents:
        # Check if has content
        has_notes = bool(
            doc.get("last_viewed_panel") and 
            doc["last_viewed_panel"].get("content")
        )
        
        if not has_notes:
            continue
        
        created_at = doc.get("created_at")
        if not created_at:
            continue
        
        doc_date = parse_date(created_at)
        if not doc_date:
            continue
        
        # Date filter (exact match)
        if date_filter:
            filter_date = parse_date(date_filter)
            if filter_date and doc_date.date() != filter_date.date():
                continue
        
        # Since date filter
        if since_date:
            since = parse_date(since_date)
            if since and doc_date.date() < since.date():
                continue
        
        # Until date filter
        if until_date:
            until = parse_date(until_date)
            if until and doc_date.date() > until.date():
                continue
        
        # Search pattern
        if search_pattern:
            title = doc.get("title", "").lower()
            if search_pattern.lower() not in title:
                continue
        
        # Build transcript info
        transcript = {
            "id": doc.get("id"),
            "title": doc.get("title", "Untitled"),
            "created_at": created_at,
            "updated_at": doc.get("updated_at"),
            "has_notes": has_notes,
            "date": doc_date.strftime('%Y-%m-%d'),
            "time": doc_date.strftime('%H:%M'),
            "datetime": doc_date.isoformat()
        }
        
        filtered.append(transcript)
    
    # Sort by date (newest first)
    filtered.sort(key=lambda x: x['datetime'], reverse=True)
    
    return filtered

def convert_prosemirror_to_markdown(content):
    """Convert ProseMirror JSON to Markdown"""
    if not content or not isinstance(content, dict) or 'content' not in content:
        return ""
    
    def process_node(node):
        if not isinstance(node, dict):
            return ""
        
        node_type = node.get('type', '')
        content = node.get('content', [])
        text = node.get('text', '')
        marks = node.get('marks', [])
        
        if node_type == 'text':
            result = text
            for mark in marks:
                mark_type = mark.get('type')
                if mark_type == 'bold':
                    result = f"**{result}**"
                elif mark_type == 'italic':
                    result = f"*{result}*"
                elif mark_type == 'code':
                    result = f"`{result}`"
            return result
        
        elif node_type == 'heading':
            level = node.get('attrs', {}).get('level', 1)
            heading_text = ''.join(process_node(child) for child in content)
            return f"{'#' * level} {heading_text}\n\n"
        
        elif node_type == 'paragraph':
            para_text = ''.join(process_node(child) for child in content)
            return f"{para_text}\n\n"
        
        elif node_type == 'bulletList':
            items = []
            for item in content:
                if item.get('type') == 'listItem':
                    item_content = ''.join(process_node(child) for child in item.get('content', []))
                    items.append(f"- {item_content.strip()}")
            return '\n'.join(items) + '\n\n'
        
        elif node_type == 'orderedList':
            items = []
            for idx, item in enumerate(content, 1):
                if item.get('type') == 'listItem':
                    item_content = ''.join(process_node(child) for child in item.get('content', []))
                    items.append(f"{idx}. {item_content.strip()}")
            return '\n'.join(items) + '\n\n'
        
        elif node_type == 'codeBlock':
            code_text = ''.join(process_node(child) for child in content)
            return f"```\n{code_text.strip()}\n```\n\n"
        
        return ''.join(process_node(child) for child in content)
    
    return process_node(content)

def sanitize_filename(title, created_at=None):
    """Convert title to valid filename"""
    if created_at:
        try:
            date_obj = parse_date(created_at)
            date_prefix = date_obj.strftime('%Y-%m-%d')
        except:
            date_prefix = datetime.now().strftime('%Y-%m-%d')
    else:
        date_prefix = datetime.now().strftime('%Y-%m-%d')
    
    invalid_chars = '<>:"/\\|?*'
    clean_title = ''.join(c for c in title if c not in invalid_chars)
    slug = clean_title.lower().replace(' ', '-').strip('-')
    slug = re.sub(r'-+', '-', slug)
    slug = slug[:100]
    
    return f"{date_prefix}-{slug}.md"

def sync_transcript(doc, destination_dir):
    """Sync a single transcript to LOCAL"""
    title = doc.get("title") or "Untitled Meeting"
    doc_id = doc.get("id", "unknown")
    created_at = doc.get("created_at")
    updated_at = doc.get("updated_at")
    
    # Extract from last_viewed_panel (user's current view)
    panel_content = None
    try:
        last_panel = doc.get("last_viewed_panel")
        if last_panel and isinstance(last_panel, dict):
            content = last_panel.get("content")
            if content and isinstance(content, dict) and content.get("type") == "doc":
                panel_content = convert_prosemirror_to_markdown(content)
    except Exception:
        pass
    
    # Extract from notes field (might be fuller/different)
    notes_content = None
    try:
        notes = doc.get("notes")
        if notes and isinstance(notes, dict) and notes.get("type") == "doc":
            notes_content = convert_prosemirror_to_markdown(notes)
    except Exception:
        pass
    
    # Use whichever is available
    if panel_content and notes_content:
        # Both exist - they might be the same or different
        # Use panel_content as "notes" and notes_content as potential "full content"
        has_notes = True
        has_full = panel_content != notes_content
    elif panel_content:
        notes_content = panel_content
        has_notes = True
        has_full = False
    elif notes_content:
        has_notes = True
        has_full = False
    else:
        return None, "No content"
    
    # Build markdown
    escaped_title = title.replace('"', '\\"')
    frontmatter = "---\n"
    frontmatter += f"granola_id: {doc_id}\n"
    frontmatter += f"title: \"{escaped_title}\"\n"
    frontmatter += f"source: granola\n"
    frontmatter += f"location: local\n"
    if created_at:
        frontmatter += f"created_at: {created_at}\n"
    if updated_at:
        frontmatter += f"updated_at: {updated_at}\n"
    frontmatter += f"synced_at: {datetime.now().isoformat()}\n"
    frontmatter += "---\n\n"
    
    # Build markdown (just notes for now - transcripts not in API response)
    markdown_parts = [frontmatter, f"# {title}\n\n"]
    
    if has_notes:
        markdown_parts.append("## Notes\n\n")
        markdown_parts.append(notes_content)
    
    # Note: Raw transcripts don't appear to be available in the get-documents API endpoint
    # The Granola API only returns AI-generated notes, not verbatim speech-to-text
    
    final_markdown = ''.join(markdown_parts)
    
    # Save file
    filename = sanitize_filename(title, created_at)
    filepath = destination_dir / filename
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(final_markdown)
        return filename, None
    except Exception as e:
        return None, str(e)

def cmd_list(args):
    """List transcripts"""
    token, error = load_credentials()
    if error:
        return {"success": False, "error": error}
    
    api_response, error = fetch_granola_documents(token, limit=args.limit)
    if error:
        return {"success": False, "error": error}
    
    documents = api_response.get("docs", [])
    
    # Filter transcripts
    filtered = filter_transcripts(
        documents,
        date_filter=args.date,
        search_pattern=args.search,
        since_date=args.since,
        until_date=args.until
    )
    
    return {
        "success": True,
        "count": len(filtered),
        "transcripts": filtered
    }

def cmd_sync(args):
    """Sync transcripts to LOCAL"""
    script_dir = Path(__file__).parent
    dest_dir = script_dir.parent / 'local' / 'private_transcripts'
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    token, error = load_credentials()
    if error:
        return {"success": False, "error": error}
    
    api_response, error = fetch_granola_documents(token, limit=100)
    if error:
        return {"success": False, "error": error}
    
    documents = api_response.get("docs", [])
    
    # Filter documents to sync
    if args.ids:
        # Sync specific IDs
        id_list = [id.strip() for id in args.ids.split(',')]
        docs_to_sync = [doc for doc in documents if doc.get("id") in id_list]
    else:
        # Filter by criteria
        filtered = filter_transcripts(
            documents,
            date_filter=args.date,
            search_pattern=args.search,
            since_date=args.since,
            until_date=args.until
        )
        # Get full docs for filtered transcripts
        filtered_ids = [t['id'] for t in filtered]
        docs_to_sync = [doc for doc in documents if doc.get("id") in filtered_ids]
    
    # Sync each document
    synced = []
    errors = []
    
    for doc in docs_to_sync:
        filename, error = sync_transcript(doc, dest_dir)
        if filename:
            synced.append({
                "title": doc.get("title"),
                "filename": filename
            })
        else:
            errors.append({
                "title": doc.get("title"),
                "error": error
            })
    
    return {
        "success": True,
        "synced_count": len(synced),
        "error_count": len(errors),
        "synced": synced,
        "errors": errors,
        "destination": "local",
        "destination_path": str(dest_dir)
    }

def cmd_share(args):
    """Share LOCAL transcripts to TEAM"""
    script_dir = Path(__file__).parent
    local_dir = script_dir.parent / 'local' / 'private_transcripts'
    team_dir = script_dir.parent / 'knowledge' / 'meeting_transcripts'
    team_dir.mkdir(parents=True, exist_ok=True)
    
    # Get list of LOCAL transcripts
    if not local_dir.exists():
        return {"success": False, "error": "No local transcripts found. Sync first."}
    
    local_files = list(local_dir.glob('*.md'))
    if not local_files:
        return {"success": False, "error": "No local transcripts found. Sync first."}
    
    # Filter which ones to share
    files_to_share = []
    
    if args.ids:
        # Share specific IDs - need to read frontmatter to match IDs
        id_list = [id.strip() for id in args.ids.split(',')]
        for filepath in local_files:
            try:
                with open(filepath, 'r') as f:
                    content = f.read()
                    # Extract granola_id from frontmatter
                    if 'granola_id:' in content:
                        for line in content.split('\n'):
                            if line.startswith('granola_id:'):
                                file_id = line.split(':', 1)[1].strip()
                                if file_id in id_list:
                                    files_to_share.append(filepath)
                                break
            except:
                continue
    else:
        # Filter by search pattern or date
        for filepath in local_files:
            filename = filepath.name
            
            # Date filter
            if args.date and args.date not in filename:
                continue
            
            # Search filter
            if args.search and args.search.lower() not in filename.lower():
                continue
            
            # Since/until filters
            if args.since:
                file_date = filename.split('-')[0:3]  # YYYY-MM-DD
                if len(file_date) == 3:
                    file_date_str = '-'.join(file_date)
                    if file_date_str < args.since:
                        continue
            
            if args.until:
                file_date = filename.split('-')[0:3]
                if len(file_date) == 3:
                    file_date_str = '-'.join(file_date)
                    if file_date_str > args.until:
                        continue
            
            files_to_share.append(filepath)
    
    # Copy files to TEAM
    shared = []
    errors = []
    
    for filepath in files_to_share:
        try:
            # Read content
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Update location in frontmatter
            content = content.replace('location: local', 'location: team')
            
            # Write to team directory
            dest_path = team_dir / filepath.name
            with open(dest_path, 'w') as f:
                f.write(content)
            
            shared.append({
                "filename": filepath.name,
                "source": str(filepath),
                "destination": str(dest_path)
            })
        except Exception as e:
            errors.append({
                "filename": filepath.name,
                "error": str(e)
            })
    
    return {
        "success": True,
        "shared_count": len(shared),
        "error_count": len(errors),
        "shared": shared,
        "errors": errors,
        "team_path": str(team_dir)
    }

def main():
    parser = argparse.ArgumentParser(description="Granola Helper CLI")
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List transcripts')
    list_parser.add_argument('--limit', type=int, default=50, help='Max transcripts to fetch')
    list_parser.add_argument('--date', help='Filter by date (YYYY-MM-DD)')
    list_parser.add_argument('--search', help='Search pattern in title')
    list_parser.add_argument('--since', help='Filter since date (YYYY-MM-DD)')
    list_parser.add_argument('--until', help='Filter until date (YYYY-MM-DD)')
    
    # Sync command (always to LOCAL)
    sync_parser = subparsers.add_parser('sync', help='Sync transcripts to LOCAL')
    sync_parser.add_argument('--ids', help='Comma-separated transcript IDs')
    sync_parser.add_argument('--date', help='Filter by date (YYYY-MM-DD)')
    sync_parser.add_argument('--search', help='Search pattern in title')
    sync_parser.add_argument('--since', help='Filter since date (YYYY-MM-DD)')
    sync_parser.add_argument('--until', help='Filter until date (YYYY-MM-DD)')
    
    # Share command (copy LOCAL to TEAM)
    share_parser = subparsers.add_parser('share', help='Share LOCAL transcripts to TEAM')
    share_parser.add_argument('--ids', help='Comma-separated transcript IDs')
    share_parser.add_argument('--date', help='Filter by date (YYYY-MM-DD)')
    share_parser.add_argument('--search', help='Search pattern in title')
    share_parser.add_argument('--since', help='Filter since date (YYYY-MM-DD)')
    share_parser.add_argument('--until', help='Filter until date (YYYY-MM-DD)')
    
    # Extract command (get verbatim transcripts via CDP)
    extract_parser = subparsers.add_parser('extract', help='Extract verbatim transcripts via DevTools')
    extract_parser.add_argument('--id', help='Meeting ID to extract')
    extract_parser.add_argument('--all', action='store_true', help='Extract all meetings')
    extract_parser.add_argument('--dry-run', action='store_true', help='Test without saving')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        raise Exception('No command specified')
    
    # Execute command
    if args.command == 'list':
        result = cmd_list(args)
    elif args.command == 'sync':
        result = cmd_sync(args)
    elif args.command == 'share':
        result = cmd_share(args)
    elif args.command == 'extract':
        # Delegate to CDP extractor
        import subprocess
        script_dir = Path(__file__).parent
        extractor = script_dir / 'granola-extract-transcript.py'
        
        cmd = ['python3', str(extractor)]
        if args.all:
            cmd.append('--all')
        elif args.id:
            cmd.append(args.id)
        if args.dry_run:
            cmd.append('--dry-run')
        
        proc = subprocess.run(cmd, capture_output=True, text=True)
        print(proc.stdout)
        if proc.stderr:
            print(proc.stderr, file=sys.stderr)
        
        result = {"success": proc.returncode == 0}
    else:
        result = {"success": False, "error": "Unknown command"}
    
    # Output JSON
    print(json.dumps(result, indent=2))

    if not result.get("success"):
        raise Exception(result.get("error", "Command failed"))

def _main_wrapper(ctx):
    main()

if __name__ == "__main__":
    script_run(name='granola-helper', mode='operational', main=_main_wrapper, services=['google', 'granola'])

