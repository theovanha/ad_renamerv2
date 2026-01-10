"""Pipeline API routes for analyzing assets."""

import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.asset import AssetType, ProcessedAsset
from app.models.group import AdGroup, GroupedAssets, UserInputs, ConfidenceScores, GroupType
from app.services.source.local import LocalFolderSource
from app.services.metadata import extract_metadata
from app.services.frames import extract_frames
from app.services.ocr import extract_text
from app.services.fingerprint import compute_fingerprint
from app.services.grouper import group_assets
from app.services.inference import infer_fields

router = APIRouter()

# In-memory storage for current session
_current_groups: Optional[GroupedAssets] = None
_current_inputs: Optional[UserInputs] = None


class AnalyzeRequest(BaseModel):
    """Request body for analyze endpoint."""
    folder_path: str
    client: str = "Client"
    campaign: Optional[str] = None
    start_number: int = 1
    date: Optional[str] = None


class UpdateGroupRequest(BaseModel):
    """Request body for updating a group."""
    product: Optional[str] = None
    angle: Optional[str] = None
    hook: Optional[str] = None
    creator: Optional[str] = None
    offer: Optional[bool] = None
    campaign: Optional[str] = None
    # Copy fields
    primary_text: Optional[str] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    cta: Optional[str] = None
    url: Optional[str] = None
    comment_media_buyer: Optional[str] = None
    comment_client: Optional[str] = None


class UpdateAssetRequest(BaseModel):
    """Request body for updating per-asset fields (carousel cards)."""
    headline: Optional[str] = None
    description: Optional[str] = None


class BulkReplaceRequest(BaseModel):
    """Request body for bulk replace."""
    field: str  # product, angle, or offer
    find: str
    replace: str


class BulkApplyRequest(BaseModel):
    """Request body for bulk apply to selected."""
    group_ids: list[str]
    field: str
    value: str


class RegroupRequest(BaseModel):
    """Request body for regrouping an asset."""
    asset_id: str
    target_group_id: Optional[str] = None  # None = create new group


class RenumberRequest(BaseModel):
    """Request body for renumbering groups."""
    start_number: int = 1


@router.post("/analyze")
async def analyze_assets(request: AnalyzeRequest) -> GroupedAssets:
    """Analyze assets in a folder and group them.
    
    This runs the full pipeline:
    1. Load assets from folder
    2. Extract metadata
    3. Extract video frames
    4. Run OCR
    5. Compute fingerprints
    6. Group assets
    7. Infer fields
    """
    global _current_groups, _current_inputs
    
    try:
        # Create source
        source = LocalFolderSource(request.folder_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Store inputs
    _current_inputs = UserInputs(
        client=request.client,
        campaign=request.campaign,
        start_number=request.start_number,
        date=request.date,
        folder_path=request.folder_path,
    )
    
    # 1. List assets
    assets = await source.list_assets()
    
    if not assets:
        raise HTTPException(status_code=400, detail="No assets found in folder")
    
    # 2-5. Process each asset
    processed_assets: list[ProcessedAsset] = []
    
    for asset in assets:
        # Extract metadata
        metadata = await extract_metadata(asset)
        placement = metadata.placement
        
        # Extract frames for videos
        frame_paths = []
        if asset.asset_type == AssetType.VIDEO:
            frame_paths = await extract_frames(asset)
        
        # Run OCR
        ocr_text = await extract_text(asset, frame_paths)
        
        # Compute fingerprint
        fingerprint = await compute_fingerprint(asset, frame_paths)
        
        # Get thumbnail URL
        thumbnail_url = await source.get_thumbnail_url(asset.id)
        
        processed = ProcessedAsset(
            asset=asset,
            metadata=metadata,
            placement=placement,
            ocr_text=ocr_text,
            fingerprint=fingerprint,
            frame_paths=frame_paths,
            thumbnail_url=thumbnail_url,
        )
        processed_assets.append(processed)
    
    # 6. Group assets
    grouped = await group_assets(processed_assets, _current_inputs)
    
    # 7. Infer fields for each group
    for i, group in enumerate(grouped.groups):
        grouped.groups[i] = await infer_fields(group)
    
    # Store results
    _current_groups = grouped
    
    return grouped


@router.get("/debug/analysis")
async def debug_analysis():
    """Debug endpoint showing detailed analysis breakdown."""
    if _current_groups is None:
        return {"error": "No analysis results. Run /analyze first."}
    
    # Build detailed breakdown
    assets_breakdown = []
    for group in _current_groups.groups:
        for asset in group.assets:
            assets_breakdown.append({
                "filename": asset.asset.name,
                "type": asset.asset.asset_type,
                "dimensions": f"{asset.metadata.width}x{asset.metadata.height}",
                "aspect_ratio": round(asset.metadata.aspect_ratio, 4),
                "placement": asset.placement,
                "group_id": group.id[:8],
                "group_type": group.group_type,
                "ad_number": group.ad_number,
                "fingerprint": asset.fingerprint[:16] if asset.fingerprint else "none",
                "ocr_preview": asset.ocr_text[:50] if asset.ocr_text else "none",
            })
    
    # Ungrouped assets
    for asset in _current_groups.ungrouped:
        assets_breakdown.append({
            "filename": asset.asset.name,
            "type": asset.asset.asset_type,
            "dimensions": f"{asset.metadata.width}x{asset.metadata.height}",
            "aspect_ratio": round(asset.metadata.aspect_ratio, 4),
            "placement": asset.placement,
            "group_id": "UNGROUPED",
            "group_type": "none",
            "ad_number": None,
            "fingerprint": asset.fingerprint[:16] if asset.fingerprint else "none",
            "ocr_preview": asset.ocr_text[:50] if asset.ocr_text else "none",
        })
    
    # Sort by filename
    assets_breakdown.sort(key=lambda x: x["filename"])
    
    return {
        "total_assets": len(assets_breakdown),
        "total_groups": len(_current_groups.groups),
        "ungrouped_count": len(_current_groups.ungrouped),
        "groups_summary": [
            {
                "ad_number": g.ad_number,
                "type": g.group_type,
                "format": g.format_token,
                "asset_count": len(g.assets),
                "assets": [a.asset.name for a in g.assets],
            }
            for g in _current_groups.groups
        ],
        "assets_breakdown": assets_breakdown,
    }


@router.get("/groups")
async def get_groups() -> GroupedAssets:
    """Get current grouped assets."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results. Run /analyze first.")
    
    return _current_groups


# NOTE: These specific routes MUST come before /groups/{group_id} to avoid path conflicts
@router.put("/groups/renumber")
async def renumber_groups(request: RenumberRequest) -> GroupedAssets:
    """Renumber all groups starting from a given number."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    # Renumber all groups sequentially
    for i, group in enumerate(_current_groups.groups):
        group.ad_number = request.start_number + i
    
    return _current_groups


@router.put("/groups/regroup")
async def regroup_asset(request: RegroupRequest) -> GroupedAssets:
    """Move an asset from one group to another or create a new group."""
    global _current_groups, _current_inputs
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    # Find the asset and its current group
    source_group = None
    asset_to_move = None
    asset_index = -1
    
    for group in _current_groups.groups:
        for i, asset in enumerate(group.assets):
            if asset.asset.id == request.asset_id:
                source_group = group
                asset_to_move = asset
                asset_index = i
                break
        if source_group:
            break
    
    if not source_group or not asset_to_move:
        raise HTTPException(status_code=404, detail=f"Asset not found: {request.asset_id}")
    
    # Remove asset from source group
    source_group.assets.pop(asset_index)
    
    # Determine target group
    if request.target_group_id:
        # Move to existing group
        target_group = None
        for group in _current_groups.groups:
            if group.id == request.target_group_id:
                target_group = group
                break
        
        if not target_group:
            raise HTTPException(status_code=404, detail=f"Target group not found: {request.target_group_id}")
        
        # Don't move to same group
        if target_group.id == source_group.id:
            # Put asset back
            source_group.assets.insert(asset_index, asset_to_move)
            return _current_groups
        
        # Add asset to target group
        target_group.assets.append(asset_to_move)
        
        # Update target group type if needed (e.g., becomes carousel with 3+ assets)
        if len(target_group.assets) >= 3:
            all_square = all(0.95 <= a.metadata.aspect_ratio <= 1.05 for a in target_group.assets)
            if all_square:
                target_group.group_type = GroupType.CAROUSEL
        elif len(target_group.assets) == 2:
            target_group.group_type = GroupType.STANDARD
        else:
            target_group.group_type = GroupType.SINGLE
    else:
        # Create new group for this asset
        campaign = _current_inputs.campaign or "Campaign"
        date = _current_inputs.date or ""
        
        new_group = AdGroup(
            id=str(uuid.uuid4()),
            group_type=GroupType.SINGLE,
            assets=[asset_to_move],
            ad_number=0,  # Will be renumbered
            campaign=campaign,
            date=date,
        )
        _current_groups.groups.append(new_group)
    
    # Remove source group if empty
    if len(source_group.assets) == 0:
        _current_groups.groups = [g for g in _current_groups.groups if g.id != source_group.id]
    else:
        # Update source group type
        if len(source_group.assets) >= 3:
            all_square = all(0.95 <= a.metadata.aspect_ratio <= 1.05 for a in source_group.assets)
            if all_square:
                source_group.group_type = GroupType.CAROUSEL
            else:
                source_group.group_type = GroupType.STANDARD
        elif len(source_group.assets) == 2:
            source_group.group_type = GroupType.STANDARD
        else:
            source_group.group_type = GroupType.SINGLE
    
    # Renumber all groups sequentially, preserving user's current starting number
    # Use the minimum ad_number from existing groups (excluding newly created groups with ad_number=0)
    existing_numbers = [g.ad_number for g in _current_groups.groups if g.ad_number > 0]
    start_num = min(existing_numbers) if existing_numbers else (_current_inputs.start_number if _current_inputs else 1)
    
    for i, group in enumerate(_current_groups.groups):
        group.ad_number = start_num + i
    
    return _current_groups


@router.put("/groups/{group_id}")
async def update_group(group_id: str, request: UpdateGroupRequest) -> AdGroup:
    """Update a group's editable fields."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    # Find the group
    for group in _current_groups.groups:
        if group.id == group_id:
            if request.product is not None:
                group.product = request.product
            if request.angle is not None:
                group.angle = request.angle
            if request.hook is not None:
                group.hook = request.hook
            if request.creator is not None:
                group.creator = request.creator
            if request.offer is not None:
                group.offer = request.offer
            if request.campaign is not None:
                group.campaign = request.campaign
            # Copy fields
            if request.primary_text is not None:
                group.primary_text = request.primary_text
            if request.headline is not None:
                group.headline = request.headline
            if request.description is not None:
                group.description = request.description
            if request.cta is not None:
                group.cta = request.cta
            if request.url is not None:
                group.url = request.url
            if request.comment_media_buyer is not None:
                group.comment_media_buyer = request.comment_media_buyer
            if request.comment_client is not None:
                group.comment_client = request.comment_client
            return group
    
    raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")


@router.put("/groups/{group_id}/assets/{asset_id}")
async def update_asset(group_id: str, asset_id: str, request: UpdateAssetRequest) -> ProcessedAsset:
    """Update per-asset fields (headline/description for carousel cards)."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    # Find the group and asset
    for group in _current_groups.groups:
        if group.id == group_id:
            for i, asset in enumerate(group.assets):
                if asset.asset.id == asset_id:
                    if request.headline is not None:
                        group.assets[i].headline = request.headline
                    if request.description is not None:
                        group.assets[i].description = request.description
                    return group.assets[i]
            raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    
    raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")


@router.post("/bulk/replace")
async def bulk_replace(request: BulkReplaceRequest) -> GroupedAssets:
    """Find and replace a field value across all groups."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    for group in _current_groups.groups:
        if request.field == "product":
            if group.product == request.find:
                group.product = request.replace
        elif request.field == "angle":
            if group.angle == request.find:
                group.angle = request.replace
        elif request.field == "hook":
            if group.hook == request.find:
                group.hook = request.replace
        elif request.field == "creator":
            if group.creator == request.find:
                group.creator = request.replace
        elif request.field == "campaign":
            if group.campaign == request.find:
                group.campaign = request.replace
        elif request.field == "offer":
            # Handle offer as boolean
            find_bool = request.find.lower() in ("yes", "true", "1")
            replace_bool = request.replace.lower() in ("yes", "true", "1")
            if group.offer == find_bool:
                group.offer = replace_bool
    
    return _current_groups


@router.post("/bulk/apply")
async def bulk_apply(request: BulkApplyRequest) -> GroupedAssets:
    """Apply a field value to selected groups."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    for group in _current_groups.groups:
        if group.id in request.group_ids:
            if request.field == "product":
                group.product = request.value
            elif request.field == "angle":
                group.angle = request.value
            elif request.field == "hook":
                group.hook = request.value
            elif request.field == "creator":
                group.creator = request.value
            elif request.field == "campaign":
                group.campaign = request.value
            elif request.field == "offer":
                group.offer = request.value.lower() in ("yes", "true", "1")
    
    return _current_groups
