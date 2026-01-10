"""CSV export service."""

import csv
import io
from typing import TextIO

from app.models.group import AdGroup, ExportRow
from app.services.namer import generate_filename


def generate_export_rows(groups: list[AdGroup]) -> list[ExportRow]:
    """Generate export rows for all groups.
    
    Each asset in each group gets one row with the group's new filename.
    
    Args:
        groups: List of ad groups.
        
    Returns:
        List of ExportRow objects.
    """
    rows = []
    
    for group in groups:
        new_name = generate_filename(group)
        
        for asset in group.assets:
            row = ExportRow(
                file_id=asset.asset.id,
                old_name=asset.asset.name,
                new_name=new_name,
                group_id=group.id,
                group_type=group.group_type.value,
                placement_inferred=asset.placement.value,
                confidence_group=round(group.confidence.group, 3),
                confidence_product=round(group.confidence.product, 3),
                confidence_angle=round(group.confidence.angle, 3),
                confidence_offer=round(group.confidence.offer, 3),
            )
            rows.append(row)
    
    return rows


def export_to_csv(groups: list[AdGroup]) -> str:
    """Export groups to CSV string.
    
    Args:
        groups: List of ad groups.
        
    Returns:
        CSV content as string.
    """
    rows = generate_export_rows(groups)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "file_id",
        "old_name",
        "new_name",
        "group_id",
        "group_type",
        "placement_inferred",
        "confidence_group",
        "confidence_product",
        "confidence_angle",
        "confidence_offer",
    ])
    
    # Write rows
    for row in rows:
        writer.writerow([
            row.file_id,
            row.old_name,
            row.new_name,
            row.group_id,
            row.group_type,
            row.placement_inferred,
            row.confidence_group,
            row.confidence_product,
            row.confidence_angle,
            row.confidence_offer,
        ])
    
    return output.getvalue()


def write_csv_to_file(groups: list[AdGroup], file_path: str) -> None:
    """Export groups to a CSV file.
    
    Args:
        groups: List of ad groups.
        file_path: Path to write the CSV file.
    """
    content = export_to_csv(groups)
    with open(file_path, "w", newline="") as f:
        f.write(content)
