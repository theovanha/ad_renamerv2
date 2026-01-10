"""Export API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Cookie
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.exporter import export_to_csv
from app.routers import pipeline
from app.routers.auth import get_credentials_from_session

router = APIRouter()


class RenameResult(BaseModel):
    """Result of a file rename operation."""
    old_name: str
    new_name: str
    success: bool
    error: Optional[str] = None


@router.post("/export")
async def export_csv():
    """Export current groups to CSV."""
    if pipeline._current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results. Run /analyze first.")
    
    csv_content = export_to_csv(pipeline._current_groups.groups)
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=ad_names.csv"
        }
    )


@router.get("/export/preview")
async def preview_export():
    """Preview export data without downloading."""
    if pipeline._current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results. Run /analyze first.")
    
    from app.services.exporter import generate_export_rows
    rows = generate_export_rows(pipeline._current_groups.groups)
    
    return {"rows": [row.model_dump() for row in rows]}


@router.post("/export/rename")
async def rename_files_in_drive(
    session_id: Optional[str] = Cookie(default=None)
) -> dict:
    """Rename all files in Google Drive to their new names.
    
    This applies the generated filenames to the actual files in Drive.
    Only works when the source is Google Drive.
    """
    if pipeline._current_groups is None:
        raise HTTPException(status_code=404, detail="No analysis results. Run /analyze first.")
    
    if pipeline._current_source is None:
        raise HTTPException(
            status_code=400, 
            detail="Rename only works with Google Drive sources. For local files, use the CSV export."
        )
    
    # Verify we still have valid credentials
    credentials = get_credentials_from_session(session_id)
    if not credentials:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    
    results: list[RenameResult] = []
    
    # Generate new filenames for each asset
    from app.services.exporter import generate_export_rows
    export_rows = generate_export_rows(pipeline._current_groups.groups)
    
    for row in export_rows:
        old_name = row.old_name
        new_name = row.new_name
        
        # Find the asset to get its Drive file ID
        file_id = None
        for group in pipeline._current_groups.groups:
            for asset in group.assets:
                if asset.asset.name == old_name:
                    file_id = asset.asset.id
                    break
            if file_id:
                break
        
        if not file_id:
            results.append(RenameResult(
                old_name=old_name,
                new_name=new_name,
                success=False,
                error="File not found in current analysis"
            ))
            continue
        
        try:
            # Rename the file in Drive
            await pipeline._current_source.rename_file(file_id, new_name)
            results.append(RenameResult(
                old_name=old_name,
                new_name=new_name,
                success=True
            ))
        except Exception as e:
            results.append(RenameResult(
                old_name=old_name,
                new_name=new_name,
                success=False,
                error=str(e)
            ))
    
    # Count successes
    success_count = sum(1 for r in results if r.success)
    
    return {
        "total": len(results),
        "success": success_count,
        "failed": len(results) - success_count,
        "results": [r.model_dump() for r in results]
    }
