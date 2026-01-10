"""Application configuration and settings."""

import os
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


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
    
    # Google OAuth Settings
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
    google_picker_api_key: str = os.getenv("GOOGLE_PICKER_API_KEY", "")
    
    # Session settings
    session_secret: str = os.getenv("SESSION_SECRET", "vanha-secret-change-me")
    
    # OAuth scopes (include openid as Google adds it automatically)
    google_scopes: list[str] = [
        "openid",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
    
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

# Copy Doc Templates - Google Doc file IDs
COPY_DOC_TEMPLATES = {
    "template_1": "10DQcfWn3xV32g8TQBFNi9qYXXFZ-PFGx",
    "template_2": "1MQM97S3klTm2XuQqZgpriX4VT_0oo1FS",
    "template_3": "1CMNG-80mttkqOrkKXDLDq8b7uzz9-aH8",
    "template_4": "1GocdJyjnbxr5Wa8AgP8XE-T7wPFu-hKx",
}
