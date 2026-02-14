#!/usr/bin/env python3
"""
Gemini Transcript Processor

Processes meeting transcripts with Gemini to:
1. Generate tags and topics for the meeting
2. Correct participant names using team-members.json
3. Detect likely attendees based on names mentioned in transcript
4. Build a searchable index manifest for easy agent access

Usage:
    python gemini-transcript-processor.py <transcript_file>
    python gemini-transcript-processor.py --backfill  # Process all existing transcripts
    python gemini-transcript-processor.py --since 2025-11-01  # Process since date
    python gemini-transcript-processor.py --rebuild-index  # Rebuild index from all transcripts

Requires:
    - GEMINI_API_KEY or GOOGLE_API_KEY environment variable
    - google-genai package: pip install google-genai

Index:
    Creates/updates .ai/local/private_transcripts/.transcript-index.json
    Agents can load this file to quickly search meetings by:
    - attendees, tags, topics, date, title, summary
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run as script_run

try:
    from google import genai
except ImportError:
    raise RuntimeError("google-genai not installed. Install: pip install google-genai")


def lookup_calendar_attendees(timestamp: str, title_hint: str = None) -> List[str]:
    """
    Look up calendar attendees for a meeting at a given time.

    Uses the calendar-attendee-resolver.cjs script to query Google Calendar
    and find attendees from the matching calendar event.

    Falls back to empty list if:
    - No matching calendar event found
    - Calendar API not authorized
    - Script execution fails

    Args:
        timestamp: ISO timestamp of when the meeting started
        title_hint: Optional meeting title to help match the right event

    Returns:
        List of attendee names from calendar, or empty list if not found
    """
    script_dir = Path(__file__).parent
    resolver_script = script_dir / 'calendar-attendee-resolver.cjs'

    if not resolver_script.exists():
        return []

    try:
        cmd = ['node', str(resolver_script), timestamp]
        if title_hint:
            cmd.extend(['--title', title_hint])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(script_dir.parent.parent)  # Run from pm/ directory
        )

        if result.returncode != 0:
            return []

        # Parse JSON output - extract just the JSON line (skip dotenv log lines)
        output = result.stdout.strip()
        if not output:
            return []

        # Find the JSON line (starts with '{')
        json_line = None
        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                json_line = line
                break

        if not json_line:
            return []

        data = json.loads(json_line)

        if data.get('matched') and data.get('attendees'):
            return data['attendees']

        return []

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        # Fail silently - calendar lookup is an enhancement, not critical
        return []


def get_script_dir() -> Path:
    """Get the directory containing this script"""
    return Path(__file__).parent


def get_transcripts_dir(custom_path: str = None) -> Path:
    """Get the transcripts directory"""
    if custom_path:
        return Path(custom_path)
    return get_script_dir().parent / 'local' / 'private_transcripts'


# Global to allow setting from main()
_custom_transcripts_dir = None


def get_index_path(transcripts_dir: Path = None) -> Path:
    """Get path to the transcript index file"""
    if transcripts_dir:
        return transcripts_dir / '.transcript-index.json'
    return get_transcripts_dir() / '.transcript-index.json'


def load_index(transcripts_dir: Path = None) -> dict:
    """Load the transcript index"""
    index_path = get_index_path(transcripts_dir)
    if index_path.exists():
        try:
            with open(index_path, 'r') as f:
                return json.load(f)
        except:
            pass
    return {
        "metadata": {
            "description": "Searchable index of meeting transcripts for agent access",
            "last_updated": None,
            "total_meetings": 0
        },
        "meetings": {}
    }


def save_index(index: dict, transcripts_dir: Path = None) -> None:
    """Save the transcript index"""
    index_path = get_index_path(transcripts_dir)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index['metadata']['last_updated'] = datetime.now().isoformat()
    index['metadata']['total_meetings'] = len(index['meetings'])
    with open(index_path, 'w') as f:
        json.dump(index, f, indent=2)


def update_index_entry(index: dict, granola_id: str, entry: dict) -> None:
    """Update a single entry in the index"""
    index['meetings'][granola_id] = entry


def load_team_members() -> dict:
    """Load team members from config for name correction"""
    config_path = get_script_dir().parent / 'config' / 'team-members.json'

    if not config_path.exists():
        print(f"Warning: team-members.json not found at {config_path}")
        return {}

    with open(config_path, 'r') as f:
        data = json.load(f)

    # Build a list of all team member names and common variations
    team_members = {}

    def extract_names(obj, path=""):
        """Recursively extract all names from the team structure"""
        if isinstance(obj, dict):
            # Check for name field
            if 'name' in obj:
                name = obj['name']
                # Store the canonical name
                team_members[name.lower()] = name
                # Also store first name only
                first_name = name.split()[0].lower()
                if first_name not in team_members:
                    team_members[first_name] = name

            # Check for specific named keys
            for key, value in obj.items():
                if key in ['lead', 'pm', 'tech_lead', 'head', 'vp', 'ceo', 'cto']:
                    if isinstance(value, str):
                        team_members[value.lower()] = value
                        first_name = value.split()[0].lower()
                        if first_name not in team_members:
                            team_members[first_name] = value
                elif isinstance(value, (dict, list)):
                    extract_names(value, f"{path}.{key}")
        elif isinstance(obj, list):
            for item in obj:
                extract_names(item, path)

    extract_names(data)
    return team_members


def build_name_correction_map(team_members: dict) -> dict:
    """Build a map of common transcription errors to correct names"""
    corrections = {}

    # Known transcription errors
    known_errors = {
        # Dheeraj variations
        'derat': 'Dheeraj',
        'deraj': 'Dheeraj',
        'dheraj': 'Dheeraj',
        'diraj': 'Dheeraj',
        'deeraj': 'Dheeraj',
        # Kyler variations
        'kylar': 'Kyler',
        'kylor': 'Kyler',
        'tyler': 'Kyler',  # Common mishearing
        # Arjun variations
        'arjoon': 'Arjun',
        'arjuan': 'Arjun',
        # Abhijay variations
        'abijay': 'Abhijay',
        'abhi': 'Abhijay',
        # Rohini variations
        'rohani': 'Rohini',
        'rohinee': 'Rohini',
        # Lucas variations
        'lukas': 'Lucas',
        # Common general errors
        'felicia': 'Felisha',
        'crayen': 'Crayon',
    }

    # Add known errors
    for error, correct in known_errors.items():
        # Find the full name from team members if possible
        correct_lower = correct.lower()
        if correct_lower in team_members:
            corrections[error] = team_members[correct_lower]
        else:
            # Look for it as a first name
            for full_name in team_members.values():
                if full_name.split()[0].lower() == correct_lower:
                    corrections[error] = full_name
                    break
            else:
                corrections[error] = correct

    return corrections


def initialize_gemini() -> genai.Client:
    """Initialize the Gemini client"""
    # The google-genai client checks both GOOGLE_API_KEY and GEMINI_API_KEY
    api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set")

    # Create client with API key
    return genai.Client(api_key=api_key)


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content"""
    if not content.startswith('---'):
        return {}, content

    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}, content

    frontmatter_str = parts[1].strip()
    body = parts[2].strip()

    # Simple YAML parsing
    frontmatter = {}
    current_key = None
    current_list = None

    for line in frontmatter_str.split('\n'):
        line = line.rstrip()

        # Check for list item
        if line.startswith('  - '):
            if current_key and current_list is not None:
                value = line[4:].strip().strip('"')
                current_list.append(value)
            continue

        # Check for key: value
        if ':' in line:
            # Save current list if any
            if current_key and current_list is not None:
                frontmatter[current_key] = current_list

            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            if value == '':
                # Start of a list
                current_key = key
                current_list = []
            else:
                current_key = None
                current_list = None
                frontmatter[key] = value.strip('"')

    # Save final list if any
    if current_key and current_list is not None:
        frontmatter[current_key] = current_list

    return frontmatter, body


def generate_frontmatter(frontmatter: dict) -> str:
    """Generate YAML frontmatter string"""
    lines = ['---']
    for key, value in frontmatter.items():
        if isinstance(value, list):
            lines.append(f'{key}:')
            for item in value:
                escaped = str(item).replace('"', '\\"')
                lines.append(f'  - "{escaped}"')
        elif isinstance(value, str) and (' ' in value or ':' in value or '"' in value):
            escaped = value.replace('"', '\\"')
            lines.append(f'{key}: "{escaped}"')
        else:
            lines.append(f'{key}: {value}')
    lines.append('---')
    return '\n'.join(lines)


def process_transcript_with_gemini(
    client: genai.Client,
    content: str,
    team_members: dict,
    name_corrections: dict,
    calendar_attendees: List[str] = None
) -> dict:
    """
    Process a transcript with Gemini to extract:
    - tags: categorical labels for the meeting
    - topics: specific subjects discussed
    - detected_attendees: people likely in the meeting based on transcript
    - corrected_names: any name corrections applied

    If calendar_attendees is provided, Gemini uses this authoritative list to:
    - Map "Speaker A/B/C" to actual attendee names
    - Better attribute statements to the correct people
    - Make more accurate name corrections
    """

    # Build the team members list for the prompt
    team_names = sorted(set(team_members.values()))
    team_names_str = ', '.join(team_names[:50])  # Limit for prompt size

    # Build calendar attendees context if available
    calendar_context = ""
    if calendar_attendees:
        calendar_context = f"""
IMPORTANT - CONFIRMED MEETING ATTENDEES (from calendar):
{', '.join(calendar_attendees)}

Use this authoritative attendee list to:
- Map "Speaker A", "Speaker B", etc. to actual names when context makes it clear
- Attribute statements to the correct people based on their likely roles
- Prioritize these names for the detected_attendees output
- These people were DEFINITELY in the meeting, so include them in detected_attendees

"""

    prompt = f"""{calendar_context}Analyze this meeting transcript and provide:

1. TAGS: 3-5 categorical labels for the type of meeting. Choose from:
   - 1:1 (one-on-one meeting)
   - team-sync (team standup or sync)
   - planning (roadmap, sprint, release planning)
   - design-review (UI/UX review)
   - technical (architecture, code, debugging)
   - strategy (business strategy, product strategy)
   - customer (customer interview, feedback)
   - interview (job interview, candidate call)
   - external (investor, partner, vendor)
   - retrospective (retro, post-mortem)
   - all-hands (company-wide meeting)
   - onboarding (new employee onboarding)
   - career (career development, mentoring)

2. TOPICS: 3-7 specific subjects discussed in the meeting. Be specific and concise.
   Examples: "Q1 roadmap prioritization", "iOS app performance issues", "Call Guard feature launch"

3. DETECTED ATTENDEES: Based on the conversation, who seems to be participating?
   Look for:
   - First-person statements and responses
   - People being directly addressed
   - Context clues about who is speaking

   Known team members: {team_names_str}

4. NAME CORRECTIONS: Identify any names that appear to be transcription errors.
   Common errors include phonetic mishearings like "Derat" for "Dheeraj".

5. ACTION ITEMS: Extract any follow-up tasks, commitments, or next steps mentioned.
   Format each as: "Person: task description" (e.g., "Vincent: update the API docs")
   Only include concrete, actionable items with a clear owner if mentioned.
   Return empty array if no clear action items.

6. KEY DECISIONS: Extract any decisions that were made or agreed upon.
   Be specific about what was decided (e.g., "Will use Redis for caching instead of Memcached")
   Only include actual decisions, not discussions or options considered.
   Return empty array if no clear decisions.

Return ONLY valid JSON in this exact format:
{{
  "tags": ["tag1", "tag2", "tag3"],
  "topics": ["topic 1", "topic 2", "topic 3"],
  "detected_attendees": ["Name 1", "Name 2"],
  "name_corrections": {{"wrong_name": "correct_name"}},
  "meeting_summary": "One sentence summary of the meeting purpose",
  "action_items": ["Person: task description"],
  "key_decisions": ["Decision that was made"]
}}

TRANSCRIPT:
{content[:15000]}
"""

    # Retry configuration for rate limiting
    max_retries = 5
    base_delay = 2  # seconds

    for attempt in range(max_retries):
        try:
            # Use the new google-genai client API
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )
            response_text = response.text.strip()
            break  # Success, exit retry loop
        except Exception as e:
            error_str = str(e)
            # Check for rate limiting (429) or resource exhausted
            if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str or 'rate' in error_str.lower():
                if attempt < max_retries - 1:
                    # Exponential backoff: 2, 4, 8, 16, 32 seconds
                    delay = base_delay * (2 ** attempt)
                    print(f"  ⏳ Rate limited, waiting {delay}s before retry ({attempt + 1}/{max_retries})...")
                    import time
                    time.sleep(delay)
                    continue
            # For non-rate-limit errors or final retry, re-raise
            raise
    else:
        # All retries exhausted
        print(f"  Error: Rate limit exceeded after {max_retries} retries")
        return {}

    try:
        # Extract JSON from response (handle markdown code blocks)
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0]
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0]

        result = json.loads(response_text.strip())

        # Normalize attendee names using our team members list
        if 'detected_attendees' in result:
            corrected_attendees = []
            for name in result['detected_attendees']:
                name_lower = name.lower()
                # Check for direct match
                if name_lower in team_members:
                    corrected_attendees.append(team_members[name_lower])
                # Check for known corrections
                elif name_lower in name_corrections:
                    corrected_attendees.append(name_corrections[name_lower])
                else:
                    # Try first name match
                    first = name.split()[0].lower()
                    if first in team_members:
                        corrected_attendees.append(team_members[first])
                    elif first in name_corrections:
                        corrected_attendees.append(name_corrections[first])
                    else:
                        corrected_attendees.append(name)

            result['detected_attendees'] = list(set(corrected_attendees))

        return result

    except json.JSONDecodeError as e:
        print(f"  Warning: Failed to parse Gemini response as JSON: {e}")
        return {}
    except Exception as e:
        print(f"  Error calling Gemini: {e}")
        return {}


def apply_name_corrections(content: str, name_corrections: dict) -> str:
    """Apply name corrections to the transcript content"""
    corrected = content

    for wrong, correct in name_corrections.items():
        # Skip if either value is None or empty
        if not wrong or not correct:
            continue
        # Case-insensitive replacement with word boundaries
        pattern = re.compile(rf'\b{re.escape(str(wrong))}\b', re.IGNORECASE)
        corrected = pattern.sub(str(correct), corrected)

    return corrected


def build_index_entry(filepath: Path, frontmatter: dict, body: str) -> dict:
    """Build an index entry for a transcript"""

    # Extract date from frontmatter or filename
    date = frontmatter.get('created_at', '')
    if not date:
        match = re.match(r'(\d{4}-\d{2}-\d{2})', filepath.name)
        if match:
            date = match.group(1)

    # Parse date for sorting
    date_sort = ''
    if date:
        try:
            if 'T' in date:
                dt = datetime.fromisoformat(date.replace('Z', '+00:00'))
            else:
                dt = datetime.fromisoformat(date)
            date_sort = dt.strftime('%Y-%m-%d %H:%M')
        except:
            date_sort = date[:10] if len(date) >= 10 else date

    entry = {
        "file": filepath.name,
        "title": frontmatter.get('title', filepath.stem),
        "date": date_sort,
        "created_at": frontmatter.get('created_at', ''),
        "summary": frontmatter.get('summary', ''),
        "tags": frontmatter.get('tags', []),
        "topics": frontmatter.get('topics', []),
        "attendees": frontmatter.get('detected_attendees', []),
        "attendee_source": frontmatter.get('attendee_source', ''),
        "action_items": frontmatter.get('action_items', []),
        "key_decisions": frontmatter.get('key_decisions', []),
        "calendar_participants": frontmatter.get('participants', '').split(', ') if frontmatter.get('participants') else [],
        "gemini_processed": frontmatter.get('gemini_processed') == 'true',
        "word_count": len(body.split()),
    }

    # Add searchable text (lowercase for easy matching)
    searchable = ' '.join([
        entry['title'].lower(),
        entry['summary'].lower(),
        ' '.join(t.lower() for t in entry['tags']),
        ' '.join(t.lower() for t in entry['topics']),
        ' '.join(a.lower() for a in entry['attendees']),
        ' '.join(a.lower() for a in entry['calendar_participants']),
    ])
    entry['_searchable'] = searchable

    return entry


def process_single_transcript(
    filepath: Path,
    client: genai.Client,
    team_members: dict,
    name_corrections: dict,
    index: dict,
    force: bool = False
) -> bool:
    """Process a single transcript file"""

    print(f"\nProcessing: {filepath.name}")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    frontmatter, body = parse_frontmatter(content)

    granola_id = frontmatter.get('granola_id', filepath.stem)

    # Check if already processed (unless force)
    if not force and frontmatter.get('gemini_processed') == 'true':
        print("  ✓ Already processed (use --force to reprocess)")
        # Still update the index
        entry = build_index_entry(filepath, frontmatter, body)
        update_index_entry(index, granola_id, entry)
        return True

    # Try to get authoritative attendees from Google Calendar
    calendar_attendees = []
    created_at = frontmatter.get('created_at', '')
    title = frontmatter.get('title', '')

    if created_at:
        print("  Looking up calendar attendees...")
        calendar_attendees = lookup_calendar_attendees(created_at, title)
        if calendar_attendees:
            # Skip calendar attendees if it looks like a large event (webinar, all-hands, etc.)
            # These are likely wrong matches and pollute the attendee data
            if len(calendar_attendees) > 20:
                print(f"  📅 Skipping calendar data ({len(calendar_attendees)} attendees - likely wrong event match)")
                calendar_attendees = []
            else:
                print(f"  📅 Calendar attendees: {', '.join(calendar_attendees)}")
        else:
            print("  📅 No matching calendar event found, will use Gemini detection")

    # Call Gemini (pass calendar attendees for better context)
    print("  Calling Gemini for analysis...")
    result = process_transcript_with_gemini(
        client, body, team_members, name_corrections,
        calendar_attendees=calendar_attendees if calendar_attendees else None
    )

    if not result:
        print("  ✗ Failed to get Gemini analysis")
        return False

    # Apply name corrections to the body
    all_corrections = {**name_corrections}
    if result.get('name_corrections'):
        all_corrections.update(result['name_corrections'])

    corrected_body = apply_name_corrections(body, all_corrections)
    corrections_applied = body != corrected_body

    # Update frontmatter
    frontmatter['gemini_processed'] = 'true'
    frontmatter['gemini_processed_at'] = datetime.now().isoformat()

    if result.get('tags'):
        frontmatter['tags'] = result['tags']
        print(f"  Tags: {', '.join(result['tags'])}")

    if result.get('topics'):
        frontmatter['topics'] = result['topics']
        print(f"  Topics: {', '.join(result['topics'][:3])}...")

    # Use calendar attendees as authoritative source if available
    # Fall back to Gemini detection if no calendar match
    if calendar_attendees:
        frontmatter['detected_attendees'] = calendar_attendees
        frontmatter['attendee_source'] = 'calendar'
        print(f"  Attendees (from calendar): {', '.join(calendar_attendees)}")
    elif result.get('detected_attendees'):
        frontmatter['detected_attendees'] = result['detected_attendees']
        frontmatter['attendee_source'] = 'gemini'
        print(f"  Attendees (from Gemini): {', '.join(result['detected_attendees'])}")

    if result.get('meeting_summary'):
        frontmatter['summary'] = result['meeting_summary']

    if result.get('name_corrections'):
        frontmatter['name_corrections_applied'] = json.dumps(result['name_corrections'])
        print(f"  Corrections: {result['name_corrections']}")

    if result.get('action_items'):
        frontmatter['action_items'] = result['action_items']
        print(f"  Action items: {len(result['action_items'])} found")

    if result.get('key_decisions'):
        frontmatter['key_decisions'] = result['key_decisions']
        print(f"  Key decisions: {len(result['key_decisions'])} found")

    # Write back the file
    new_frontmatter_str = generate_frontmatter(frontmatter)
    new_content = new_frontmatter_str + '\n\n' + corrected_body

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    # Update index
    entry = build_index_entry(filepath, frontmatter, corrected_body)
    update_index_entry(index, granola_id, entry)

    print(f"  ✓ Updated {filepath.name}")
    return True


def rebuild_index_from_files(transcripts_dir: Path) -> dict:
    """Rebuild the entire index from transcript files without calling Gemini"""
    print("\nRebuilding index from existing files...")

    index = {
        "metadata": {
            "description": "Searchable index of meeting transcripts for agent access",
            "last_updated": None,
            "total_meetings": 0
        },
        "meetings": {}
    }

    files = list(transcripts_dir.glob('*.md'))
    print(f"Found {len(files)} transcript files")

    for filepath in sorted(files):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            frontmatter, body = parse_frontmatter(content)
            granola_id = frontmatter.get('granola_id', filepath.stem)

            entry = build_index_entry(filepath, frontmatter, body)
            update_index_entry(index, granola_id, entry)

            print(f"  ✓ Indexed: {filepath.name}")
        except Exception as e:
            print(f"  ✗ Error indexing {filepath.name}: {e}")

    return index


def get_transcripts_to_process(
    since_date: Optional[str] = None,
    specific_file: Optional[str] = None,
    backfill: bool = False,
    transcripts_dir: Path = None
) -> list[Path]:
    """Get list of transcript files to process"""

    if transcripts_dir is None:
        transcripts_dir = get_transcripts_dir()

    if not transcripts_dir.exists():
        print(f"Error: Transcripts directory not found: {transcripts_dir}")
        return []

    if specific_file:
        filepath = Path(specific_file)
        if not filepath.exists():
            filepath = transcripts_dir / specific_file
        if filepath.exists():
            return [filepath]
        print(f"Error: File not found: {specific_file}")
        return []

    # Get all markdown files
    files = list(transcripts_dir.glob('*.md'))

    # Filter by date if specified
    if since_date and not backfill:
        try:
            cutoff = datetime.fromisoformat(since_date)
            filtered = []
            for f in files:
                # Try to get date from filename (YYYY-MM-DD format)
                match = re.match(r'(\d{4}-\d{2}-\d{2})', f.name)
                if match:
                    file_date = datetime.fromisoformat(match.group(1))
                    if file_date >= cutoff:
                        filtered.append(f)
            files = filtered
        except ValueError:
            print(f"Warning: Invalid date format: {since_date}")

    # Sort by name (which includes date)
    files.sort()

    return files


def main():
    parser = argparse.ArgumentParser(description="Process transcripts with Gemini")
    parser.add_argument('file', nargs='?', help='Specific transcript file to process')
    parser.add_argument('--backfill', action='store_true', help='Process all existing transcripts')
    parser.add_argument('--since', help='Process transcripts since date (YYYY-MM-DD)')
    parser.add_argument('--force', action='store_true', help='Reprocess already-processed files')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be processed')
    parser.add_argument('--rebuild-index', action='store_true', help='Rebuild index from files without calling Gemini')
    parser.add_argument('--transcripts-dir', help='Custom transcripts directory path')

    args = parser.parse_args()

    transcripts_dir = get_transcripts_dir(args.transcripts_dir)

    # Handle rebuild-index mode (no Gemini needed)
    if args.rebuild_index:
        index = rebuild_index_from_files(transcripts_dir)
        save_index(index, transcripts_dir)
        print(f"\n✓ Index saved with {len(index['meetings'])} meetings")
        print(f"  Location: {get_index_path(transcripts_dir)}")
        return

    # Load team members
    print("Loading team members...")
    team_members = load_team_members()
    print(f"  Loaded {len(team_members)} name variants")

    # Build name correction map
    name_corrections = build_name_correction_map(team_members)
    print(f"  Built {len(name_corrections)} known corrections")

    # Get files to process
    files = get_transcripts_to_process(
        since_date=args.since,
        specific_file=args.file,
        backfill=args.backfill,
        transcripts_dir=transcripts_dir
    )

    if not files:
        print("No files to process")
        return

    print(f"\nFound {len(files)} transcript(s) to process")

    if args.dry_run:
        for f in files:
            print(f"  Would process: {f.name}")
        return

    # Initialize Gemini
    print("\nInitializing Gemini...")
    try:
        client = initialize_gemini()
        print("  ✓ Gemini initialized")
    except ValueError as e:
        raise Exception(f"Gemini initialization failed: {e}")

    # Load existing index
    index = load_index(transcripts_dir)

    # Process each file
    success_count = 0
    for filepath in files:
        if process_single_transcript(filepath, client, team_members, name_corrections, index, args.force):
            success_count += 1

    # Save updated index
    save_index(index, transcripts_dir)

    print(f"\n{'='*60}")
    print(f"Processing complete: {success_count}/{len(files)} successful")
    print(f"Index updated: {get_index_path(transcripts_dir)}")
    print(f"{'='*60}")

    if success_count != len(files):
        raise Exception(f"Processing incomplete: {success_count}/{len(files)} successful")


if __name__ == "__main__":
    script_run(name='gemini-transcript-processor', mode='operational', main=lambda ctx: main(), services=['google', 'granola'])
