"""Perceptual hashing service for image fingerprinting."""

from pathlib import Path

from PIL import Image
import imagehash

from app.models.asset import Asset, AssetType


async def compute_fingerprint(asset: Asset, frame_paths: list[str] = None) -> str:
    """Compute perceptual hash fingerprint for an asset.
    
    For images, hash is computed directly.
    For videos, hash is computed from the first frame.
    
    Args:
        asset: The asset to fingerprint.
        frame_paths: List of frame paths for videos.
        
    Returns:
        Perceptual hash as hex string.
    """
    if asset.asset_type == AssetType.IMAGE:
        return await _hash_image(Path(asset.path))
    else:
        # For videos, use the first frame
        if frame_paths and len(frame_paths) > 0:
            return await _hash_image(Path(frame_paths[0]))
        return ""


async def _hash_image(image_path: Path) -> str:
    """Compute perceptual hash for an image.
    
    Uses average hash (aHash) which is fast and good for
    finding visually similar images.
    
    Args:
        image_path: Path to the image file.
        
    Returns:
        Hash as hex string.
    """
    try:
        with Image.open(image_path) as img:
            # Use average hash (fast and effective)
            ahash = imagehash.average_hash(img)
            return str(ahash)
    except Exception as e:
        print(f"Fingerprinting failed for {image_path}: {e}")
        return ""


def compute_hash_distance(hash1: str, hash2: str) -> int:
    """Compute Hamming distance between two hashes.
    
    Lower distance means more similar images.
    
    Args:
        hash1: First hash as hex string.
        hash2: Second hash as hex string.
        
    Returns:
        Hamming distance (0 = identical, higher = more different).
    """
    if not hash1 or not hash2:
        return 999  # Max distance for missing hashes
    
    try:
        h1 = imagehash.hex_to_hash(hash1)
        h2 = imagehash.hex_to_hash(hash2)
        return h1 - h2
    except Exception:
        return 999


def are_similar(hash1: str, hash2: str, threshold: int = 10) -> bool:
    """Check if two hashes are similar enough.
    
    Args:
        hash1: First hash.
        hash2: Second hash.
        threshold: Maximum distance to consider similar.
        
    Returns:
        True if hashes are within threshold distance.
    """
    return compute_hash_distance(hash1, hash2) <= threshold
