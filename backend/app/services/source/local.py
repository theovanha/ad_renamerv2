"""Local folder asset source implementation."""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from app.models.asset import Asset, AssetType
from app.services.source.base import AssetSource
from app.config import settings


# Supported file extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v"}


class LocalFolderSource(AssetSource):
    """Asset source that reads from a local folder."""
    
    def __init__(self, folder_path: str):
        """Initialize with a local folder path.
        
        Args:
            folder_path: Path to the folder containing assets.
        """
        self.folder_path = Path(folder_path)
        if not self.folder_path.exists():
            raise ValueError(f"Folder does not exist: {folder_path}")
        if not self.folder_path.is_dir():
            raise ValueError(f"Path is not a directory: {folder_path}")
        
        # Create thumbnails directory
        self.thumbs_dir = settings.temp_dir / "thumbnails"
        self.thumbs_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_asset_type(self, path: Path) -> Optional[AssetType]:
        """Determine asset type from file extension."""
        ext = path.suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            return AssetType.IMAGE
        if ext in VIDEO_EXTENSIONS:
            return AssetType.VIDEO
        return None
    
    async def list_assets(self) -> list[Asset]:
        """List all image and video assets in the folder."""
        assets = []
        
        for item in self.folder_path.iterdir():
            if item.is_file():
                asset_type = self._get_asset_type(item)
                if asset_type:
                    assets.append(Asset(
                        id=str(item.absolute()),
                        name=item.name,
                        path=str(item.absolute()),
                        asset_type=asset_type,
                        size_bytes=item.stat().st_size,
                    ))
        
        return assets
    
    async def get_asset_bytes(self, asset_id: str) -> bytes:
        """Read asset bytes from disk."""
        path = Path(asset_id)
        if not path.exists():
            raise FileNotFoundError(f"Asset not found: {asset_id}")
        return path.read_bytes()
    
    async def get_asset_path(self, asset_id: str) -> str:
        """Return the original local path."""
        return asset_id
    
    async def get_thumbnail_url(self, asset_id: str) -> str:
        """Generate and return a thumbnail URL.
        
        For images, copy to temp and return URL.
        For videos, use extracted frame or generate via macOS Quick Look.
        """
        path = Path(asset_id)
        asset_type = self._get_asset_type(path)
        
        if asset_type == AssetType.IMAGE:
            # Copy image to thumbnails directory for serving
            thumb_name = f"{path.stem}_thumb{path.suffix}"
            thumb_path = self.thumbs_dir / thumb_name
            
            if not thumb_path.exists():
                shutil.copy(path, thumb_path)
            
            return f"/temp/thumbnails/{thumb_name}"
        
        # For videos, check if frame was already extracted by ffmpeg
        frame_path = settings.temp_dir / "frames" / f"{path.stem}_frame_001.jpg"
        thumb_name = f"{path.stem}_thumb.png"
        thumb_path = self.thumbs_dir / thumb_name
        
        if frame_path.exists() and not thumb_path.exists():
            shutil.copy(frame_path, thumb_path)
        
        # If no thumbnail yet, try macOS Quick Look as fallback
        if not thumb_path.exists():
            await self._generate_video_thumbnail_macos(path, thumb_path)
        
        if thumb_path.exists():
            return f"/temp/thumbnails/{thumb_name}"
        
        return ""
    
    async def _generate_video_thumbnail_macos(self, video_path: Path, output_path: Path) -> None:
        """Generate video thumbnail using macOS Quick Look."""
        try:
            # qlmanage generates thumbnails in a temp location
            cmd = [
                "qlmanage",
                "-t",  # Generate thumbnail
                "-s", "200",  # Size 200px
                "-o", str(output_path.parent),  # Output directory
                str(video_path),
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=10)
            
            # qlmanage creates file with .png extension added to original name
            ql_output = output_path.parent / f"{video_path.name}.png"
            if ql_output.exists():
                shutil.move(ql_output, output_path)
        except Exception as e:
            print(f"Quick Look thumbnail generation failed: {e}")
