import os
import sys
import time
import argparse
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.api_core import exceptions
from tqdm import tqdm

# --- CONFIGURATION ---
# Default frame interval in seconds
DEFAULT_INTERVAL = 5

# Maximum number of parallel workers for frame analysis
MAX_WORKERS = 10

# Instructions for frame analysis
FRAME_ANALYSIS_PROMPT = """
You are a highly accurate video frame analysis assistant. 
Your task is to analyze this video frame and describe what you see.

1. **Text Content**: Transcribe ALL visible text exactly as it appears (OCR). Include UI elements, buttons, labels, dialog boxes, etc.
2. **Visual Content**: Describe in detail:
   - What is on screen (UI elements, windows, applications, web pages, etc.)
   - Any notable visual changes or highlights
   - User interactions visible (cursor position, selections, etc.)
   - Overall context of what's happening
3. **Analysis**: Provide BOTH:
   a) A literal description of everything visible in the frame
   b) An interpretation of what action/task is being performed or what information is being shown

Your goal is that a reader of the markdown can understand exactly what was on screen at this moment.
"""

# Instructions for timeline generation
TIMELINE_PROMPT_TEMPLATE = """
You are creating a comprehensive timeline narrative of a video based on frame-by-frame analysis.

Below are detailed descriptions of frames captured every {interval} seconds from a video:

{frame_descriptions}

{transcript_section}

Your task:
1. Create a chronological narrative that flows naturally, describing what happened in the video
2. Identify key moments, transitions, and actions
3. Group related frames into coherent segments (don't just list each frame)
4. {sync_instruction}
5. Write in past tense, as if describing what happened in the video

Format as a detailed timeline with timestamps and clear descriptions of each segment.
"""

def check_ffmpeg():
    """Checks if ffmpeg is installed."""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=5)
        return True
    except FileNotFoundError:
        print("❌ Error: ffmpeg not found.")
        print("Install with: brew install ffmpeg")
        return False
    except Exception as e:
        print(f"❌ Error checking ffmpeg: {e}")
        return False

def get_api_key():
    """Gets the Gemini API key from environment or .zshrc."""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    # If not in environment, try to load from .zshrc
    if not api_key:
        try:
            # Source .zshrc and get the API key
            result = subprocess.run(
                ['zsh', '-c', 'source ~/.zshrc && echo $GOOGLE_API_KEY'],
                capture_output=True,
                text=True,
                timeout=5
            )
            api_key = result.stdout.strip()

            if not api_key:
                print("❌ Error: GOOGLE_API_KEY environment variable not found.")
                print("\nTo get a Google API key:")
                print("  1. Visit: https://aistudio.google.com/app/api-keys")
                print("  2. Create or copy your API key")
                print("  3. Add it to your ~/.zshrc file:")
                print("     echo 'export GOOGLE_API_KEY=\"your_key_here\"' >> ~/.zshrc")
                print("     source ~/.zshrc")
                print("\n  Or contact Kyler on Slack if you need help getting a key.")
                return None
        except Exception as e:
            print(f"❌ Error loading API key from .zshrc: {e}")
            print("\nTo get a Google API key:")
            print("  1. Visit: https://aistudio.google.com/app/api-keys")
            print("  2. Create or copy your API key")
            print("  3. Export it: export GOOGLE_API_KEY='your_key_here'")
            print("\n  Or contact Kyler on Slack if you need help getting a key.")
            return None

    return api_key


def create_client():
    """Creates and returns a Gemini API client."""
    api_key = get_api_key()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

def get_available_model(client, preferred_model):
    """Checks if the preferred model is available, otherwise suggests alternatives."""
    try:
        available_models = [m.name for m in client.models.list()]

        # Normalize names for comparison (remove 'models/' prefix if present)
        cleaned_available = [m.replace('models/', '') for m in available_models]

        if preferred_model in cleaned_available:
            return preferred_model

        # Try to find a close match or a good default
        print(f"⚠️ Model '{preferred_model}' not found. Available models:")
        for m in cleaned_available:
            print(f"  - {m}")

        # Fallbacks in order of preference
        fallbacks = [
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-2.0-flash-exp",
            "gemini-flash-latest"
        ]
        for fb in fallbacks:
            if fb in cleaned_available:
                print(f"🔄 Switching to available model: {fb}")
                return fb

        # If no exact match, try to find one that *contains* flash
        for m in cleaned_available:
            if "flash" in m and "latest" in m:
                print(f"🔄 Switching to available model: {m}")
                return m

        return preferred_model  # Return original and let it fail if no fallback found

    except Exception as e:
        print(f"⚠️ Could not list models to verify: {e}")
        return preferred_model

def extract_frames(video_path, output_dir, interval):
    """Extract frames from video using ffmpeg."""
    print(f"🎬 Extracting frames every {interval} seconds...")
    
    # Create frames subdirectory
    frames_dir = Path(output_dir) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"📁 Frames will be saved to: {frames_dir.absolute()}")
    
    # First, get video duration to estimate frame count
    duration_cmd = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(video_path)
    ]
    
    try:
        duration_result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=10)
        duration = float(duration_result.stdout.strip())
        estimated_frames = int(duration / interval)
        print(f"⏱️  Video duration: {int(duration)}s → Estimated frames: {estimated_frames}")
    except:
        estimated_frames = None
    
    # Use ffmpeg to extract frames
    # fps=1/interval means one frame every 'interval' seconds
    temp_pattern = str(frames_dir / "frame_%04d.png")
    
    cmd = [
        'ffmpeg',
        '-i', str(video_path),
        '-vf', f'fps=1/{interval}',
        '-q:v', '2',  # High quality
        '-progress', 'pipe:1',  # Enable progress output
        temp_pattern
    ]
    
    try:
        # Run ffmpeg (suppressing output for cleaner progress bars)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"❌ ffmpeg error: {result.stderr}")
            return []
            
    except subprocess.TimeoutExpired:
        print("❌ ffmpeg timed out (video might be too long)")
        return []
    except Exception as e:
        print(f"❌ Error running ffmpeg: {e}")
        return []
    
    # Get all extracted frames
    temp_frames = sorted(frames_dir.glob("frame_*.png"))
    
    if not temp_frames:
        print("❌ No frames were extracted")
        return []
    
    # Rename frames with timestamp format
    renamed_frames = []
    for idx in tqdm(range(len(temp_frames)), desc="Renaming frames", unit="frame", leave=True, dynamic_ncols=True, file=sys.stdout):
        frame_path = temp_frames[idx]
        timestamp_seconds = idx * interval
        minutes = timestamp_seconds // 60
        seconds = timestamp_seconds % 60
        new_name = f"{minutes:02d}m{seconds:02d}s.png"
        new_path = frames_dir / new_name
        frame_path.rename(new_path)
        renamed_frames.append(new_path)
    
    print(f"✅ Extracted {len(renamed_frames)} frames")
    return renamed_frames

def analyze_frame(client, frame_path, model_name):
    """Analyze a single frame using Gemini."""
    frame_name = frame_path.name

    try:
        # Upload the frame
        sample_file = client.files.upload(file=str(frame_path))

        # Wait for file to be active
        while sample_file.state.name == "PROCESSING":
            time.sleep(1)
            sample_file = client.files.get(name=sample_file.name)

        if sample_file.state.name == "FAILED":
            return f"[Failed to process frame {frame_name}]"

        # Generate analysis
        response = client.models.generate_content(
            model=model_name,
            contents=[FRAME_ANALYSIS_PROMPT, sample_file]
        )

        # Cleanup
        client.files.delete(name=sample_file.name)

        return response.text

    except Exception as e:
        return f"[Error analyzing frame {frame_name}: {str(e)}]"

def analyze_frame_safe(client, frame_index, frame_path, model_name, max_retries=3):
    """
    Thread-safe wrapper for analyze_frame with retry logic.
    Returns: (frame_index, frame_path, analysis_result, success_flag, error_log)
    """
    error_log = []

    for attempt in range(max_retries):
        try:
            analysis = analyze_frame(client, frame_path, model_name)

            # Check if the analysis indicates an error
            if analysis.startswith("[Error") or analysis.startswith("[Failed"):
                raise Exception(analysis)

            return (frame_index, frame_path, analysis, True, error_log)

        except Exception as e:
            wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
            error_msg = f"Frame {frame_path.name} attempt {attempt + 1}/{max_retries} failed: {str(e)}"
            error_log.append(error_msg)

            if attempt < max_retries - 1:
                time.sleep(wait_time)
            else:
                # Final failure
                analysis = f"[Error: Failed after {max_retries} attempts. Last error: {str(e)}]"
                return (frame_index, frame_path, analysis, False, error_log)

    # Should never reach here, but just in case
    return (frame_index, frame_path, "[Error: Unknown failure]", False, error_log)

def analyze_all_frames(client, frames, output_dir, model_name):
    """Analyze all frames in parallel and save to frame_analysis.md."""
    print(f"\n🔍 Analyzing {len(frames)} frames with Gemini AI (parallel processing)...")

    analysis_path = Path(output_dir) / "frame_analysis.md"

    # Dictionary to store results by frame index (prevents duplicates, ensures ordering)
    results = {}
    all_error_logs = []
    failed_frames = []

    # Process frames in parallel
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all frames with their index
        futures = {
            executor.submit(analyze_frame_safe, client, idx, frame_path, model_name): idx
            for idx, frame_path in enumerate(frames)
        }
        
        # Process completed futures with progress bar
        with tqdm(total=len(frames), desc="Analyzing frames", unit="frame", leave=True, dynamic_ncols=True, file=sys.stdout) as pbar:
            for future in as_completed(futures):
                frame_index, frame_path, analysis, success, error_log = future.result()
                
                # Store result by index
                results[frame_index] = {
                    'path': frame_path,
                    'analysis': analysis,
                    'success': success
                }
                
                # Collect error logs
                if error_log:
                    all_error_logs.extend(error_log)
                if not success:
                    failed_frames.append(frame_path.name)
                
                pbar.update(1)
    
    # Validate all frames were processed (check for dropped frames)
    expected_indices = set(range(len(frames)))
    actual_indices = set(results.keys())
    
    if expected_indices != actual_indices:
        missing = expected_indices - actual_indices
        raise RuntimeError(f"❌ Dropped frames detected! Missing indices: {sorted(missing)}")
    
    # Write results to markdown in correct order
    with open(analysis_path, "w", encoding="utf-8") as f:
        f.write("# Frame-by-Frame Analysis\n\n")
        
        for idx in sorted(results.keys()):
            result = results[idx]
            timestamp = result['path'].stem  # e.g., "00m05s"
            
            f.write(f"## {timestamp}\n\n")
            f.write(f"{result['analysis']}\n\n")
            f.write("---\n\n")
    
    # Print summary
    print(f"✅ Frame analysis saved to: {analysis_path}")
    
    if failed_frames:
        print(f"⚠️  {len(failed_frames)} frame(s) failed after retries: {', '.join(failed_frames)}")
    
    if all_error_logs:
        print(f"\n⚠️  Retry logs ({len(all_error_logs)} events):")
        for log in all_error_logs[:10]:  # Show first 10 to avoid spam
            print(f"   {log}")
        if len(all_error_logs) > 10:
            print(f"   ... and {len(all_error_logs) - 10} more")
    
    return analysis_path

def generate_timeline(client, analysis_path, output_dir, interval, transcript_path, model_name):
    """Generate comprehensive timeline from frame analyses."""
    print("\n📝 Generating timeline...")

    # Read frame analyses
    with open(analysis_path, 'r', encoding='utf-8') as f:
        frame_content = f.read()

    # Check content size and sample if needed to avoid context overflow
    # Rough heuristic: if over 200KB, sample keyframes
    content_size_kb = len(frame_content.encode('utf-8')) / 1024

    if content_size_kb > 200:
        print(f"   Large analysis detected ({content_size_kb:.0f}KB). Sampling keyframes...")
        # Extract frame sections and sample evenly
        frame_sections = frame_content.split('\n## Frame at ')
        if len(frame_sections) > 1:
            # Keep header + sample frames
            header = frame_sections[0]
            frames = frame_sections[1:]
            sample_size = min(60, len(frames))  # Max 60 frames
            step = max(1, len(frames) // sample_size)
            sampled_frames = [frames[i] for i in range(0, len(frames), step)]
            frame_descriptions = header + '\n## Frame at ' + '\n## Frame at '.join(sampled_frames)
            print(f"   Sampled {len(sampled_frames)} keyframes from {len(frames)} total frames")
        else:
            frame_descriptions = frame_content
    else:
        frame_descriptions = frame_content

    # Prepare transcript section if provided
    transcript_section = ""
    sync_instruction = "Focus on the visual progression and create a coherent narrative"

    if transcript_path:
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcript_content = f.read()
            transcript_section = f"\n**TRANSCRIPT:**\n{transcript_content}\n"
            sync_instruction = "Integrate the transcript with the visual timeline, syncing spoken content with what's happening on screen. Use timestamps from both to create a unified narrative"
        except Exception as e:
            print(f"⚠️ Could not read transcript: {e}")

    # Create timeline prompt
    timeline_prompt = TIMELINE_PROMPT_TEMPLATE.format(
        interval=interval,
        frame_descriptions=frame_descriptions,
        transcript_section=transcript_section,
        sync_instruction=sync_instruction
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=timeline_prompt
        )
        
        timeline_path = Path(output_dir) / "timeline.md"
        with open(timeline_path, "w", encoding="utf-8") as f:
            f.write("# Video Timeline\n\n")
            f.write(response.text)
        
        print(f"✅ Timeline saved to: {timeline_path}")
        return timeline_path
        
    except exceptions.ResourceExhausted as e:
        print(f"❌ Timeline generation failed: API quota exhausted")
        print(f"   Try again later or reduce frame interval to analyze fewer frames")
        return None
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error generating timeline: {error_msg}")
        if "context" in error_msg.lower() or "token" in error_msg.lower():
            print(f"   Try reducing frame interval (current: {interval}s) or use a shorter video")
        print(f"   Frame analysis is still available in: {analysis_path}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Convert video to detailed Markdown timeline using Gemini AI.")
    parser.add_argument("video", help="Path to video file (MP4)")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help=f"Frame capture interval in seconds (default: {DEFAULT_INTERVAL})")
    parser.add_argument("--transcript", help="Optional path to transcript file")
    parser.add_argument("--output", help="Output directory (default: video_name_analysis)")
    parser.add_argument("--model", default="gemini-2.0-flash", help="Gemini model to use")
    
    args = parser.parse_args()
    
    # Verify video exists
    video_path = Path(args.video)
    if not video_path.exists():
        print(f"❌ Video file not found: {args.video}")
        return
    
    # Check dependencies
    if not check_ffmpeg():
        return

    client = create_client()
    if not client:
        return

    # Select model
    model_name = get_available_model(client, args.model)
    
    # Determine output directory
    if args.output:
        output_dir = Path(args.output)
    else:
        # Create output directory in the same folder as the video
        output_dir = video_path.parent / f"{video_path.stem}_analysis"
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n🎥 Processing video: {video_path.name}")
    print(f"📁 Output directory: {output_dir}")
    print(f"⏱️  Frame interval: {args.interval}s")
    if args.transcript:
        print(f"📄 Transcript: {args.transcript}")
    
    # Step 1: Extract frames
    frames = extract_frames(video_path, output_dir, args.interval)
    if not frames:
        print("❌ Failed to extract frames")
        return
    
    # Step 2: Analyze frames
    analysis_path = analyze_all_frames(client, frames, output_dir, model_name)

    # Step 3: Generate timeline
    timeline_path = generate_timeline(
        client,
        analysis_path,
        output_dir,
        args.interval,
        args.transcript,
        model_name
    )
    
    if timeline_path:
        print("\n✅ Processing complete!")
        print(f"📁 All outputs saved to: {output_dir}")
        print(f"   - Frames: {output_dir}/frames/")
        print(f"   - Frame analysis: {analysis_path.name}")
        print(f"   - Timeline: {timeline_path.name}")
    else:
        print("\n⚠️ Processing completed with errors")

if __name__ == "__main__":
    main()

