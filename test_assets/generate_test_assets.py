#!/usr/bin/env python3
"""
Generate test assets for the VANHA Creative Auto-Namer.

This script creates placeholder images with different aspect ratios
and text overlays to simulate real ad assets for testing.

Requirements: pip install pillow
"""

import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Please install Pillow: pip install pillow")
    exit(1)


# Asset definitions
ASSETS = [
    # Ad 1: Story + Feed pair (Image)
    {
        "name": "ad1_story_summer_sale.png",
        "size": (1080, 1920),
        "color": "#FF6B6B",
        "text": "SUMMER SALE\n50% OFF\nShop Now",
    },
    {
        "name": "ad1_feed_summer_sale.png",
        "size": (1080, 1350),
        "color": "#FF6B6B",
        "text": "SUMMER SALE\n50% OFF\nShop Now",
    },
    
    # Ad 2: Story + Feed pair (Image)
    {
        "name": "ad2_story_new_product.png",
        "size": (1080, 1920),
        "color": "#4ECDC4",
        "text": "NEW ARRIVAL\nPremium Widget\nDiscover More",
    },
    {
        "name": "ad2_feed_new_product.png",
        "size": (1080, 1080),
        "color": "#4ECDC4",
        "text": "NEW ARRIVAL\nPremium Widget\nDiscover More",
    },
    
    # Ad 3: Story + Feed pair (different style)
    {
        "name": "ad3_story_brand.png",
        "size": (1080, 1920),
        "color": "#9B59B6",
        "text": "QUALITY\nCRAFTED\nSince 2020",
    },
    {
        "name": "ad3_feed_brand.png",
        "size": (1080, 1350),
        "color": "#9B59B6",
        "text": "QUALITY\nCRAFTED\nSince 2020",
    },
    
    # Carousel: 6 square images
    {
        "name": "carousel_01_intro.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "HOW IT WORKS\nStep 1",
    },
    {
        "name": "carousel_02_step.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "HOW IT WORKS\nStep 2",
    },
    {
        "name": "carousel_03_step.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "HOW IT WORKS\nStep 3",
    },
    {
        "name": "carousel_04_step.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "HOW IT WORKS\nStep 4",
    },
    {
        "name": "carousel_05_step.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "HOW IT WORKS\nStep 5",
    },
    {
        "name": "carousel_06_cta.png",
        "size": (1080, 1080),
        "color": "#3498DB",
        "text": "GET STARTED\nToday!",
    },
]


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def darken_color(rgb: tuple, factor: float = 0.7) -> tuple:
    """Darken an RGB color."""
    return tuple(int(c * factor) for c in rgb)


def create_asset(name: str, size: tuple, color: str, text: str) -> None:
    """Create a test asset image with text overlay."""
    width, height = size
    bg_color = hex_to_rgb(color)
    
    # Create image with gradient-like effect
    img = Image.new('RGB', size, bg_color)
    draw = ImageDraw.Draw(img)
    
    # Add some visual interest with rectangles
    darker = darken_color(bg_color, 0.8)
    
    # Draw decorative elements
    draw.rectangle([0, 0, width, height // 4], fill=darker)
    draw.rectangle([0, height - height // 4, width, height], fill=darker)
    
    # Calculate text position
    text_lines = text.split('\n')
    
    # Try to use a built-in font, fall back to default
    try:
        # Try to find a reasonable font size based on image dimensions
        font_size = min(width, height) // 12
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 60)
        except (OSError, IOError):
            font = ImageFont.load_default()
    
    # Calculate total text height
    line_height = font_size + 20 if 'font_size' in dir() else 80
    total_text_height = len(text_lines) * line_height
    
    # Draw text
    y = (height - total_text_height) // 2
    for line in text_lines:
        # Get text bounding box
        bbox = draw.textbbox((0, 0), line, font=font)
        text_width = bbox[2] - bbox[0]
        x = (width - text_width) // 2
        
        # Draw shadow
        draw.text((x + 3, y + 3), line, fill=(0, 0, 0, 128), font=font)
        # Draw text
        draw.text((x, y), line, fill='white', font=font)
        
        y += line_height
    
    # Add placement indicator
    aspect = width / height
    if 0.5 <= aspect <= 0.6:
        placement = "STORY 9:16"
    elif 0.95 <= aspect <= 1.05:
        placement = "SQUARE 1:1"
    elif 0.75 <= aspect <= 0.85:
        placement = "FEED 4:5"
    else:
        placement = f"CUSTOM {width}x{height}"
    
    # Draw placement badge
    try:
        small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
    except (OSError, IOError):
        small_font = font
    
    badge_bbox = draw.textbbox((0, 0), placement, font=small_font)
    badge_width = badge_bbox[2] - badge_bbox[0] + 20
    badge_height = badge_bbox[3] - badge_bbox[1] + 10
    
    draw.rectangle(
        [10, 10, 10 + badge_width, 10 + badge_height],
        fill=(0, 0, 0, 180)
    )
    draw.text((20, 12), placement, fill='white', font=small_font)
    
    # Save image
    img.save(name)
    print(f"Created: {name} ({width}x{height})")


def main():
    """Generate all test assets."""
    output_dir = Path(__file__).parent
    os.chdir(output_dir)
    
    print("Generating test assets...")
    print("-" * 40)
    
    for asset in ASSETS:
        create_asset(
            asset["name"],
            asset["size"],
            asset["color"],
            asset["text"],
        )
    
    print("-" * 40)
    print(f"Generated {len(ASSETS)} test assets")
    print("\nYou can now use this folder path in the app:")
    print(f"  {output_dir.absolute()}")


if __name__ == "__main__":
    main()
