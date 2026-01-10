"""Video frame extraction service using ffmpeg."""

import subprocess
from pathlib import Path

from app.models.asset import Asset
from app.config import settings


async def extract_frames(asset: Asset, output_dir: Path = None) -> list[str]:
    """Extract frames from a video asset.
    
    Extracts first frame, last frame, and 1 frame per second.
    
    Args:
        asset: The video asset to extract frames from.
        output_dir: Directory to save frames. Defaults to temp_dir/frames.
        
    Returns:
        List of paths to extracted frame images.
    """
    if output_dir is None:
        output_dir = settings.temp_dir / "frames"
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    video_path = Path(asset.path)
    base_name = video_path.stem
    
    frame_paths = []
    
    # Extract first frame
    first_frame = output_dir / f"{base_name}_frame_001.jpg"
    await _extract_frame_at_time(video_path, first_frame, 0)
    if first_frame.exists():
        frame_paths.append(str(first_frame))
    
    # Get video duration to extract frames at 1 fps
    duration = await _get_video_duration(video_path)
    
    if duration and duration > 1:
        # Extract frames at 1 fps (starting from second 1)
        for i in range(1, int(duration)):
            frame_path = output_dir / f"{base_name}_frame_{i+1:03d}.jpg"
            await _extract_frame_at_time(video_path, frame_path, i)
            if frame_path.exists():
                frame_paths.append(str(frame_path))
        
        # Extract last frame
        last_frame = output_dir / f"{base_name}_frame_last.jpg"
        await _extract_frame_at_time(video_path, last_frame, duration - 0.1)
        if last_frame.exists():
            frame_paths.append(str(last_frame))
    
    return frame_paths


async def _extract_frame_at_time(video_path: Path, output_path: Path, time_seconds: float) -> None:
    """Extract a single frame at a specific time.
    
    Args:
        video_path: Path to the video file.
        output_path: Path to save the frame image.
        time_seconds: Time in seconds to extract the frame.
    """
    if output_path.exists():
        return  # Skip if already extracted
    
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output
        "-ss", str(time_seconds),  # Seek to time
        "-i", str(video_path),
        "-vframes", "1",  # Extract 1 frame
        "-q:v", "2",  # Quality (2 is high quality)
        str(output_path),
    ]
    
    try:
        subprocess.run(
            cmd,
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        # Frame extraction can fail for various reasons, log but don't raise
        print(f"Warning: Frame extraction failed at {time_seconds}s: {e.stderr}")
    except FileNotFoundError:
        # ffmpeg not installed - skip frame extraction silently
        print(f"Warning: ffmpeg not found. Skipping frame extraction for {video_path.name}")


async def _get_video_duration(video_path: Path) -> float:
    """Get video duration in seconds."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        # ffprobe not installed or failed - return default duration
        return 15.0  # Assume 15 second video
