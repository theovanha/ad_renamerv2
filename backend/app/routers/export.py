"""Export API routes."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.exporter import export_to_csv
from app.routers import pipeline

router = APIRouter()


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
