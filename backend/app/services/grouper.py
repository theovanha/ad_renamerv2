"""Asset grouping service - matches Story+Feed pairs and detects carousels."""

import uuid
from typing import Optional

from app.models.asset import ProcessedAsset, Placement
from app.models.group import AdGroup, GroupType, ConfidenceScores, GroupedAssets, UserInputs
from app.services.fingerprint import compute_hash_distance, are_similar
from app.services.ocr import calculate_text_overlap
from app.config import settings


async def group_assets(
    assets: list[ProcessedAsset],
    user_inputs: UserInputs,
) -> GroupedAssets:
    """Group processed assets into ad groups.
    
    Groups are formed by:
    1. Matching Story+Feed pairs by hash similarity and OCR overlap
    2. Detecting carousels (3-10 feed images with similar hashes)
    
    Args:
        assets: List of processed assets with metadata, OCR, and fingerprints.
        user_inputs: User inputs for campaign, date, etc.
        
    Returns:
        GroupedAssets with ad groups and any ungrouped assets.
    """
    # Separate by placement (feed now includes 4:5 and 1:1/square)
    stories = [a for a in assets if a.placement == Placement.STORY]
    feeds = [a for a in assets if a.placement == Placement.FEED]
    unknown = [a for a in assets if a.placement == Placement.UNKNOWN]
    
    groups: list[AdGroup] = []
    used_assets: set[str] = set()
    
    # Determine campaign and date
    campaign = user_inputs.campaign or ""  # Leave blank by default
    date = user_inputs.date or settings.get_default_date()
    
    current_ad_number = user_inputs.start_number
    
    # 1. FIRST: Match Story+Feed pairs
    # Sort by filename number for better pairing (3+4, 5+6, 7+8)
    sorted_stories = sorted(stories, key=lambda a: _extract_number_from_filename(a.asset.name) or 999)
    sorted_feeds = sorted(feeds, key=lambda a: _extract_number_from_filename(a.asset.name) or 999)
    
    pair_groups, pair_used = await _match_story_feed_pairs(
        sorted_stories, sorted_feeds, campaign, date, current_ad_number
    )
    groups.extend(pair_groups)
    used_assets.update(pair_used)
    current_ad_number += len(pair_groups)
    
    # 2. THEN: Detect carousels from REMAINING feed images only
    remaining_feeds = [f for f in feeds if f.asset.id not in used_assets]
    carousel_groups, carousel_used = await _detect_carousels(
        remaining_feeds, campaign, date, current_ad_number
    )
    groups.extend(carousel_groups)
    used_assets.update(carousel_used)
    current_ad_number += len(carousel_groups)
    
    # 3. Create single-asset groups for remaining ungrouped assets
    all_assets = stories + feeds + unknown
    remaining = [a for a in all_assets if a.asset.id not in used_assets]
    
    for asset in remaining:
        group = AdGroup(
            id=str(uuid.uuid4()),
            group_type=GroupType.SINGLE,
            assets=[asset],
            ad_number=current_ad_number,
            campaign=campaign,
            date=date,
            confidence=ConfidenceScores(group=0.2),  # Low confidence for single assets
        )
        groups.append(group)
        current_ad_number += 1
    
    # Sort groups by first asset's filename and reassign ad numbers
    groups.sort(key=lambda g: _extract_number_from_filename(g.assets[0].asset.name) if g.assets else 999)
    for i, group in enumerate(groups):
        group.ad_number = user_inputs.start_number + i
    
    return GroupedAssets(groups=groups, ungrouped=[])


async def _detect_carousels(
    feeds: list[ProcessedAsset],
    campaign: str,
    date: str,
    start_number: int,
) -> tuple[list[AdGroup], set[str]]:
    """Detect carousel groups from feed images.
    
    A carousel is 3-10 feed images with similar visual content.
    
    Returns:
        Tuple of (carousel groups, set of used asset IDs).
    """
    groups = []
    used = set()
    
    if len(feeds) < 3:
        return groups, used
    
    # Cluster feeds by hash similarity
    clusters = _cluster_by_hash(feeds, threshold=15)
    
    current_number = start_number
    
    # If clustering didn't group feeds but we have 3-10 total, treat them all as one carousel
    # This handles the case where feeds are visually different but user wants them grouped
    total_feeds = len(feeds)
    largest_cluster = max((len(c) for c in clusters), default=0)
    
    if 3 <= total_feeds <= 10 and largest_cluster < 3:
        # Treat all feeds as one carousel
        confidence = 0.3  # Low confidence since we're not using hash matching
        group = AdGroup(
            id=str(uuid.uuid4()),
            group_type=GroupType.CAROUSEL,
            assets=feeds,
            ad_number=current_number,
            campaign=campaign,
            date=date,
            confidence=ConfidenceScores(group=confidence),
        )
        groups.append(group)
        used.update(a.asset.id for a in feeds)
        return groups, used
    
    for cluster in clusters:
        if 3 <= len(cluster) <= 10:
            # This is a carousel
            confidence = _calculate_group_confidence(cluster)
            
            group = AdGroup(
                id=str(uuid.uuid4()),
                group_type=GroupType.CAROUSEL,
                assets=cluster,
                ad_number=current_number,
                campaign=campaign,
                date=date,
                confidence=ConfidenceScores(group=confidence),
            )
            groups.append(group)
            used.update(a.asset.id for a in cluster)
            current_number += 1
    
    return groups, used


async def _match_story_feed_pairs(
    stories: list[ProcessedAsset],
    feeds: list[ProcessedAsset],
    campaign: str,
    date: str,
    start_number: int,
) -> tuple[list[AdGroup], set[str]]:
    """Match Story and Feed assets into pairs.
    
    Matching is based on:
    - Perceptual hash similarity
    - OCR text overlap
    
    Returns:
        Tuple of (paired groups, set of used asset IDs).
    """
    groups = []
    used_stories = set()
    used_feeds = set()
    
    current_number = start_number
    
    # Score all possible pairs
    pairs = []
    for story in stories:
        for feed in feeds:
            score, confidence = _calculate_pair_score(story, feed)
            if score > 0:
                pairs.append((story, feed, score, confidence))
    
    # Sort by score (highest first) and greedily match
    pairs.sort(key=lambda x: x[2], reverse=True)
    
    for story, feed, score, confidence in pairs:
        if story.asset.id in used_stories or feed.asset.id in used_feeds:
            continue
        
        # Create group
        group = AdGroup(
            id=str(uuid.uuid4()),
            group_type=GroupType.STANDARD,
            assets=[story, feed],
            ad_number=current_number,
            campaign=campaign,
            date=date,
            confidence=ConfidenceScores(group=confidence),
        )
        groups.append(group)
        
        used_stories.add(story.asset.id)
        used_feeds.add(feed.asset.id)
        current_number += 1
    
    return groups, used_stories | used_feeds


def _extract_number_from_filename(filename: str) -> Optional[int]:
    """Extract the primary number from a filename for pairing heuristics."""
    import re
    # Remove extension
    name = filename.rsplit('.', 1)[0]
    # Find all numbers in the filename
    numbers = re.findall(r'\d+', name)
    if numbers:
        return int(numbers[0])
    return None


def _calculate_pair_score(asset1: ProcessedAsset, asset2: ProcessedAsset) -> tuple[float, float]:
    """Calculate match score between two assets.
    
    asset1 is a Story, asset2 is a Feed.
    Primary signal: Visual similarity (perceptual hash)
    Secondary signal: Filename patterns
    
    Returns:
        Tuple of (score, confidence) where score > 0 means potential match.
    """
    # Check for filename-based pairing (secondary signal)
    num1 = _extract_number_from_filename(asset1.asset.name)  # Story number
    num2 = _extract_number_from_filename(asset2.asset.name)  # Feed number
    
    filename_bonus = 0.0
    if num1 is not None and num2 is not None:
        # Best match: story number + 1 = feed number (e.g., 3+4, 5+6, 7+8)
        if num2 == num1 + 1:
            filename_bonus = 0.3
        # Also good: same number (e.g., ad1_story + ad1_feed)
        elif num1 == num2:
            filename_bonus = 0.35
        # Sequential but wrong order
        elif num1 == num2 + 1:
            filename_bonus = 0.2
    
    # PRIMARY: Visual similarity via perceptual hash
    hash_score = 0.0
    if asset1.fingerprint and asset2.fingerprint:
        hash_distance = compute_hash_distance(asset1.fingerprint, asset2.fingerprint)
        # Score: 1.0 for identical, decreasing as distance increases
        # At threshold distance, score = 0
        hash_score = max(0, 1 - (hash_distance / settings.hash_threshold))
    
    # OCR text overlap
    ocr_overlap = calculate_text_overlap(asset1.ocr_text, asset2.ocr_text)
    
    # Combined score: visual similarity is primary (60%), filename hint (25%), OCR (15%)
    if asset1.fingerprint and asset2.fingerprint:
        score = (hash_score * 0.60) + (filename_bonus * 0.25) + (ocr_overlap * 0.15)
        confidence = hash_score  # Confidence based on visual match
    else:
        # No fingerprints (e.g., videos without ffmpeg) - rely more on filename
        score = (filename_bonus * 0.7) + (ocr_overlap * 0.3)
        confidence = 0.3 if filename_bonus > 0 else 0.1
    
    # Ensure minimum score for valid pairs
    if score > 0.2:
        return score, max(confidence, 0.2)
    
    return 0.1, 0.1


def _cluster_by_hash(assets: list[ProcessedAsset], threshold: int) -> list[list[ProcessedAsset]]:
    """Cluster assets by perceptual hash similarity.
    
    Simple greedy clustering algorithm.
    """
    if not assets:
        return []
    
    clusters = []
    used = set()
    
    for asset in assets:
        if asset.asset.id in used:
            continue
        
        # Start new cluster
        cluster = [asset]
        used.add(asset.asset.id)
        
        # Find similar assets
        for other in assets:
            if other.asset.id in used:
                continue
            
            # Check similarity to first asset in cluster
            if are_similar(asset.fingerprint, other.fingerprint, threshold):
                cluster.append(other)
                used.add(other.asset.id)
        
        clusters.append(cluster)
    
    return clusters


def _calculate_group_confidence(assets: list[ProcessedAsset]) -> float:
    """Calculate confidence score for a group based on internal similarity."""
    if len(assets) < 2:
        return 0.5
    
    # Calculate average pairwise hash distance
    total_distance = 0
    count = 0
    
    for i, a1 in enumerate(assets):
        for a2 in assets[i+1:]:
            total_distance += compute_hash_distance(a1.fingerprint, a2.fingerprint)
            count += 1
    
    avg_distance = total_distance / count if count > 0 else 0
    
    # Convert to confidence (lower distance = higher confidence)
    confidence = max(0, 1 - (avg_distance / 20))
    return confidence
