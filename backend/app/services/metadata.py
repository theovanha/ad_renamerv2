"""Metadata extraction service."""

from pathlib import Path
from typing import Optional
import subprocess
import json

from PIL import Image

from app.models.asset import Asset, AssetMetadata, AssetType


async def extract_metadata(asset: Asset) -> AssetMetadata:
    """Extract metadata from an asset.
    
    Args:
        asset: The asset to extract metadata from.
        
    Returns:
        AssetMetadata with dimensions and duration.
    """
    path = Path(asset.path)
    
    if asset.asset_type == AssetType.IMAGE:
        return await _extract_image_metadata(path)
    else:
        return await _extract_video_metadata(path)


async def _extract_image_metadata(path: Path) -> AssetMetadata:
    """Extract metadata from an image file."""
    with Image.open(path) as img:
        width, height = img.size
        
    return AssetMetadata(
        width=width,
        height=height,
        aspect_ratio=width / height if height > 0 else 0,
    )


async def _extract_video_metadata(path: Path) -> AssetMetadata:
    """Extract metadata from a video file using ffprobe, with macOS fallback."""
    try:
        # Use ffprobe to get video info
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            str(path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")
        
        data = json.loads(result.stdout)
        
        # Find video stream
        video_stream = None
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                video_stream = stream
                break
        
        if not video_stream:
            raise ValueError("No video stream found")
        
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        
        # Get duration from format or stream
        duration = None
        if "format" in data and "duration" in data["format"]:
            duration = float(data["format"]["duration"])
        elif "duration" in video_stream:
            duration = float(video_stream["duration"])
        
        return AssetMetadata(
            width=width,
            height=height,
            duration=duration,
            aspect_ratio=width / height if height > 0 else 0,
        )
        
    except FileNotFoundError:
        # ffprobe not installed - try macOS mdls fallback
        return await _extract_video_metadata_macos(path)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse ffprobe output: {e}")


async def _extract_video_metadata_macos(path: Path) -> AssetMetadata:
    """Extract video metadata using macOS mdls command as fallback."""
    try:
        cmd = [
            "mdls",
            "-name", "kMDItemPixelWidth",
            "-name", "kMDItemPixelHeight",
            "-name", "kMDItemDurationSeconds",
            str(path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            width = None
            height = None
            duration = None
            
            for line in result.stdout.split('\n'):
                if 'kMDItemPixelWidth' in line and '=' in line:
                    val = line.split('=')[1].strip()
                    if val != '(null)':
                        width = int(val)
                elif 'kMDItemPixelHeight' in line and '=' in line:
                    val = line.split('=')[1].strip()
                    if val != '(null)':
                        height = int(val)
                elif 'kMDItemDurationSeconds' in line and '=' in line:
                    val = line.split('=')[1].strip()
                    if val != '(null)':
                        duration = float(val)
            
            if width and height:
                print(f"Using macOS metadata for video: {path.name} ({width}x{height})")
                return AssetMetadata(
                    width=width,
                    height=height,
                    duration=duration,
                    aspect_ratio=width / height if height > 0 else 0,
                )
    except Exception as e:
        print(f"macOS metadata extraction failed: {e}")
    
    # Final fallback - default dimensions
    print(f"Warning: Could not determine video dimensions for: {path.name}")
    return AssetMetadata(
        width=1080,
        height=1920,
        duration=15.0,
        aspect_ratio=1080 / 1920,
    )
