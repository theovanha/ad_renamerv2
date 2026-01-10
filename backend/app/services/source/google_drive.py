"""Google Drive asset source implementation."""

import re
import io
import asyncio
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from app.models.asset import Asset, AssetType
from app.services.source.base import AssetSource
from app.config import settings


class GoogleDriveSource(AssetSource):
    """Asset source for Google Drive folders."""
    
    # Supported MIME types
    IMAGE_MIMES = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    VIDEO_MIMES = {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-msvideo": ".avi",
        "video/webm": ".webm",
    }
    
    def __init__(self, folder_id: str, credentials: Credentials):
        """Initialize Google Drive source.
        
        Args:
            folder_id: The Google Drive folder ID
            credentials: Google OAuth credentials
        """
        self.folder_id = folder_id
        self.credentials = credentials
        self.service = build("drive", "v3", credentials=credentials)
        
        # Local cache for downloaded files
        self.download_dir = settings.temp_dir / "drive_downloads"
        self.download_dir.mkdir(parents=True, exist_ok=True)
        
        # Cache of file metadata
        self._file_cache: dict[str, dict] = {}
    
    @classmethod
    def extract_folder_id(cls, url_or_id: str) -> str:
        """Extract folder ID from a Google Drive URL or return as-is if already an ID.
        
        Supports formats:
        - https://drive.google.com/drive/folders/FOLDER_ID
        - https://drive.google.com/drive/u/0/folders/FOLDER_ID
        - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
        - Just the folder ID
        """
        # If it looks like a URL, extract the ID
        if "drive.google.com" in url_or_id:
            # Try to extract folder ID from various URL formats
            patterns = [
                r"/folders/([a-zA-Z0-9_-]+)",
                r"id=([a-zA-Z0-9_-]+)",
            ]
            for pattern in patterns:
                match = re.search(pattern, url_or_id)
                if match:
                    return match.group(1)
            raise ValueError(f"Could not extract folder ID from URL: {url_or_id}")
        
        # Assume it's already a folder ID
        return url_or_id
    
    def _get_asset_type(self, mime_type: str) -> Optional[AssetType]:
        """Determine asset type from MIME type."""
        if mime_type in self.IMAGE_MIMES:
            return AssetType.IMAGE
        if mime_type in self.VIDEO_MIMES:
            return AssetType.VIDEO
        return None
    
    async def list_assets(self) -> list[Asset]:
        """List all supported assets in the Drive folder."""
        assets = []
        
        # Build query for images and videos
        mime_types = list(self.IMAGE_MIMES.keys()) + list(self.VIDEO_MIMES.keys())
        mime_query = " or ".join([f"mimeType='{mt}'" for mt in mime_types])
        query = f"'{self.folder_id}' in parents and ({mime_query}) and trashed=false"
        
        print(f"[DEBUG] Drive query: {query}")
        
        # Run in thread to avoid blocking
        def _list_files():
            results = []
            page_token = None
            
            try:
                while True:
                    # Include supportsAllDrives for Shared Drives
                    response = self.service.files().list(
                        q=query,
                        spaces="drive",
                        fields="nextPageToken, files(id, name, mimeType, thumbnailLink, size)",
                        pageToken=page_token,
                        pageSize=100,
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    ).execute()
                    
                    print(f"[DEBUG] Drive API response: {len(response.get('files', []))} files")
                    results.extend(response.get("files", []))
                    page_token = response.get("nextPageToken")
                    
                    if not page_token:
                        break
            except Exception as e:
                print(f"[DEBUG] Drive API error: {type(e).__name__}: {e}")
                raise
            
            return results
        
        files = await asyncio.to_thread(_list_files)
        print(f"[DEBUG] Total files from Drive: {len(files)}")
        
        for file in files:
            asset_type = self._get_asset_type(file["mimeType"])
            if asset_type:
                asset = Asset(
                    id=file["id"],
                    name=file["name"],
                    asset_type=asset_type,
                    path=f"drive://{file['id']}",  # Virtual path
                )
                assets.append(asset)
                
                # Cache file metadata
                self._file_cache[file["id"]] = file
        
        return assets
    
    async def get_asset_bytes(self, asset_id: str) -> bytes:
        """Download asset bytes from Drive."""
        def _download():
            request = self.service.files().get_media(fileId=asset_id)
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)
            
            done = False
            while not done:
                _, done = downloader.next_chunk()
            
            return buffer.getvalue()
        
        return await asyncio.to_thread(_download)
    
    async def get_asset_path(self, asset_id: str) -> str:
        """Download asset to local temp and return path."""
        # Check if already downloaded
        file_info = self._file_cache.get(asset_id)
        if not file_info:
            # Fetch file info
            def _get_info():
                return self.service.files().get(
                    fileId=asset_id,
                    fields="id, name, mimeType"
                ).execute()
            file_info = await asyncio.to_thread(_get_info)
            self._file_cache[asset_id] = file_info
        
        # Get filename and ensure it has the correct extension
        file_name = file_info['name']
        mime_type = file_info.get('mimeType', '')
        
        # If filename has no extension, add one based on mimeType
        if '.' not in file_name or not Path(file_name).suffix:
            ext = self.IMAGE_MIMES.get(mime_type) or self.VIDEO_MIMES.get(mime_type)
            if ext:
                file_name = f"{file_name}{ext}"
        
        # Create local path
        local_path = self.download_dir / f"{asset_id}_{file_name}"
        
        # Download if not exists
        if not local_path.exists():
            data = await self.get_asset_bytes(asset_id)
            local_path.write_bytes(data)
        
        return str(local_path)
    
    async def get_thumbnail_url(self, asset_id: str) -> str:
        """Generate local thumbnail from downloaded file."""
        # Create thumbnails directory
        thumbs_dir = settings.temp_dir / "thumbnails"
        thumbs_dir.mkdir(parents=True, exist_ok=True)
        
        # Get file info
        file_info = self._file_cache.get(asset_id, {})
        file_name = file_info.get("name", asset_id)
        mime_type = file_info.get("mimeType", "")
        
        # Determine asset type
        is_video = mime_type.startswith("video/")
        is_image = mime_type.startswith("image/")
        
        # Generate thumbnail name
        thumb_name = f"{asset_id}_thumb.jpg"
        thumb_path = thumbs_dir / thumb_name
        
        # If thumbnail already exists, return it
        if thumb_path.exists():
            return f"/temp/thumbnails/{thumb_name}"
        
        # Make sure file is downloaded first
        local_path = await self.get_asset_path(asset_id)
        local_file = Path(local_path)
        
        if is_image:
            # For images, just copy (or resize)
            try:
                shutil.copy(local_file, thumb_path)
                return f"/temp/thumbnails/{thumb_name}"
            except Exception as e:
                print(f"[DEBUG] Failed to copy image thumbnail: {e}")
        
        if is_video:
            # For videos, check for extracted frame from pipeline
            # The frame uses the downloaded file's stem which includes asset_id
            frame_path = settings.temp_dir / "frames" / f"{local_file.stem}_frame_001.jpg"
            print(f"[DEBUG] Looking for video frame at: {frame_path}")
            
            if frame_path.exists():
                print(f"[DEBUG] Found existing frame, copying to thumbnail")
                shutil.copy(frame_path, thumb_path)
                return f"/temp/thumbnails/{thumb_name}"
            
            # Try ffmpeg directly
            try:
                print(f"[DEBUG] Trying ffmpeg for video thumbnail: {local_file}")
                cmd = [
                    "ffmpeg", "-y", 
                    "-i", str(local_file),
                    "-ss", "0",
                    "-vframes", "1",
                    "-vf", "scale=200:-1",
                    "-q:v", "2",
                    str(thumb_path)
                ]
                result = subprocess.run(cmd, capture_output=True, timeout=15)
                if thumb_path.exists():
                    print(f"[DEBUG] ffmpeg thumbnail created successfully")
                    return f"/temp/thumbnails/{thumb_name}"
                else:
                    print(f"[DEBUG] ffmpeg failed: {result.stderr.decode()[:200]}")
            except FileNotFoundError:
                print(f"[DEBUG] ffmpeg not found")
            except Exception as e:
                print(f"[DEBUG] ffmpeg error: {e}")
            
            # Fallback to macOS qlmanage
            try:
                ql_thumb_name = f"{local_file.name}.png"
                cmd = ["qlmanage", "-t", "-s", "200", "-o", str(thumbs_dir), str(local_file)]
                subprocess.run(cmd, capture_output=True, timeout=15)
                ql_output = thumbs_dir / ql_thumb_name
                if ql_output.exists():
                    shutil.move(ql_output, thumb_path)
                    return f"/temp/thumbnails/{thumb_name}"
            except Exception:
                pass
        
        # Fallback to empty
        return ""
    
    async def rename_file(self, file_id: str, new_name: str) -> dict:
        """Rename a file in Google Drive.
        
        Args:
            file_id: The Drive file ID
            new_name: The new filename (including extension)
            
        Returns:
            Updated file metadata
        """
        def _rename():
            return self.service.files().update(
                fileId=file_id,
                body={"name": new_name},
                supportsAllDrives=True,
            ).execute()
        
        return await asyncio.to_thread(_rename)
    
    async def get_file_info(self, file_id: str) -> dict:
        """Get file metadata from Drive."""
        if file_id in self._file_cache:
            return self._file_cache[file_id]
        
        def _get_info():
            return self.service.files().get(
                fileId=file_id,
                fields="id, name, mimeType, thumbnailLink, size, webViewLink",
                supportsAllDrives=True,
            ).execute()
        
        info = await asyncio.to_thread(_get_info)
        self._file_cache[file_id] = info
        return info


def create_drive_source(folder_url_or_id: str, credentials: Credentials) -> GoogleDriveSource:
    """Factory function to create a GoogleDriveSource.
    
    Args:
        folder_url_or_id: Google Drive folder URL or ID
        credentials: Google OAuth credentials
        
    Returns:
        Configured GoogleDriveSource instance
    """
    folder_id = GoogleDriveSource.extract_folder_id(folder_url_or_id)
    return GoogleDriveSource(folder_id, credentials)
