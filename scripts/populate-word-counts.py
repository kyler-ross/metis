#!/usr/bin/env python3
"""
Populate word_count column in analytics.db by counting words from Claude Code conversation files.
"""

import sqlite3
import json
import os
from pathlib import Path

def count_words_in_jsonl(file_path):
    """Count total words in a Claude Code conversation JSONL file."""
    total_words = 0

    try:
        with open(file_path, 'r') as f:
            for line in f:
                try:
                    msg = json.loads(line)
                    # Count words in message content
                    if isinstance(msg, dict):
                        content = msg.get('content', '')
                        if isinstance(content, str):
                            words = len(content.split())
                            total_words += words
                        elif isinstance(content, list):
                            for item in content:
                                if isinstance(item, dict) and 'text' in item:
                                    words = len(item['text'].split())
                                    total_words += words
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        pass

    return total_words

def main():
    db_path = Path.home() / '.pm-ai' / 'analytics.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get all Claude sessions
    cursor.execute("SELECT id FROM sessions WHERE source = 'claude'")
    claude_sessions = [row[0] for row in cursor.fetchall()]

    print(f"Found {len(claude_sessions)} Claude sessions to process...")

    updated = 0
    for session_id in claude_sessions:
        # Find the conversation file
        conv_file = Path.home() / '.claude' / 'projects' / '-Users-kyler-Documents-code-cloaked-pm' / f'{session_id}.jsonl'

        if conv_file.exists():
            word_count = count_words_in_jsonl(conv_file)

            if word_count > 0:
                cursor.execute(
                    "UPDATE sessions SET word_count = ? WHERE source = 'claude' AND id = ?",
                    (word_count, session_id)
                )
                updated += 1

                if updated % 10 == 0:
                    print(f"  Processed {updated} sessions...")

    conn.commit()
    conn.close()

    print(f"\n✓ Updated {updated} sessions with word counts")

    # Show summary
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(word_count) FROM sessions WHERE source = 'claude'")
    total_words = cursor.fetchone()[0] or 0
    conn.close()

    print(f"  Total words across all Claude sessions: {total_words:,}")

if __name__ == '__main__':
    main()
