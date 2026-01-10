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
    # First try mdls (works on local indexed files)
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
    
    # Try Python MP4 parser for temp/unindexed files
    metadata = await _parse_mp4_dimensions(path)
    if metadata:
        return metadata
    
    # Final fallback - default dimensions
    print(f"Warning: Could not determine video dimensions for: {path.name}")
    return AssetMetadata(
        width=1080,
        height=1920,
        duration=15.0,
        aspect_ratio=1080 / 1920,
    )


async def _parse_mp4_dimensions(path: Path) -> Optional[AssetMetadata]:
    """Parse MP4/MOV file to extract video dimensions using pure Python."""
    import struct
    
    try:
        with open(path, 'rb') as f:
            # Read the file to find the 'tkhd' (track header) box
            data = f.read()
            
            # Look for 'moov' box first
            moov_pos = data.find(b'moov')
            if moov_pos == -1:
                return None
            
            # Search for 'tkhd' box within moov
            tkhd_pos = data.find(b'tkhd', moov_pos)
            if tkhd_pos == -1:
                return None
            
            # tkhd structure: version(1) + flags(3) + ... + width(4) + height(4) at fixed offsets
            # Version 0: width/height at offset 76-84 from box start
            # Version 1: width/height at offset 88-96 from box start
            
            # Get the box start (4 bytes before 'tkhd')
            box_start = tkhd_pos - 4
            version = data[tkhd_pos + 4]
            
            if version == 0:
                # Version 0: dimensions at offset 76 from content start (tkhd_pos + 4)
                dim_offset = tkhd_pos + 4 + 76  # = tkhd_pos + 80
            else:
                # Version 1: dimensions at offset 88 from content start (tkhd_pos + 4)
                dim_offset = tkhd_pos + 4 + 88  # = tkhd_pos + 92
            
            if dim_offset + 8 > len(data):
                return None
            
            # Width and height are stored as fixed-point 16.16 (4 bytes each)
            width_raw = struct.unpack('>I', data[dim_offset:dim_offset+4])[0]
            height_raw = struct.unpack('>I', data[dim_offset+4:dim_offset+8])[0]
            
            # Convert from fixed-point 16.16 to integer
            width = width_raw >> 16
            height = height_raw >> 16
            
            if width > 0 and height > 0:
                print(f"Parsed MP4 dimensions: {path.name} ({width}x{height})")
                return AssetMetadata(
                    width=width,
                    height=height,
                    duration=None,
                    aspect_ratio=width / height,
                )
    except Exception as e:
        print(f"MP4 parsing failed for {path.name}: {e}")
    
    return None
