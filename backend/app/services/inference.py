"""Inference service for Product, Angle, and Offer detection from OCR text."""

import re
from typing import Optional

from app.models.asset import ProcessedAsset
from app.models.group import AdGroup, ConfidenceScores
from app.config import ANGLE_OPTIONS


# Keywords for angle detection
ANGLE_KEYWORDS = {
    "Offer": ["off", "discount", "sale", "deal", "save", "promo", "code", "coupon", "free"],
    "Price": ["$", "€", "£", "price", "cost", "only", "just", "from", "starting"],
    "SocialProof": ["reviews", "stars", "rated", "customers", "sold", "trusted", "loved", "favorite", "best"],
    "Education": ["how", "learn", "guide", "tips", "tutorial", "step", "discover", "understand"],
    "BehindTheScenes": ["behind", "making", "process", "studio", "team", "craft", "made"],
    "Founder": ["founder", "ceo", "owner", "story", "journey", "started", "mission"],
    "Brand": ["brand", "quality", "premium", "luxury", "original", "authentic"],
    "Newness": ["new", "launch", "introducing", "just arrived", "fresh", "latest", "coming soon"],
}

# Keywords for offer detection
OFFER_KEYWORDS = [
    r"\d+%\s*off",
    r"discount",
    r"sale",
    r"promo",
    r"code",
    r"coupon",
    r"free\s+shipping",
    r"buy\s+\d+\s+get",
    r"save\s+\$?\d+",
    r"limited\s+time",
    r"special\s+offer",
]


async def infer_fields(group: AdGroup) -> AdGroup:
    """Infer Product, Angle, and Offer fields for an ad group.
    
    Analyzes OCR text from all assets in the group.
    
    Args:
        group: The ad group to analyze.
        
    Returns:
        Updated group with inferred fields and confidence scores.
    """
    # Combine OCR text from all assets
    combined_text = " ".join(a.ocr_text for a in group.assets if a.ocr_text)
    
    # Infer each field
    product, product_conf = _infer_product(combined_text)
    angle, angle_conf = _infer_angle(combined_text)
    offer, offer_conf = _infer_offer(combined_text)
    
    # Update group
    group.product = product
    group.angle = angle
    group.offer = offer
    group.confidence = ConfidenceScores(
        group=group.confidence.group,
        product=product_conf,
        angle=angle_conf,
        offer=offer_conf,
    )
    
    return group


def _infer_product(text: str) -> tuple[str, float]:
    """Infer product name from OCR text.
    
    Currently a simple heuristic - looks for capitalized words or phrases.
    Can be extended with client-specific product lists.
    
    Returns:
        Tuple of (product name, confidence). Empty string if not detected.
    """
    if not text:
        return "", 0.0
    
    # Look for capitalized multi-word phrases (likely product names)
    # Pattern: 2-4 consecutive capitalized words
    pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b'
    matches = re.findall(pattern, text)
    
    if matches:
        # Take the longest match as the product name
        product = max(matches, key=len)
        # Replace spaces with underscores per spec
        product = product.replace(" ", "_")
        return product, 0.6
    
    # Look for single capitalized words (at least 4 chars)
    single_pattern = r'\b([A-Z][a-z]{3,})\b'
    single_matches = re.findall(single_pattern, text)
    
    if single_matches:
        # Take the first one
        return single_matches[0], 0.4
    
    return "", 0.0


def _infer_angle(text: str) -> tuple[str, float]:
    """Infer angle from OCR text based on keyword matching.
    
    Returns:
        Tuple of (angle name, confidence).
    """
    if not text:
        return "", 0.0  # Blank by default
    
    text_lower = text.lower()
    
    # Count keyword matches for each angle
    scores = {}
    for angle, keywords in ANGLE_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text_lower)
        if count > 0:
            scores[angle] = count
    
    if scores:
        # Return angle with most matches
        best_angle = max(scores, key=scores.get)
        # Confidence based on match count
        confidence = min(0.9, 0.3 + (scores[best_angle] * 0.15))
        return best_angle, confidence
    
    # Blank by default
    return "", 0.0


def _infer_offer(text: str) -> tuple[bool, float]:
    """Detect if the ad contains an offer.
    
    Returns:
        Tuple of (has_offer, confidence).
    """
    if not text:
        return False, 0.5
    
    text_lower = text.lower()
    
    # Check each offer pattern
    matches = 0
    for pattern in OFFER_KEYWORDS:
        if re.search(pattern, text_lower):
            matches += 1
    
    if matches >= 2:
        return True, 0.9
    elif matches == 1:
        return True, 0.7
    else:
        return False, 0.6
