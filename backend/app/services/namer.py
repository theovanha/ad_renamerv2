"""Filename generation service."""

from app.models.group import AdGroup, GroupType
from app.models.asset import ProcessedAsset


def generate_carousel_filename(group: AdGroup, asset: ProcessedAsset, card_index: int) -> str:
    """Generate filename for a carousel card.
    
    Format: {4-digit ad number}_CAR_Card{2-digit card number}.{ext}
    Example: 0001_CAR_Card01.png
    
    Args:
        group: The carousel ad group.
        asset: The specific asset (card) to generate filename for.
        card_index: 1-based card index (1 for Card01, 2 for Card02, etc.)
        
    Returns:
        Generated filename string with extension.
    """
    # Format ad number as 4-digit zero-padded for carousels
    ad_number = f"{group.ad_number:04d}"
    
    # Format card number as 2-digit zero-padded
    card_number = f"Card{card_index:02d}"
    
    # Get extension from original filename
    original_name = asset.asset.name
    if '.' in original_name:
        ext = original_name.rsplit('.', 1)[1]
    else:
        ext = 'png'  # Default extension
    
    return f"{ad_number}_CAR_{card_number}.{ext}"


def generate_filename(group: AdGroup) -> str:
    """Generate standardized filename for an ad group.
    
    Schema: {AdNumber}_{Campaign}_{Product}_{Format}_{Angle}_{Offer}_{YYYY.MM.DD}
    
    Args:
        group: The ad group to generate filename for.
        
    Returns:
        Generated filename string.
    """
    # Format ad number as 3-digit zero-padded
    ad_number = f"{group.ad_number:03d}"
    
    # Get format token
    format_token = group.format_token
    
    # Offer as Yes/No
    offer_str = "Yes" if group.offer else "No"
    
    # Assemble filename
    filename = f"{ad_number}_{group.campaign}_{group.product}_{format_token}_{group.angle}_{offer_str}_{group.date}"
    
    return filename


def generate_filenames_for_groups(groups: list[AdGroup]) -> dict[str, str]:
    """Generate filenames for all groups.
    
    Args:
        groups: List of ad groups.
        
    Returns:
        Dictionary mapping group ID to generated filename.
    """
    return {group.id: generate_filename(group) for group in groups}
