"""Ad group and export-related data models."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, computed_field

from app.models.asset import ProcessedAsset, AssetType


class GroupType(str, Enum):
    """Type of ad group."""
    STANDARD = "standard"  # Story + Feed pair
    CAROUSEL = "carousel"  # 3-10 square cards
    SINGLE = "single"  # Single asset (unpaired)


class ConfidenceScores(BaseModel):
    """Confidence scores for inferred fields."""
    group: float = 0.0  # How confident we are in the grouping
    product: float = 0.0  # Product inference confidence
    angle: float = 0.0  # Angle inference confidence
    offer: float = 0.0  # Offer inference confidence


class UserInputs(BaseModel):
    """User-provided inputs for the naming pipeline."""
    client: str
    campaign: Optional[str] = None  # Default to month token
    start_number: int = 1
    date: Optional[str] = None  # Default to today YYYY.MM.DD
    folder_path: str  # Local folder path


class AdGroup(BaseModel):
    """A group of assets that form a single ad."""
    id: str
    group_type: GroupType
    assets: list[ProcessedAsset]
    
    # Inferred/editable fields
    ad_number: int
    product: str = ""
    angle: str = ""
    hook: str = ""
    creator: str = ""
    offer: bool = False
    
    # User inputs (passed through)
    campaign: str
    date: str
    
    # Ad copy fields
    primary_text: str = ""
    headline: str = ""  # Group-level for standard ads, per-asset for carousels
    description: str = ""  # Group-level for standard ads, per-asset for carousels
    cta: str = ""
    url: str = ""
    comment_media_buyer: str = ""
    comment_client: str = ""
    
    # Confidence scores
    confidence: ConfidenceScores = ConfidenceScores()
    
    @computed_field
    @property
    def format_token(self) -> str:
        """Get format token based on group type and assets."""
        if self.group_type == GroupType.CAROUSEL:
            return "CAR"
        # Check if any asset is video
        for asset in self.assets:
            if asset.asset.asset_type == AssetType.VIDEO:
                return "VID"
        return "IMG"
    
    def generate_filename(self) -> str:
        """Generate the standardized filename for this group."""
        import re
        ad_num = f"{self.ad_number:03d}"
        
        # Build filename, omitting empty fields
        parts = [ad_num]
        if self.campaign:
            parts.append(self.campaign)
        if self.product:
            parts.append(self.product)
        parts.append(self.format_token)
        if self.angle:
            parts.append(self.angle)
        if self.hook:
            parts.append(self.hook)
        if self.creator:
            parts.append(self.creator)
        if self.offer:
            parts.append("Offer")
        if self.date:
            parts.append(self.date)
        
        # Join and remove any accidental double underscores
        return re.sub(r'__+', '_', "_".join(parts))


class GroupedAssets(BaseModel):
    """Result of the grouping pipeline."""
    groups: list[AdGroup]
    ungrouped: list[ProcessedAsset] = []  # Assets that couldn't be grouped


class ExportRow(BaseModel):
    """A single row in the export CSV."""
    file_id: str
    old_name: str
    new_name: str
    group_id: str
    group_type: str
    placement_inferred: str
    confidence_group: float
    confidence_product: float
    confidence_angle: float
    confidence_offer: float
