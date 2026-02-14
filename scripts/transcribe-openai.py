#!/usr/bin/env python3
"""
Transcribe audio using OpenAI Whisper API

Requires:
    pip install openai

Usage:
    export OPENAI_API_KEY=your-key-here
    python transcribe-openai.py audio.m4a --speaker1 "Kyler" --speaker2 "Danji"
"""

import argparse
import sys
import os
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai not installed")
    print("Install: pip install openai")
    raise


def convert_to_mp3(input_path, output_path=None):
    """Convert audio to MP3 format (Whisper works best with common formats)"""
    if output_path is None:
        output_path = str(Path(input_path).with_suffix('.mp3'))

    print(f"Converting {input_path} to MP3 format...")
    cmd = [
        'ffmpeg', '-i', input_path,
        '-acodec', 'libmp3lame',
        '-ar', '16000',  # 16kHz sample rate
        '-ac', '1',      # Mono channel
        '-b:a', '64k',   # Bitrate
        '-y',            # Overwrite output
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f"Error converting audio: {result.stderr}")
        return None

    file_size = os.path.getsize(output_path) / 1024 / 1024
    print(f"✓ Converted to: {output_path} ({file_size:.1f}MB)")
    return output_path


def transcribe_with_openai(audio_path, api_key, language=None):
    """Transcribe audio using OpenAI Whisper API"""

    client = OpenAI(api_key=api_key)

    print("Uploading to OpenAI Whisper API...")
    print("(This may take a few minutes for longer recordings)")

    # Open audio file
    with open(audio_path, 'rb') as audio_file:
        # Use whisper-1 model
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language,  # Optional: 'en', 'zh', etc.
            response_format="verbose_json",  # Get timestamps
            timestamp_granularities=["segment"]  # Get segment-level timestamps
        )

    return transcript


def format_transcript(transcript, speaker1=None, speaker2=None):
    """Format transcript with timestamps"""

    lines = []
    lines.append("---")
    lines.append(f"transcribed_at: {datetime.now().isoformat()}")
    lines.append(f"source: openai-whisper")
    lines.append(f"model: whisper-1")
    lines.append("---")
    lines.append("")

    # Add full transcript
    lines.append("# Transcript")
    lines.append("")
    lines.append(transcript.text)
    lines.append("")

    # Add segments with timestamps if available
    if hasattr(transcript, 'segments') and transcript.segments:
        lines.append("## Segments")
        lines.append("")

        for i, segment in enumerate(transcript.segments):
            # Access attributes directly (Pydantic model)
            start_time = getattr(segment, 'start', 0) or 0
            end_time = getattr(segment, 'end', 0) or 0
            text = getattr(segment, 'text', '').strip() or ''

            # Format time
            start_min = int(start_time // 60)
            start_sec = int(start_time % 60)
            end_min = int(end_time // 60)
            end_sec = int(end_time % 60)

            lines.append(f"**[{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}]** {text}")
            lines.append("")

    return '\n'.join(lines)


def main(ctx):
    parser = argparse.ArgumentParser(description='Transcribe audio using OpenAI Whisper')
    parser.add_argument('audio_file', help='Path to audio file')
    parser.add_argument('--output', '-o', help='Output file path (default: {audio_file}.md)')
    parser.add_argument('--api-key', help='OpenAI API key (or set OPENAI_API_KEY env var)')
    parser.add_argument('--speaker1', help='Name for Speaker 1 (for future speaker diarization)')
    parser.add_argument('--speaker2', help='Name for Speaker 2 (for future speaker diarization)')
    parser.add_argument('--language', help='Language code (e.g., en, zh, es) - auto-detected if not specified')
    parser.add_argument('--no-convert', action='store_true', help='Skip audio conversion')

    args = parser.parse_args(ctx.args)

    # Get API key
    api_key = args.api_key or os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise Exception("OpenAI API key required. Set OPENAI_API_KEY environment variable or use --api-key")

    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        raise Exception(f"Audio file not found: {audio_path}")

    # Convert to MP3 if needed (Whisper accepts many formats, but MP3 is reliable)
    temp_mp3 = None
    if not args.no_convert and audio_path.suffix.lower() not in ['.mp3', '.m4a', '.wav', '.flac']:
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
            mp3_path = convert_to_mp3(str(audio_path), tmp.name)
            if not mp3_path:
                raise Exception("Failed to convert audio to MP3")
            temp_mp3 = mp3_path
    else:
        temp_mp3 = str(audio_path)

    try:
        # Transcribe
        transcript = transcribe_with_openai(temp_mp3, api_key, args.language)

        # Format transcript
        formatted = format_transcript(transcript, args.speaker1, args.speaker2)

        # Save output
        if args.output:
            output_path = Path(args.output)
        else:
            output_path = audio_path.with_suffix('.md')

        output_path.write_text(formatted, encoding='utf-8')

        print(f"\n✓ Transcript saved to: {output_path}")
        print(f"  Length: {len(transcript.text):,} characters")
        if hasattr(transcript, 'segments'):
            print(f"  Segments: {len(transcript.segments)}")

    finally:
        # Clean up temp file if we created one
        if not args.no_convert and audio_path.suffix.lower() not in ['.mp3', '.m4a', '.wav', '.flac'] and temp_mp3 and temp_mp3 != str(audio_path):
            try:
                os.unlink(temp_mp3)
            except:
                pass


run(name='transcribe-openai', mode='operational', main=main, services=['openai'])
