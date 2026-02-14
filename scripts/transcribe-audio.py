#!/usr/bin/env python3
"""
Transcribe audio file with speaker identification using Google Cloud Speech-to-Text

Requires:
    pip install google-cloud-speech

Setup:
    1. Enable Speech-to-Text API in Google Cloud Console
    2. Create service account and download JSON key
    3. Set GOOGLE_APPLICATION_CREDENTIALS environment variable:
       export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
    4. Or authenticate: gcloud auth application-default login

Usage:
    python transcribe-audio.py /path/to/audio.m4a
    python transcribe-audio.py /path/to/audio.m4a --output transcript.md
"""

import argparse
import sys
import os
import subprocess
import tempfile
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

try:
    from google.cloud import speech
    from google.cloud import storage
except ImportError:
    print("Error: google-cloud-speech not installed")
    print("Install: pip install google-cloud-speech google-cloud-storage")
    raise


def convert_to_wav(input_path, output_path=None, compress=False):
    """Convert audio file to WAV format (16kHz mono) for better compatibility"""
    if output_path is None:
        output_path = str(Path(input_path).with_suffix('.wav'))

    print(f"Converting {input_path} to WAV format...")
    cmd = [
        'ffmpeg', '-i', input_path,
        '-ar', '16000',  # 16kHz sample rate
        '-ac', '1',      # Mono channel
    ]

    # Add compression for large files
    if compress:
        cmd.extend(['-acodec', 'pcm_s16le', '-f', 'wav'])  # 16-bit PCM
    else:
        cmd.append('-y')  # Overwrite output

    cmd.append(output_path)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f"Error converting audio: {result.stderr}")
        return None

    print(f"✓ Converted to: {output_path}")
    return output_path


def upload_to_gcs(file_path, bucket_name, credentials_path=None):
    """Upload file to Google Cloud Storage"""
    try:
        from google.oauth2 import service_account

        if credentials_path and os.path.exists(credentials_path):
            credentials = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            storage_client = storage.Client(credentials=credentials)
        else:
            storage_client = storage.Client()

        # Get or create bucket
        try:
            bucket = storage_client.bucket(bucket_name)
            if not bucket.exists():
                bucket = storage_client.create_bucket(bucket_name, location='us')
        except:
            bucket = storage_client.bucket(bucket_name)

        # Upload file with increased timeout
        blob_name = f"transcription-{int(time.time())}-{os.path.basename(file_path)}"
        blob = bucket.blob(blob_name)

        # Use chunked upload for large files
        print(f"Uploading {os.path.getsize(file_path) / 1024 / 1024:.1f}MB to GCS...")
        blob.upload_from_filename(file_path, timeout=600)  # 10 minute timeout

        gcs_uri = f"gs://{bucket_name}/{blob_name}"
        print(f"✓ Uploaded to: {gcs_uri}")
        return gcs_uri
    except Exception as e:
        print(f"Warning: Could not upload to GCS: {e}")
        return None


def transcribe_with_speakers(audio_path, language_code='en-US', credentials_path=None, use_gcs=False, bucket_name=None):
    """Transcribe audio with speaker diarization"""

    try:
        from google.oauth2 import service_account
        from google.auth import default
        import google.auth.transport.requests

        # Try to use provided credentials or default
        if credentials_path and os.path.exists(credentials_path):
            credentials = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            client = speech.SpeechClient(credentials=credentials)
        else:
            # Try default credentials
            client = speech.SpeechClient()
    except Exception as e:
        if 'credentials' in str(e).lower() or 'authentication' in str(e).lower():
            print("\n❌ Google Cloud authentication required!")
            print("\nSetup options:")
            print("1. Set service account key:")
            print("   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json")
            print("   OR use --credentials /path/to/service-account-key.json")
            print("\n2. Or use gcloud:")
            print("   gcloud auth application-default login")
            print("\n3. Enable Speech-to-Text API:")
            print("   https://console.cloud.google.com/apis/library/speech.googleapis.com")
            raise
        raise

    # Check file size - if >10MB, use GCS
    file_size = os.path.getsize(audio_path)
    max_size = 10 * 1024 * 1024  # 10MB

    if file_size > max_size or use_gcs:
        if not bucket_name:
            # Extract bucket name from project ID in credentials
            if credentials_path:
                import json
                with open(credentials_path) as f:
                    creds_data = json.load(f)
                    project_id = creds_data.get('project_id', 'speech-transcription-temp')
            else:
                project_id = 'speech-transcription-temp'
            bucket_name = f"{project_id}-audio-files"

        print(f"File size ({file_size / 1024 / 1024:.1f}MB) exceeds limit, uploading to GCS...")
        gcs_uri = upload_to_gcs(audio_path, bucket_name, credentials_path)
        if not gcs_uri:
            raise Exception("Failed to upload to GCS and file is too large for direct upload")

        audio = speech.RecognitionAudio(uri=gcs_uri)
    else:
        # Read audio file for small files
        with open(audio_path, 'rb') as audio_file:
            content = audio_file.read()
        audio = speech.RecognitionAudio(content=content)

    # Configure recognition with speaker diarization
    # Note: Speaker diarization requires separate config
    diarization_config = speech.SpeakerDiarizationConfig(
        enable_speaker_diarization=True,
        min_speaker_count=1,
        max_speaker_count=2,  # Adjust if you know the number of speakers
    )

    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=16000,
        language_code=language_code,
        enable_automatic_punctuation=True,
        model='latest_long',  # Best for longer conversations
        use_enhanced=True,  # Use enhanced model for better accuracy
        diarization_config=diarization_config,
    )

    print("Sending to Google Cloud Speech-to-Text API...")
    print("(This may take a few minutes for longer recordings)")

    # Perform transcription
    operation = client.long_running_recognize(config=config, audio=audio)

    print("Waiting for transcription to complete...")
    response = operation.result(timeout=600)  # 10 minute timeout

    return response


def format_transcript(response, speaker_names=None):
    """Format transcript with speaker labels"""

    # Group words by speaker
    speaker_segments = {}

    for result in response.results:
        if not result.alternatives:
            continue

        for word_info in result.alternatives[0].words:
            speaker_tag = word_info.speaker_tag
            if speaker_tag not in speaker_segments:
                speaker_segments[speaker_tag] = []

            speaker_segments[speaker_tag].append({
                'word': word_info.word,
                'start_time': word_info.start_time.total_seconds(),
                'end_time': word_info.end_time.total_seconds(),
            })

    # Build formatted transcript
    lines = []
    lines.append("---")
    lines.append(f"transcribed_at: {datetime.now().isoformat()}")
    lines.append(f"source: google-cloud-speech-to-text")
    lines.append(f"speakers: {len(speaker_segments)}")
    lines.append("---")
    lines.append("")

    # Sort by start time and group into sentences
    all_words = []
    for speaker_tag, words in speaker_segments.items():
        for word in words:
            all_words.append({
                **word,
                'speaker': speaker_tag
            })

    all_words.sort(key=lambda x: x['start_time'])

    # Group into sentences by speaker
    current_speaker = None
    current_sentence = []
    current_start = None

    for word in all_words:
        if current_speaker != word['speaker']:
            # New speaker - finish previous sentence
            if current_sentence:
                speaker_name = speaker_names.get(current_speaker, f"Speaker {current_speaker}") if speaker_names else f"Speaker {current_speaker}"
                text = ' '.join(current_sentence)
                lines.append(f"**{speaker_name}:** {text}")
                lines.append("")

            current_speaker = word['speaker']
            current_sentence = [word['word']]
            current_start = word['start_time']
        else:
            # Same speaker - continue sentence
            current_sentence.append(word['word'])

    # Add final sentence
    if current_sentence:
        speaker_name = speaker_names.get(current_speaker, f"Speaker {current_speaker}") if speaker_names else f"Speaker {current_speaker}"
        text = ' '.join(current_sentence)
        lines.append(f"**{speaker_name}:** {text}")

    return '\n'.join(lines)


def main(ctx):
    parser = argparse.ArgumentParser(description='Transcribe audio with speaker identification')
    parser.add_argument('audio_file', help='Path to audio file (m4a, mp3, wav, etc.)')
    parser.add_argument('--output', '-o', help='Output file path (default: {audio_file}.md)')
    parser.add_argument('--language', default='en-US', help='Language code (default: en-US)')
    parser.add_argument('--speaker1', help='Name for Speaker 1')
    parser.add_argument('--speaker2', help='Name for Speaker 2')
    parser.add_argument('--no-convert', action='store_true', help='Skip audio conversion (file must be WAV 16kHz mono)')
    parser.add_argument('--credentials', help='Path to Google Cloud service account JSON key file')
    parser.add_argument('--bucket', help='GCS bucket name for large files (auto-created if needed)')

    args = parser.parse_args(ctx.args)

    audio_path = Path(args.audio_file)
    if not audio_path.exists():
        raise Exception(f"Audio file not found: {audio_path}")

    # Convert to WAV if needed
    temp_wav = None
    if not args.no_convert and audio_path.suffix.lower() != '.wav':
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            # Check file size - compress if large
            file_size = audio_path.stat().st_size
            compress = file_size > 10 * 1024 * 1024  # >10MB
            wav_path = convert_to_wav(str(audio_path), tmp.name, compress=compress)
            if not wav_path:
                raise Exception("Failed to convert audio to WAV")
            temp_wav = wav_path
    else:
        temp_wav = str(audio_path)

    try:
        # Transcribe
        response = transcribe_with_speakers(temp_wav, args.language, args.credentials, bucket_name=args.bucket)

        # Format transcript
        speaker_names = {}
        if args.speaker1:
            speaker_names[1] = args.speaker1
        if args.speaker2:
            speaker_names[2] = args.speaker2

        transcript = format_transcript(response, speaker_names)

        # Save output
        if args.output:
            output_path = Path(args.output)
        else:
            output_path = audio_path.with_suffix('.md')

        output_path.write_text(transcript, encoding='utf-8')

        print(f"\n✓ Transcript saved to: {output_path}")
        print(f"  Length: {len(transcript)} characters")

    finally:
        # Clean up temp file if we created one
        if not args.no_convert and audio_path.suffix.lower() != '.wav' and temp_wav and temp_wav != str(audio_path):
            try:
                os.unlink(temp_wav)
            except:
                pass


run(name='transcribe-audio', mode='operational', main=main, services=['google'])
