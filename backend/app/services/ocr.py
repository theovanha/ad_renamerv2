"""OCR service using pytesseract."""

from pathlib import Path
from typing import Optional

from PIL import Image
import pytesseract

from app.models.asset import Asset, AssetType


async def extract_text(asset: Asset, frame_paths: list[str] = None) -> str:
    """Extract text from an asset using OCR.
    
    For images, OCR is run directly on the image.
    For videos, OCR is run on extracted frames and combined.
    
    Args:
        asset: The asset to extract text from.
        frame_paths: List of frame paths for videos (required for video assets).
        
    Returns:
        Combined OCR text from the asset.
    """
    if asset.asset_type == AssetType.IMAGE:
        return await _ocr_image(Path(asset.path))
    else:
        # For videos, OCR all frames and combine
        if not frame_paths:
            return ""
        
        texts = []
        for frame_path in frame_paths:
            text = await _ocr_image(Path(frame_path))
            if text:
                texts.append(text)
        
        # Deduplicate and combine
        return _combine_texts(texts)


async def _ocr_image(image_path: Path) -> str:
    """Run OCR on a single image.
    
    Args:
        image_path: Path to the image file.
        
    Returns:
        Extracted text, cleaned up.
    """
    try:
        with Image.open(image_path) as img:
            # Convert to RGB if necessary
            if img.mode != "RGB":
                img = img.convert("RGB")
            
            # Run OCR
            text = pytesseract.image_to_string(img)
            
            # Clean up
            return _clean_text(text)
            
    except Exception as e:
        print(f"OCR failed for {image_path}: {e}")
        return ""


def _clean_text(text: str) -> str:
    """Clean up OCR text.
    
    Args:
        text: Raw OCR output.
        
    Returns:
        Cleaned text.
    """
    # Remove extra whitespace
    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    
    return " ".join(lines)


def _combine_texts(texts: list[str]) -> str:
    """Combine texts from multiple frames, removing duplicates.
    
    Args:
        texts: List of OCR texts from different frames.
        
    Returns:
        Combined unique text.
    """
    # Split into words and deduplicate while preserving order
    seen_words = set()
    unique_words = []
    
    for text in texts:
        for word in text.split():
            word_lower = word.lower()
            if word_lower not in seen_words and len(word) > 1:
                seen_words.add(word_lower)
                unique_words.append(word)
    
    return " ".join(unique_words)


def calculate_text_overlap(text1: str, text2: str) -> float:
    """Calculate the overlap ratio between two texts.
    
    Args:
        text1: First text.
        text2: Second text.
        
    Returns:
        Overlap ratio from 0.0 to 1.0.
    """
    if not text1 or not text2:
        return 0.0
    
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = words1 & words2
    union = words1 | words2
    
    return len(intersection) / len(union) if union else 0.0
