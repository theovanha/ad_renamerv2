"""Application configuration and settings."""

from datetime import datetime
from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    """Application settings."""
    
    # Default values
    default_campaign: str = ""  # Will be computed based on current month
    default_start_number: int = 1
    default_date: str = ""  # Will be computed as today
    
    # Frame extraction settings
    frames_fps: int = 1  # Extract 1 frame per second
    extract_first_last: bool = True  # Also extract first and last frames
    
    # Temp directory for extracted frames
    temp_dir: Path = Path("/tmp/vanha_autonamer")
    
    # Perceptual hash threshold for matching
    hash_threshold: int = 25  # Hash distance threshold (typical pairs are 15-25)
    
    # OCR overlap threshold for grouping
    ocr_overlap_threshold: float = 0.5  # 50% text overlap
    
    @staticmethod
    def get_default_campaign() -> str:
        """Get default campaign name based on current month."""
        month_tokens = [
            "JanAds", "FebAds", "MarAds", "AprAds", "MayAds", "JunAds",
            "JulAds", "AugAds", "SepAds", "OctAds", "NovAds", "DecAds"
        ]
        return month_tokens[datetime.now().month - 1]
    
    @staticmethod
    def get_default_date() -> str:
        """Get today's date in YYYY.MM.DD format."""
        return datetime.now().strftime("%Y.%m.%d")


# Global settings instance
settings = Settings()


# Angle options
ANGLE_OPTIONS = [
    "ProductFocus",
    "Offer",
    "Price",
    "SocialProof",
    "Education",
    "BehindTheScenes",
    "Founder",
    "Brand",
    "Newness",
]

# Client list (can be extended)
CLIENT_OPTIONS = [
    "ClientA",
    "ClientB", 
    "ClientC",
]
