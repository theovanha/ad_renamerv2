"""Asset-related data models."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class AssetType(str, Enum):
    """Type of asset."""
    IMAGE = "IMG"
    VIDEO = "VID"


class Placement(str, Enum):
    """Inferred placement based on aspect ratio."""
    STORY = "story"  # 9:16
    FEED = "feed"    # 4:5 or 1:1 (square)
    UNKNOWN = "unknown"


class AssetMetadata(BaseModel):
    """Metadata extracted from an asset."""
    width: int
    height: int
    duration: Optional[float] = None  # Video duration in seconds
    aspect_ratio: float  # width / height
    
    @property
    def placement(self) -> Placement:
        """Infer placement from aspect ratio."""
        ratio = self.aspect_ratio
        
        # Story: 9:16 (0.5625)
        if 0.5 <= ratio <= 0.6:
            return Placement.STORY
        
        # Feed: 4:5 (0.8) or 1:1 (1.0) - square is same as feed
        if 0.75 <= ratio <= 1.05:
            return Placement.FEED
        
        return Placement.UNKNOWN


class Asset(BaseModel):
    """Raw asset information from source."""
    id: str
    name: str
    path: str  # Local path or Drive ID
    asset_type: AssetType
    size_bytes: Optional[int] = None


class ProcessedAsset(BaseModel):
    """Asset with extracted metadata, OCR, and fingerprint."""
    asset: Asset
    metadata: AssetMetadata
    placement: Placement
    ocr_text: str = ""
    fingerprint: str = ""  # Perceptual hash as hex string
    frame_paths: list[str] = []  # Paths to extracted frames (for videos)
    thumbnail_url: Optional[str] = None
    
    # Per-asset copy fields (used for carousel cards)
    headline: str = ""
    description: str = ""
    
    # Custom filename override (if user edits the generated name)
    custom_filename: Optional[str] = None