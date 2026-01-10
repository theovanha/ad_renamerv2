"""Filename generation service."""

from app.models.group import AdGroup


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
