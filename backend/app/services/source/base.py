"""Abstract base class for asset sources."""

from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.models.asset import Asset


class AssetSource(ABC):
    """Abstract interface for asset sources (local folder, Google Drive, etc.)."""
    
    @abstractmethod
    async def list_assets(self) -> list[Asset]:
        """List all assets in the source.
        
        Returns:
            List of Asset objects with basic info (id, name, type).
        """
        pass
    
    @abstractmethod
    async def get_asset_bytes(self, asset_id: str) -> bytes:
        """Get the raw bytes of an asset.
        
        Args:
            asset_id: The unique identifier of the asset.
            
        Returns:
            Raw bytes of the asset file.
        """
        pass
    
    @abstractmethod
    async def get_asset_path(self, asset_id: str) -> str:
        """Get a local file path to the asset.
        
        For local sources, this returns the original path.
        For remote sources, this may download to a temp location.
        
        Args:
            asset_id: The unique identifier of the asset.
            
        Returns:
            Local file path to the asset.
        """
        pass
    
    @abstractmethod
    async def get_thumbnail_url(self, asset_id: str) -> str:
        """Get a URL for the asset thumbnail.
        
        Args:
            asset_id: The unique identifier of the asset.
            
        Returns:
            URL to access the thumbnail (relative or absolute).
        """
        pass
