"""Pipeline API routes for analyzing assets."""

import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Cookie, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from app.models.asset import AssetType, ProcessedAsset
from app.models.group import AdGroup, GroupedAssets, UserInputs, ConfidenceScores, GroupType
from app.services.source.local import LocalFolderSource
from app.services.source.google_drive import GoogleDriveSource, create_drive_source
from app.services.metadata import extract_metadata
from app.services.frames import extract_frames
from app.services.ocr import extract_text
from app.services.fingerprint import compute_fingerprint
from app.services.grouper import group_assets, sort_assets_by_filename_number
from app.services.inference import infer_fields
from app.routers.auth import get_credentials_from_session
from app.config import COPY_DOC_TEMPLATES

router = APIRouter()

# In-memory storage for current session
_current_groups: Optional[GroupedAssets] = None
_current_inputs: Optional[UserInputs] = None
_current_source: Optional[GoogleDriveSource] = None  # Keep reference for Drive operations


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
    custom_filename: Optional[str] = None


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
    destination_index: Optional[int] = None  # Where to insert in target group


class RenumberRequest(BaseModel):
    """Request body for renumbering groups."""
    start_number: int = 1


class ReorderAssetRequest(BaseModel):
    """Request body for reordering an asset within a group."""
    asset_id: str
    new_index: int


def _is_drive_url(path: str) -> bool:
    """Check if the path is a Google Drive URL or folder ID."""
    return "drive.google.com" in path or (
        len(path) > 20 and 
        not path.startswith("/") and 
        not path.startswith("~") and
        " " not in path
    )


@router.post("/analyze")
async def analyze_assets(
    request: AnalyzeRequest,
    session_id: Optional[str] = Cookie(default=None)
) -> GroupedAssets:
    """Analyze assets in a folder and group them.
    
    This runs the full pipeline:
    1. Load assets from folder (local or Google Drive)
    2. Extract metadata
    3. Extract video frames
    4. Run OCR
    5. Compute fingerprints
    6. Group assets
    7. Infer fields
    """
    global _current_groups, _current_inputs, _current_source
    
    try:
        # Determine source type
        is_drive = _is_drive_url(request.folder_path)
        print(f"[DEBUG] Analyzing path: {request.folder_path}, is_drive: {is_drive}")
        
        if is_drive:
            # Google Drive source
            credentials = get_credentials_from_session(session_id)
            if not credentials:
                raise HTTPException(
                    status_code=401, 
                    detail="Please sign in with Google to access Drive folders"
                )
            print(f"[DEBUG] Got credentials, creating Drive source")
            source = create_drive_source(request.folder_path, credentials)
            _current_source = source  # Keep reference for later operations
            print(f"[DEBUG] Drive source created for folder: {source.folder_id}")
        else:
            # Local folder source
            print(f"[DEBUG] Creating local source for: {request.folder_path}")
            source = LocalFolderSource(request.folder_path)
            _current_source = None
    except ValueError as e:
        print(f"[DEBUG] ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[DEBUG] Exception creating source: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to access folder: {str(e)}")
    
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
        # For Drive sources, download to local temp first
        if asset.path.startswith("drive://"):
            local_path = await source.get_asset_path(asset.id)
            # Create a copy of the asset with the local path for processing
            from app.models.asset import Asset
            local_asset = Asset(
                id=asset.id,
                name=asset.name,
                asset_type=asset.asset_type,
                path=local_path,
            )
        else:
            local_asset = asset
        
        # Extract metadata using local path
        metadata = await extract_metadata(local_asset)
        placement = metadata.placement
        
        # Extract frames for videos
        frame_paths = []
        if local_asset.asset_type == AssetType.VIDEO:
            frame_paths = await extract_frames(local_asset)
        
        # Run OCR
        ocr_text = await extract_text(local_asset, frame_paths)
        
        # Compute fingerprint
        fingerprint = await compute_fingerprint(local_asset, frame_paths)
        
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


@router.get("/drive/thumbnail/{file_id}")
async def get_drive_thumbnail(
    file_id: str,
    session_id: Optional[str] = Cookie(default=None)
):
    """Proxy Drive thumbnails (requires auth)."""
    global _current_source
    
    if _current_source is None:
        raise HTTPException(status_code=404, detail="No Drive source available")
    
    credentials = get_credentials_from_session(session_id)
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        # Get thumbnail bytes from Drive
        data = await _current_source.get_asset_bytes(file_id)
        
        # Detect content type from file info
        file_info = await _current_source.get_file_info(file_id)
        content_type = file_info.get("mimeType", "image/jpeg")
        
        return StreamingResponse(
            io.BytesIO(data),
            media_type=content_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        
        # Add asset to target group at specified position
        if request.destination_index is not None:
            # Insert at the specific position user dropped it
            insert_idx = min(request.destination_index, len(target_group.assets))
            target_group.assets.insert(insert_idx, asset_to_move)
        else:
            # No position specified, append to end
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
                # Re-sort carousel assets by filename number for proper card ordering
                source_group.assets = sort_assets_by_filename_number(source_group.assets)
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


@router.put("/groups/{group_id}/assets/{asset_id:path}")
async def update_asset(group_id: str, asset_id: str, request: UpdateAssetRequest) -> ProcessedAsset:
    """Update per-asset fields (headline/description/custom_filename)."""
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
                    if request.custom_filename is not None:
                        # Empty string clears the override, use generated name
                        group.assets[i].custom_filename = request.custom_filename if request.custom_filename else None
                    return group.assets[i]
            raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    
    raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")


@router.put("/groups/{group_id}/reorder")
async def reorder_asset(group_id: str, request: ReorderAssetRequest) -> AdGroup:
    """Reorder an asset within a group (e.g., change carousel card order)."""
    global _current_groups
    
    if _current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results.")
    
    # Find the group
    for group in _current_groups.groups:
        if group.id == group_id:
            # Find the asset's current index
            current_index = None
            for i, asset in enumerate(group.assets):
                if asset.asset.id == request.asset_id:
                    current_index = i
                    break
            
            if current_index is None:
                raise HTTPException(status_code=404, detail=f"Asset not found: {request.asset_id}")
            
            # Validate new index
            if request.new_index < 0 or request.new_index >= len(group.assets):
                raise HTTPException(status_code=400, detail=f"Invalid index: {request.new_index}")
            
            # Reorder: remove from current position and insert at new position
            asset = group.assets.pop(current_index)
            group.assets.insert(request.new_index, asset)
            
            return group
    
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


class CopyDocRequest(BaseModel):
    """Request body for copying a doc template."""
    template_id: str


@router.get("/copy-doc/templates")
async def get_copy_doc_templates(
    session_id: Optional[str] = Cookie(default=None)
):
    """Get available copy doc templates with their names from Drive."""
    credentials = get_credentials_from_session(session_id)
    if not credentials:
        raise HTTPException(status_code=401, detail="Please sign in with Google first")
    
    from googleapiclient.discovery import build
    
    try:
        service = build("drive", "v3", credentials=credentials)
        templates = []
        
        for template_id, file_id in COPY_DOC_TEMPLATES.items():
            try:
                file_info = service.files().get(
                    fileId=file_id,
                    fields="id, name",
                    supportsAllDrives=True
                ).execute()
                templates.append({
                    "id": template_id,
                    "file_id": file_id,
                    "name": file_info.get("name", template_id)
                })
            except Exception as e:
                print(f"[DEBUG] Failed to get template {file_id}: {e}")
                templates.append({
                    "id": template_id,
                    "file_id": file_id,
                    "name": f"Template ({template_id})"
                })
        
        return {"templates": templates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")


@router.post("/copy-doc")
async def copy_doc_to_folder(
    request: CopyDocRequest,
    session_id: Optional[str] = Cookie(default=None)
):
    """Copy a doc template to the current Drive folder."""
    global _current_inputs, _current_source
    
    credentials = get_credentials_from_session(session_id)
    if not credentials:
        raise HTTPException(status_code=401, detail="Please sign in with Google first")
    
    if request.template_id not in COPY_DOC_TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template: {request.template_id}")
    
    if not _current_source:
        raise HTTPException(status_code=400, detail="No Drive folder selected. Please analyze a folder first.")
    
    template_file_id = COPY_DOC_TEMPLATES[request.template_id]
    target_folder_id = _current_source.folder_id
    
    from googleapiclient.discovery import build
    
    try:
        service = build("drive", "v3", credentials=credentials)
        
        # Get folder name
        folder_info = service.files().get(
            fileId=target_folder_id,
            fields="name",
            supportsAllDrives=True
        ).execute()
        folder_name = folder_info.get("name", "Folder")
        
        # Create copy name
        new_name = f"{folder_name}_CopyDoc"
        
        # Copy the file to the target folder
        copied_file = service.files().copy(
            fileId=template_file_id,
            body={
                "name": new_name,
                "parents": [target_folder_id]
            },
            supportsAllDrives=True
        ).execute()
        
        file_id = copied_file.get("id")
        file_url = f"https://docs.google.com/document/d/{file_id}/edit"
        
        return {
            "success": True,
            "file_id": file_id,
            "name": new_name,
            "url": file_url
        }
    except Exception as e:
        print(f"[DEBUG] Failed to copy doc: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to copy document: {str(e)}")
