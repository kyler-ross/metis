#!/usr/bin/env python3
"""
Granola Transcript Auto-Extractor

Fully automated transcript extraction via direct store access.
Reads transcripts directly from Granola's internal Zustand store using CDP.

NO MANUAL STEPS REQUIRED.

Usage:
    python granola-auto-extract-all.py --since 2025-11-17
    python granola-auto-extract-all.py --on 2025-07-16
    python granola-auto-extract-all.py --all
    python granola-auto-extract-all.py --ids "abc123,def456"
    python granola-auto-extract-all.py --force  # Re-extract even if already pulled
    python granola-auto-extract-all.py --with-gemini  # Process with Gemini after extraction
    python granola-auto-extract-all.py --no-gemini  # Skip Gemini processing (default if GEMINI_API_KEY not set)
    python granola-auto-extract-all.py --verify  # Find files with notes but missing transcripts
    python granola-auto-extract-all.py --backfill  # Re-extract files that only have notes (missing transcripts)

Output:
    Saves markdown files to .ai/local/private_transcripts/
    Includes: frontmatter metadata, date, participants, notes (if available), full transcript

Tracking:
    Uses .ai/local/private_transcripts/.manifest.json to track extracted meetings.
    Skips already-extracted meetings unless --force is used.

Gemini Processing:
    If GEMINI_API_KEY is set, automatically processes transcripts with Gemini to:
    - Generate tags and topics
    - Correct participant names (e.g., "Derat" → "Dheeraj")
    - Detect meeting attendees from transcript content
    - Build searchable index at .ai/local/private_transcripts/.transcript-index.json
"""

import argparse
import json
import subprocess
import time
import sys
import os
from pathlib import Path
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

def get_manifest_path():
    """Get path to the manifest file"""
    script_dir = Path(__file__).parent
    return script_dir.parent / 'local' / 'private_transcripts' / '.manifest.json'

def load_manifest():
    """Load the manifest of already-extracted meetings"""
    manifest_path = get_manifest_path()
    if manifest_path.exists():
        try:
            with open(manifest_path, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_manifest(manifest):
    """Save the manifest of extracted meetings"""
    manifest_path = get_manifest_path()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

def get_meetings_to_extract(since_date=None, on_date=None, all_meetings=False, ids=None, force=False):
    """Get list of meetings to extract"""
    creds_path = Path.home() / 'Library/Application Support/Granola/supabase.json'

    with open(creds_path) as f:
        data = json.load(f)

    workos_tokens = json.loads(data['workos_tokens'])
    token = workos_tokens['access_token']

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    response = requests.post(
        'https://api.granola.ai/v2/get-documents',
        headers=headers,
        json={'limit': 1000, 'offset': 0}  # Get more to find specific date
    )

    docs = response.json().get('docs', [])

    # Filter based on criteria
    if ids:
        id_list = [i.strip() for i in ids.split(',')]
        docs = [d for d in docs if d['id'] in id_list]
    elif on_date:
        # Filter to meetings created ON a specific date
        from datetime import datetime, timezone
        target_date = datetime.fromisoformat(on_date).replace(tzinfo=timezone.utc).date()
        docs = [d for d in docs if datetime.fromisoformat(d['created_at'].replace('Z', '+00:00')).date() == target_date]
    elif since_date:
        from datetime import datetime, timezone
        cutoff = datetime.fromisoformat(since_date).replace(tzinfo=timezone.utc)
        docs = [d for d in docs if datetime.fromisoformat(d['created_at'].replace('Z', '+00:00')) >= cutoff]

    # Filter out already-extracted meetings unless --force
    if not force:
        manifest = load_manifest()
        original_count = len(docs)
        docs = [d for d in docs if d['id'] not in manifest]
        skipped = original_count - len(docs)
        if skipped > 0:
            print(f"Skipping {skipped} already-extracted meetings (use --force to re-extract)")

    return docs

def is_granola_running():
    """Check if Granola process is running"""
    result = subprocess.run(['pgrep', '-x', 'Granola'], capture_output=True)
    return result.returncode == 0

def kill_granola_and_wait():
    """Kill Granola and wait until it's actually dead"""
    subprocess.run(['killall', 'Granola'], stderr=subprocess.DEVNULL)

    # Wait up to 10 seconds for Granola to fully terminate
    for _ in range(20):
        if not is_granola_running():
            return True
        time.sleep(0.5)

    # Force kill if still running
    subprocess.run(['killall', '-9', 'Granola'], stderr=subprocess.DEVNULL)
    time.sleep(1)
    return not is_granola_running()

def launch_granola_with_debugging():
    """Launch Granola with remote debugging - always fresh to avoid stale state"""

    # ALWAYS kill and relaunch to ensure clean state
    # Reusing existing Granola causes transcript loading failures
    print("Launching fresh Granola instance (ensures clean state)...")

    # Kill any existing Granola and wait for it to fully terminate
    kill_granola_and_wait()

    # Try up to 3 times to launch with debugging
    for attempt in range(3):
        if attempt > 0:
            print(f"  Retry attempt {attempt + 1}/3...")
            kill_granola_and_wait()

        # Launch with debugging using 'open -a' command (required for modern macOS/Electron)
        # Must use 'open' command with --args to properly pass flags to Electron apps
        # The --remote-allow-origins=* flag is required for WebSocket connections
        subprocess.Popen([
            'open', '-a', 'Granola', '--args',
            '--remote-debugging-port=9222',
            '--remote-allow-origins=*'
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Wait for debugging port with longer initial wait
        time.sleep(5)  # Give app time to initialize (increased for open command)

        for i in range(30):
            try:
                response = requests.get('http://localhost:9222/json', timeout=2)
                if response.status_code == 200:
                    for target in response.json():
                        if target.get('type') == 'page':
                            print(f"Granola launched with debugging")
                            return target['webSocketDebuggerUrl']
            except:
                pass
            time.sleep(1)
            if i > 0 and i % 10 == 0:
                print(f"  Still waiting for debugging port... ({i}/30)")

        # Check if Granola launched but without debugging port
        if is_granola_running():
            print("  Granola is running but debugging port not available, retrying...")

    raise Exception("Failed to launch Granola with debugging after 3 attempts. Try opening Granola manually first.")

def execute_js(ws_url, js_code):
    """Execute JavaScript via CDP"""
    import websocket
    import random

    try:
        ws = websocket.create_connection(ws_url, timeout=10)

        command = {
            "id": random.randint(1000, 99999),
            "method": "Runtime.evaluate",
            "params": {
                "expression": js_code,
                "returnByValue": True,
                "awaitPromise": True
            }
        }

        ws.send(json.dumps(command))
        ws.settimeout(15)
        response = json.loads(ws.recv())
        ws.close()

        if 'error' in response:
            print(f"    CDP Error: {response['error']}")
            return None

        if 'result' in response:
            result = response['result']
            if 'result' in result:
                return result['result'].get('value')

        return None
    except Exception as e:
        print(f"    Error: {e}")
        return None

def navigate_to_meeting(ws_url, meeting_id):
    """Navigate to meeting via CDP to load transcript into store"""
    import websocket
    import random

    try:
        ws = websocket.create_connection(ws_url, timeout=10)

        # Navigate to meeting page
        command = {
            "id": random.randint(1000, 99999),
            "method": "Page.navigate",
            "params": {
                "url": f"file:///Applications/Granola.app/Contents/Resources/app.asar/dist-app/index.html#/meeting/{meeting_id}"
            }
        }

        ws.send(json.dumps(command))
        ws.recv()
        ws.close()

        # Wait for transcript to load into store
        time.sleep(3)

        # Check if transcript is now in store
        for i in range(10):
            check_js = f"""
            (function() {{
                let state = window.__GRANOLA__.useCacheStore.getState();
                return state.transcripts && state.transcripts['{meeting_id}'] ? 'loaded' : 'waiting';
            }})()
            """
            result = execute_js(ws_url, check_js)
            if result == 'loaded':
                return True
            time.sleep(1)

        return False
    except:
        return False

def extract_transcript_automated(ws_url, meeting_id, meeting_data):
    """Extract transcript directly from Granola's store with metadata"""

    title = meeting_data.get('title', 'Untitled')
    created_at = meeting_data.get('created_at', '')
    updated_at = meeting_data.get('updated_at', '')

    # Get participants from meeting data
    participants = []

    # Try google_calendar_event first (most reliable)
    if meeting_data.get('google_calendar_event'):
        import ast
        try:
            gcal_str = meeting_data['google_calendar_event']
            if isinstance(gcal_str, str):
                gcal = ast.literal_eval(gcal_str)
                if isinstance(gcal, dict):
                    # Check for attendees
                    if gcal.get('attendees'):
                        for attendee in gcal['attendees']:
                            if isinstance(attendee, dict):
                                name = attendee.get('displayName') or attendee.get('email', '').split('@')[0]
                                if name:
                                    participants.append(name)
        except:
            pass

    # Try people field
    if not participants and meeting_data.get('people'):
        people = meeting_data['people']
        if isinstance(people, str):
            try:
                import ast
                people = ast.literal_eval(people)
            except:
                pass
        if isinstance(people, list):
            for person in people:
                if isinstance(person, dict):
                    name = person.get('name') or person.get('email', '').split('@')[0]
                    if name:
                        participants.append(name)
                elif isinstance(person, str):
                    participants.append(person)

    # Try attendees field
    if not participants and meeting_data.get('attendees'):
        attendees = meeting_data['attendees']
        if isinstance(attendees, list):
            for attendee in attendees:
                if isinstance(attendee, dict):
                    name = None
                    if attendee.get('details', {}).get('person', {}).get('name', {}).get('fullName'):
                        name = attendee['details']['person']['name']['fullName']
                    elif attendee.get('name'):
                        name = attendee['name']
                    elif attendee.get('email'):
                        name = attendee['email'].split('@')[0]
                    if name:
                        participants.append(name)
                elif isinstance(attendee, str):
                    participants.append(attendee)

    # Remove duplicates while preserving order
    seen = set()
    participants = [p for p in participants if p and (p not in seen and not seen.add(p))]

    # Get notes if available
    notes_content = None
    if meeting_data.get('notes'):
        notes = meeting_data['notes']
        if isinstance(notes, str):
            # Might be a string representation of dict
            try:
                import ast
                notes = ast.literal_eval(notes)
            except:
                pass
        if isinstance(notes, dict) and notes.get('type') == 'doc':
            # ProseMirror format - extract text
            def extract_text(node):
                if node.get('type') == 'text':
                    return node.get('text', '')
                elif node.get('content'):
                    return ' '.join([extract_text(child) for child in node['content']])
                return ''
            notes_content = extract_text(notes)
        elif isinstance(notes, str):
            notes_content = notes

    # Also try notes_markdown or notes_plain
    if not notes_content:
        if meeting_data.get('notes_markdown'):
            notes_content = meeting_data['notes_markdown']
        elif meeting_data.get('notes_plain'):
            notes_content = meeting_data['notes_plain']

    # JavaScript to read transcript from store
    js_code = f"""
    (function() {{
        let meetingId = '{meeting_id}';

        if (!window.__GRANOLA__ || !window.__GRANOLA__.useCacheStore) {{
            return JSON.stringify({{error: 'Store not found'}});
        }}

        let state = window.__GRANOLA__.useCacheStore.getState();

        if (!state.transcripts || !state.transcripts[meetingId]) {{
            return JSON.stringify({{error: 'Transcript not found in store'}});
        }}

        let transcript = state.transcripts[meetingId];

        // Get all chunks (numeric keys)
        let keys = Object.keys(transcript)
            .filter(k => !isNaN(parseInt(k)))
            .map(k => parseInt(k))
            .sort((a,b) => a-b);

        // Extract text from each chunk
        let chunks = keys.map(k => transcript[k]);
        let lines = chunks.map(chunk => chunk.text || '').filter(t => t.trim());
        let fullText = lines.join('\\n\\n');

        return JSON.stringify({{
            success: true,
            text: fullText,
            chunkCount: chunks.length
        }});
    }})()
    """

    print(f"  Extracting from store...")
    result = execute_js(ws_url, js_code)

    if result:
        try:
            if isinstance(result, str):
                data = json.loads(result)
            else:
                data = result

            if data.get('error'):
                print(f"  Failed: {data['error']}")
                return False

            if data.get('success') and data.get('text'):
                transcript_text = data['text']
                print(f"  Extracted {len(transcript_text):,} characters ({data.get('chunkCount', 0)} chunks)")

                # Build markdown with metadata
                from datetime import datetime
                import re

                # Format date
                date_str = ''
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        date_str = dt.strftime('%B %d, %Y')
                        time_str = dt.strftime('%I:%M %p')
                    except:
                        date_str = created_at[:10] if len(created_at) >= 10 else created_at

                # Build frontmatter
                escaped_title = title.replace('"', '\\"')
                frontmatter = "---\n"
                frontmatter += f"granola_id: {meeting_id}\n"
                frontmatter += f"title: \"{escaped_title}\"\n"
                if created_at:
                    frontmatter += f"created_at: {created_at}\n"
                if updated_at:
                    frontmatter += f"updated_at: {updated_at}\n"
                frontmatter += f"extracted_at: {datetime.now().isoformat()}\n"
                frontmatter += f"source: granola\n"
                frontmatter += f"location: local\n"
                frontmatter += "---\n\n"

                # Build markdown content
                markdown_parts = [frontmatter]
                markdown_parts.append(f"# {title}\n\n")

                # Add metadata section
                if date_str:
                    markdown_parts.append(f"**Date:** {date_str}")
                    if 'time_str' in locals():
                        markdown_parts.append(f" at {time_str}")
                    markdown_parts.append("\n\n")

                if participants:
                    # Format participants nicely
                    if isinstance(participants, list):
                        participants_str = ', '.join([str(p) for p in participants if p])
                    else:
                        participants_str = str(participants)
                    if participants_str:
                        markdown_parts.append(f"**Participants:** {participants_str}\n\n")

                # Add notes if available
                if notes_content:
                    markdown_parts.append("## Notes\n\n")
                    markdown_parts.append(notes_content)
                    markdown_parts.append("\n\n")

                # Add transcript
                markdown_parts.append("## Transcript\n\n")
                markdown_parts.append(transcript_text)

                full_markdown = ''.join(markdown_parts)

                # Save to file
                script_dir = Path(__file__).parent
                output_dir = script_dir.parent / 'local' / 'private_transcripts'
                output_dir.mkdir(parents=True, exist_ok=True)

                # Clean filename - normalize to prevent duplicates
                # Replace / and : with spaces first (common in titles like "Angela / Kyler 1:1")
                clean_title = re.sub(r'[/:]+', ' ', title)
                # Remove remaining invalid chars
                clean_title = re.sub(r'[<>"\\|?*]', '', clean_title)
                # Convert to lowercase slug with single hyphens
                slug = clean_title.lower().strip()
                slug = re.sub(r'\s+', '-', slug)  # spaces to hyphens
                slug = re.sub(r'-+', '-', slug)   # collapse multiple hyphens
                slug = slug.strip('-')[:80]       # trim edges and limit length

                # Add date prefix if available
                if created_at and len(created_at) >= 10:
                    date_prefix = created_at[:10]
                    filename = f"{date_prefix}-{slug}.md"
                else:
                    filename = f"{meeting_id[:8]}-{slug}.md"

                filepath = output_dir / filename
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(full_markdown)

                print(f"  Saved: {filename}")
                return (filepath, filename)
        except Exception as e:
            print(f"  Error parsing result: {e}")
            import traceback
            traceback.print_exc()

    print(f"  Failed to extract")
    return None


def run_gemini_processing(filepaths, force=False):
    """Run Gemini processing on extracted transcripts"""

    # Check for Gemini API key (google-genai checks both)
    api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        print("\nGEMINI_API_KEY not set - skipping Gemini processing")
        print("  Set the environment variable to enable tags, topics, and name correction")
        return

    try:
        from google import genai
    except ImportError:
        print("\ngoogle-genai not installed - skipping Gemini processing")
        print("  Install: pip install google-genai")
        return

    print(f"\n{'='*60}")
    print("Running Gemini processing...")
    print(f"{'='*60}")

    # Import the processor functions
    script_dir = Path(__file__).parent
    sys.path.insert(0, str(script_dir))

    try:
        from importlib import import_module
        processor = import_module('gemini-transcript-processor')
    except ImportError:
        # Fall back to direct import with mangled name
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "gemini_processor",
            script_dir / "gemini-transcript-processor.py"
        )
        processor = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(processor)

    # Initialize
    team_members = processor.load_team_members()
    name_corrections = processor.build_name_correction_map(team_members)

    # Create client using new google-genai API
    client = genai.Client(api_key=api_key)

    index = processor.load_index()

    success_count = 0
    for filepath in filepaths:
        if processor.process_single_transcript(
            filepath, client, team_members, name_corrections, index, force
        ):
            success_count += 1

    processor.save_index(index)

    print(f"\nGemini processing complete: {success_count}/{len(filepaths)}")
    print(f"  Index updated: {processor.get_index_path()}")


def find_files_missing_transcripts():
    """Find transcript files that only have notes but no transcript section"""
    script_dir = Path(__file__).parent
    transcripts_dir = script_dir.parent / 'local' / 'private_transcripts'

    if not transcripts_dir.exists():
        return [], []

    missing_transcript = []
    has_transcript = []

    for filepath in transcripts_dir.glob('*.md'):
        try:
            content = filepath.read_text()
            has_notes = '## Notes' in content
            has_full_transcript = '## Transcript' in content

            # Extract granola_id from frontmatter
            granola_id = None
            if 'granola_id:' in content:
                for line in content.split('\n'):
                    if line.startswith('granola_id:'):
                        granola_id = line.split(':', 1)[1].strip()
                        break

            if has_notes and not has_full_transcript:
                missing_transcript.append({
                    'filepath': filepath,
                    'filename': filepath.name,
                    'granola_id': granola_id
                })
            elif has_full_transcript:
                has_transcript.append(filepath.name)
        except Exception:
            continue

    return missing_transcript, has_transcript


def cmd_verify():
    """Check for files with notes but missing transcripts"""
    print("Scanning for files with missing transcripts...\n")

    missing, complete = find_files_missing_transcripts()

    print(f"Files with FULL TRANSCRIPT: {len(complete)}")
    print(f"Files with NOTES ONLY (missing transcript): {len(missing)}\n")

    if missing:
        print("Files missing transcripts:")
        print("-" * 60)
        for item in missing[:20]:  # Show first 20
            print(f"  {item['filename']}")
            if item['granola_id']:
                print(f"    ID: {item['granola_id']}")

        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more")

        print(f"\nTo backfill these transcripts, run:")
        print(f"   python granola-auto-extract-all.py --backfill")
    else:
        print("All transcript files have full transcripts!")

    return 0


def cmd_backfill():
    """Re-extract transcripts for files that only have notes"""
    missing, _ = find_files_missing_transcripts()

    if not missing:
        print("No files need backfilling - all have full transcripts!")
        return 0

    # Get IDs to re-extract
    ids_to_extract = [item['granola_id'] for item in missing if item['granola_id']]

    if not ids_to_extract:
        print("No granola_ids found in files missing transcripts")
        print("  These files may need manual review")
        raise Exception("No granola_ids found in files missing transcripts")

    print(f"Found {len(ids_to_extract)} files needing transcript extraction\n")

    # Return the IDs so main() can process them
    return ids_to_extract


def main(ctx):
    parser = argparse.ArgumentParser(description="Auto-extract Granola transcripts")
    parser.add_argument('--since', help='Extract since date (YYYY-MM-DD)')
    parser.add_argument('--on', dest='on_date', help='Extract on specific date (YYYY-MM-DD)')
    parser.add_argument('--all', action='store_true', help='Extract all recent')
    parser.add_argument('--ids', help='Comma-separated meeting IDs')
    parser.add_argument('--force', action='store_true', help='Re-extract even if already pulled')
    parser.add_argument('--with-gemini', action='store_true', dest='with_gemini',
                        help='Process with Gemini after extraction (auto-enabled if GEMINI_API_KEY set)')
    parser.add_argument('--no-gemini', action='store_true', dest='no_gemini',
                        help='Skip Gemini processing even if API key is available')
    parser.add_argument('--verify', action='store_true',
                        help='Check for files with notes but missing transcripts')
    parser.add_argument('--backfill', action='store_true',
                        help='Re-extract files that only have notes (missing transcripts)')

    args = parser.parse_args()

    # Handle verify command
    if args.verify:
        return cmd_verify()

    # Handle backfill command
    if args.backfill:
        ids_result = cmd_backfill()
        if isinstance(ids_result, int):
            return ids_result
        # ids_result is a list of IDs to extract
        args.ids = ','.join(ids_result)
        args.force = True  # Force re-extraction

    # Check dependencies
    try:
        import websocket
    except ImportError:
        raise Exception("websocket-client not installed. Install: pip install websocket-client")

    # Get meetings
    print("Fetching meetings list...")
    meetings = get_meetings_to_extract(
        since_date=args.since,
        on_date=args.on_date,
        all_meetings=args.all,
        ids=args.ids,
        force=args.force
    )

    print(f"Found {len(meetings)} meetings to extract\n")

    if not meetings:
        print("No new meetings found matching criteria")
        return 0

    # Launch Granola with debugging
    ws_url = launch_granola_with_debugging()

    # Wait for store to be ready
    print("Waiting for Granola store to load...")
    for i in range(30):
        time.sleep(1)
        check_js = "window.__GRANOLA__ && window.__GRANOLA__.useCacheStore ? 'ready' : 'waiting'"
        result = execute_js(ws_url, check_js)
        if result == 'ready':
            print("Store ready")
            break
        if i % 5 == 0:
            print(f"  Still waiting... ({i+1}/30)")

    # Load manifest for tracking
    manifest = load_manifest()

    # Extract each meeting
    success_count = 0
    extracted_files = []

    for i, meeting in enumerate(meetings, 1):
        meeting_id = meeting['id']
        title = meeting.get('title', 'Untitled')

        print(f"\n[{i}/{len(meetings)}] {title}")

        # Navigate to meeting to load transcript into store (if not already loaded)
        print(f"  Loading transcript...")
        if navigate_to_meeting(ws_url, meeting_id):
            # Extract from store with metadata
            result = extract_transcript_automated(ws_url, meeting_id, meeting)
            if result:
                filepath, filename = result
                success_count += 1
                extracted_files.append(filepath)
                # Add to manifest
                from datetime import datetime
                manifest[meeting_id] = {
                    'title': title,
                    'filename': filename,
                    'extracted_at': datetime.now().isoformat()
                }
            else:
                print(f"  Transcript loaded but extraction failed")
        else:
            print(f"  Could not load transcript into store")

        time.sleep(1)  # Brief pause between meetings

    # Save updated manifest
    save_manifest(manifest)

    print(f"\n{'='*70}")
    print(f"Extraction complete: {success_count}/{len(meetings)} successful")
    print(f"Transcripts saved to: .ai/local/private_transcripts/")
    print(f"{'='*70}")

    # Run Gemini processing if requested or if API key is available
    if extracted_files and not args.no_gemini:
        if args.with_gemini or os.environ.get('GEMINI_API_KEY'):
            run_gemini_processing(extracted_files, force=args.force)

    return 0

script_run(name='granola-auto-extract-all', mode='operational', main=main, services=['google', 'granola'])
