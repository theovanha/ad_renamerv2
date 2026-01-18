import { useState, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { AdGroup, ProcessedAsset } from '../types';

interface AssetTableProps {
  groups: AdGroup[];
  onUpdateGroup: (groupId: string, updates: Partial<AdGroup>) => void;
  onRegroupAsset?: (assetId: string, targetGroupId: string | null, destinationIndex?: number) => void;
  onReorderAsset?: (groupId: string, assetId: string, newIndex: number) => void;
  onUpdateAssetFilename?: (groupId: string, assetId: string, customFilename: string) => void;
}

export default function AssetTable({ groups, onUpdateGroup, onRegroupAsset, onReorderAsset, onUpdateAssetFilename }: AssetTableProps) {
  // State for enlarged thumbnail preview
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  
  // State for inline filename editing
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Generate ad name preview (matches backend logic)
  const generateAdName = (group: AdGroup): string => {
    const adNum = String(group.ad_number).padStart(3, '0');
    
    const parts = [adNum];
    if (group.campaign) parts.push(group.campaign);
    if (group.product) parts.push(group.product);
    parts.push(group.format_token);
    if (group.angle) parts.push(group.angle);
    if (group.hook) parts.push(group.hook);
    if (group.creator) parts.push(group.creator);
    if (group.offer) parts.push('Offer');
    if (group.date) parts.push(group.date);
    
    // Join and remove any accidental double underscores
    return parts.join('_').replace(/__+/g, '_');
  };

  // Generate per-asset new file name
  const generateNewFileName = (group: AdGroup, asset: ProcessedAsset, assetIndex: number): string => {
    // If custom filename is set, use it
    if (asset.custom_filename) {
      return asset.custom_filename;
    }
    
    const ext = asset.asset.name.split('.').pop() || 'jpg';
    
    // Carousel: {4-digit ad number}_CAR_Card{2-digit index}.{ext}
    if (group.group_type === 'carousel') {
      const adNum = String(group.ad_number).padStart(4, '0');
      const cardNum = String(assetIndex + 1).padStart(2, '0');
      return `${adNum}_CAR_Card${cardNum}.${ext}`;
    }
    
    // Standard/Single: use full ad name format
    const adNum = String(group.ad_number).padStart(3, '0');
    return `${adNum}_${asset.asset.asset_type}_${asset.placement}.${ext}`;
  };

  // Build a set of duplicate filenames for highlighting
  const duplicateFilenames = useMemo(() => {
    const filenameCount = new Map<string, number>();
    
    // Count all filenames
    for (const group of groups) {
      for (let i = 0; i < group.assets.length; i++) {
        const filename = generateNewFileName(group, group.assets[i], i);
        filenameCount.set(filename, (filenameCount.get(filename) || 0) + 1);
      }
    }
    
    // Return set of filenames that appear more than once
    const duplicates = new Set<string>();
    for (const [filename, count] of filenameCount) {
      if (count > 1) {
        duplicates.add(filename);
      }
    }
    return duplicates;
  }, [groups]);

  const handleFieldChange = useCallback(
    (groupId: string, field: keyof AdGroup, value: string | boolean) => {
      onUpdateGroup(groupId, { [field]: value });
    },
    [onUpdateGroup]
  );

  // Handle double-click to start editing filename
  const handleFilenameDoubleClick = (assetId: string, currentFilename: string) => {
    setEditingAssetId(assetId);
    setEditValue(currentFilename);
  };

  // Handle saving edited filename
  const handleFilenameSave = (groupId: string, assetId: string) => {
    if (onUpdateAssetFilename && editValue.trim()) {
      onUpdateAssetFilename(groupId, assetId, editValue.trim());
    }
    setEditingAssetId(null);
    setEditValue('');
  };

  // Handle cancel editing
  const handleFilenameCancel = () => {
    setEditingAssetId(null);
    setEditValue('');
  };

  // Handle key press in filename input
  const handleFilenameKeyDown = (e: React.KeyboardEvent, groupId: string, assetId: string) => {
    if (e.key === 'Enter') {
      handleFilenameSave(groupId, assetId);
    } else if (e.key === 'Escape') {
      handleFilenameCancel();
    }
  };

  const getFormatBadgeClass = (format: string) => {
    switch (format) {
      case 'VID': return 'badge-format-vid';
      case 'CAR': return 'badge-format-car';
      default: return 'badge-format-img';
    }
  };

  const getPlacementBadgeClass = (placement: string) => {
    switch (placement) {
      case 'story': return 'badge-placement-story';
      case 'feed': return 'badge-placement-feed';
      default: return 'badge-placement-unknown';
    }
  };

  // Handle drag end
  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    
    // Dropped outside any droppable
    if (!destination) return;
    
    const sourceGroupId = source.droppableId;
    const destGroupId = destination.droppableId;
    const assetId = draggableId;
    
    // Same position - no change
    if (sourceGroupId === destGroupId && source.index === destination.index) {
      return;
    }
    
    // Reorder within same group
    if (sourceGroupId === destGroupId) {
      if (onReorderAsset) {
        onReorderAsset(sourceGroupId, assetId, destination.index);
      }
    } else {
      // Move to different group - pass destination index to place it where dropped
      if (onRegroupAsset) {
        onRegroupAsset(assetId, destGroupId, destination.index);
      }
    }
  }, [onRegroupAsset, onReorderAsset]);

  return (
    <div className="asset-table-container">
      {previewImage && (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="preview-modal">
            <img src={previewImage.url} alt={previewImage.name} />
            <p className="preview-filename">{previewImage.name}</p>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Header row */}
        <div className="table-header">
          <div className="th-cell th-drag"></div>
          <div className="th-cell th-thumbnail">Thumb</div>
          <div className="th-cell th-oldfile">Old File</div>
          <div className="th-cell th-dimensions">Dimensions</div>
          <div className="th-cell th-placement">Placement</div>
          <div className="th-cell th-format">Format</div>
          <div className="th-cell th-campaign">Campaign</div>
          <div className="th-cell th-product">Product</div>
          <div className="th-cell th-angle">Angle</div>
          <div className="th-cell th-hook">Hook</div>
          <div className="th-cell th-creator">Creator</div>
          <div className="th-cell th-offer">Offer</div>
          <div className="th-cell th-newname">New Ad Name</div>
          <div className="th-cell th-newfile">New File</div>
        </div>

        {/* Groups */}
        <div className="table-body">
          {groups.map((group) => (
            <Droppable droppableId={group.id} key={group.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`group-section ${snapshot.isDraggingOver ? 'drag-over' : ''}`}
                >
                  {/* Group header indicator */}
                  <div className="group-header-bar">
                    <span className="group-badge">Ad #{String(group.ad_number).padStart(3, '0')}</span>
                    <span className="group-type-badge">{group.group_type}</span>
                    <span className="group-count">{group.assets.length} asset{group.assets.length !== 1 ? 's' : ''}</span>
                  </div>
                  
                  {group.assets.map((asset, assetIndex) => {
                    const isFirstInGroup = assetIndex === 0;
                    
                    return (
                      <Draggable
                        key={asset.asset.id}
                        draggableId={asset.asset.id}
                        index={assetIndex}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`asset-row ${snapshot.isDragging ? 'dragging' : ''} ${isFirstInGroup ? 'group-start' : 'group-continue'}`}
                            style={{
                              ...provided.draggableProps.style,
                            }}
                          >
                            {/* Drag handle */}
                            <div 
                              className="td-cell td-drag"
                              {...provided.dragHandleProps}
                            >
                              <div className="drag-handle">
                                <span></span>
                                <span></span>
                                <span></span>
                              </div>
                            </div>

                            {/* Thumbnail */}
                            <div className="td-cell td-thumbnail">
                              {asset.thumbnail_url ? (
                                <img
                                  src={asset.thumbnail_url}
                                  alt={asset.asset.name}
                                  className="thumbnail-img"
                                  onClick={() => setPreviewImage({ 
                                    url: asset.thumbnail_url!, 
                                    name: asset.asset.name 
                                  })}
                                />
                              ) : (
                                <div className="thumbnail-placeholder">
                                  {asset.asset.asset_type === 'VID' ? '🎬' : '🖼️'}
                                </div>
                              )}
                            </div>

                            {/* Old File Name */}
                            <div className="td-cell td-oldfile">
                              <code className="filename-text">{asset.asset.name}</code>
                            </div>

                            {/* Dimensions */}
                            <div className="td-cell td-dimensions">
                              <span className="dimensions-text">
                                {asset.metadata.width}×{asset.metadata.height}
                              </span>
                            </div>

                            {/* Placement */}
                            <div className="td-cell td-placement">
                              <span className={`badge ${getPlacementBadgeClass(asset.placement)}`}>
                                {asset.placement.toUpperCase()}
                              </span>
                            </div>

                            {/* Format */}
                            <div className="td-cell td-format">
                              <span className={`badge ${getFormatBadgeClass(group.group_type === 'carousel' ? 'CAR' : asset.asset.asset_type)}`}>
                                {group.group_type === 'carousel' ? 'CAR' : asset.asset.asset_type}
                              </span>
                            </div>

                            {/* Group-level fields - show inputs only for first asset, empty placeholder for others */}
                            <div className="td-cell td-campaign">
                              {isFirstInGroup && (
                                <input
                                  type="text"
                                  value={group.campaign}
                                  onChange={e => handleFieldChange(group.id, 'campaign', e.target.value)}
                                  className="table-input"
                                />
                              )}
                            </div>
                            <div className="td-cell td-product">
                              {isFirstInGroup && (
                                <input
                                  type="text"
                                  value={group.product}
                                  onChange={e => handleFieldChange(group.id, 'product', e.target.value)}
                                  placeholder="Product..."
                                  className="table-input"
                                />
                              )}
                            </div>
                            <div className="td-cell td-angle">
                              {isFirstInGroup && (
                                <input
                                  type="text"
                                  value={group.angle}
                                  onChange={e => handleFieldChange(group.id, 'angle', e.target.value)}
                                  placeholder="Angle..."
                                  className="table-input"
                                />
                              )}
                            </div>
                            <div className="td-cell td-hook">
                              {isFirstInGroup && (
                                <input
                                  type="text"
                                  value={group.hook}
                                  onChange={e => handleFieldChange(group.id, 'hook', e.target.value)}
                                  placeholder="Hook..."
                                  className="table-input"
                                />
                              )}
                            </div>
                            <div className="td-cell td-creator">
                              {isFirstInGroup && (
                                <input
                                  type="text"
                                  value={group.creator}
                                  onChange={e => handleFieldChange(group.id, 'creator', e.target.value)}
                                  placeholder="Creator..."
                                  className="table-input"
                                />
                              )}
                            </div>
                            <div className="td-cell td-offer">
                              {isFirstInGroup && (
                                <label className="checkbox-container">
                                  <input
                                    type="checkbox"
                                    checked={group.offer}
                                    onChange={e => handleFieldChange(group.id, 'offer', e.target.checked)}
                                  />
                                </label>
                              )}
                            </div>
                            <div className="td-cell td-newname">
                              {isFirstInGroup && (
                                <code className="newname-preview">{generateAdName(group)}</code>
                              )}
                            </div>

                            {/* New File Name - Double-click to edit */}
                            <div className="td-cell td-newfile">
                              {editingAssetId === asset.asset.id ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleFilenameSave(group.id, asset.asset.id)}
                                  onKeyDown={e => handleFilenameKeyDown(e, group.id, asset.asset.id)}
                                  className="filename-edit-input"
                                  autoFocus
                                />
                              ) : (
                                <code 
                                  className={`filename-text ${duplicateFilenames.has(generateNewFileName(group, asset, assetIndex)) ? 'duplicate' : ''} ${asset.custom_filename ? 'custom' : ''}`}
                                  onDoubleClick={() => handleFilenameDoubleClick(asset.asset.id, generateNewFileName(group, asset, assetIndex))}
                                  title="Double-click to edit"
                                >
                                  {generateNewFileName(group, asset, assetIndex)}
                                </code>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <style>{`
        .asset-table-container {
          overflow-x: auto;
          overflow-y: auto;
          max-height: calc(100vh - 200px);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          position: relative;
        }

        .preview-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          cursor: pointer;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .preview-modal {
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: scaleIn 0.2s ease-out;
        }

        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .preview-modal img {
          max-width: 100%;
          max-height: 80vh;
          object-fit: contain;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
        }

        .preview-filename {
          margin-top: var(--space-md);
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 0.875rem;
        }

        /* Table-like grid layout */
        .table-header {
          display: grid;
          grid-template-columns: 40px 56px 140px 90px 70px 60px 100px 100px 100px 100px 100px 50px 180px 160px;
          background: var(--bg-tertiary);
          position: sticky;
          top: 0;
          z-index: 20;
          border-bottom: 2px solid var(--border-color);
        }

        .th-cell {
          padding: 0.6rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .table-body {
          display: flex;
          flex-direction: column;
        }

        .group-section {
          border-bottom: 2px solid var(--accent-primary);
          transition: background 0.2s ease;
        }

        .group-section.drag-over {
          background: rgba(88, 166, 255, 0.08);
        }

        .group-header-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: rgba(88, 166, 255, 0.1);
          border-bottom: 1px solid var(--border-color);
        }

        .group-badge {
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--accent-primary);
        }

        .group-type-badge {
          font-size: 0.65rem;
          padding: 2px 6px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .group-count {
          font-size: 0.65rem;
          color: var(--text-muted);
        }

        .asset-row {
          display: grid;
          grid-template-columns: 40px 56px 140px 90px 70px 60px 100px 100px 100px 100px 100px 50px 180px 160px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-card);
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.15s ease;
        }

        .asset-row:hover {
          background: rgba(88, 166, 255, 0.04);
        }

        .asset-row.dragging {
          background: var(--bg-secondary);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--accent-primary);
          border-radius: var(--radius-sm);
          z-index: 100;
        }

        .td-cell {
          padding: 0.5rem;
          display: flex;
          align-items: center;
          min-height: 56px;
          overflow: hidden;
        }


        /* Drag handle */
        .td-drag {
          cursor: grab;
          justify-content: center;
        }

        .td-drag:active {
          cursor: grabbing;
        }

        .drag-handle {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 8px 4px;
          border-radius: var(--radius-sm);
          transition: background 0.15s ease;
        }

        .drag-handle span {
          display: flex;
          gap: 3px;
        }

        .drag-handle span::before,
        .drag-handle span::after {
          content: '';
          width: 4px;
          height: 4px;
          background: var(--text-muted);
          border-radius: 50%;
          transition: background 0.15s ease;
        }

        .td-drag:hover .drag-handle {
          background: var(--bg-tertiary);
        }

        .td-drag:hover .drag-handle span::before,
        .td-drag:hover .drag-handle span::after {
          background: var(--accent-primary);
        }

        /* Thumbnail */
        .thumbnail-img {
          width: 48px;
          height: 48px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .thumbnail-img:hover {
          transform: scale(1.08);
          box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
          border-color: var(--accent-primary);
        }

        .thumbnail-placeholder {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: 1.25rem;
        }

        .dimensions-text {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .filename-text {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: var(--text-secondary);
          word-break: break-all;
          line-height: 1.3;
        }

        .td-newfile .filename-text {
          color: #4ade80;
          font-weight: 600;
          font-size: 0.7rem;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: var(--radius-sm);
          transition: background 0.15s ease;
        }

        .td-newfile .filename-text:hover {
          background: rgba(74, 222, 128, 0.1);
        }

        .td-newfile .filename-text.duplicate {
          color: #f87171;
          background: rgba(248, 113, 113, 0.15);
          border: 1px solid rgba(248, 113, 113, 0.3);
        }

        .td-newfile .filename-text.custom {
          color: #fbbf24;
          font-style: italic;
        }

        .td-newfile .filename-text.duplicate.custom {
          color: #f87171;
        }

        .filename-edit-input {
          width: 100%;
          padding: 4px 6px;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          font-weight: 600;
          background: var(--bg-tertiary);
          border: 2px solid var(--accent-primary);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          outline: none;
        }

        .filename-edit-input:focus {
          box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
        }

        /* Badges */
        .badge {
          display: inline-block;
          padding: 3px 8px;
          font-size: 0.65rem;
          font-weight: 600;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .badge-format-vid {
          background: rgba(163, 113, 247, 0.2);
          color: var(--accent-purple);
        }

        .badge-format-img {
          background: rgba(88, 166, 255, 0.2);
          color: var(--accent-primary);
        }

        .badge-format-car {
          background: rgba(35, 134, 54, 0.2);
          color: var(--accent-secondary);
        }

        .badge-placement-story {
          background: rgba(210, 153, 34, 0.2);
          color: var(--accent-warning);
        }

        .badge-placement-feed {
          background: rgba(34, 211, 238, 0.2);
          color: #22d3ee;
        }

        .badge-placement-unknown {
          background: rgba(110, 118, 129, 0.2);
          color: var(--text-muted);
        }

        /* Table inputs */
        .table-input {
          width: 100%;
          padding: 0.35rem 0.5rem;
          font-size: 0.75rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
        }

        .table-input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
        }

        .table-input::placeholder {
          color: var(--text-muted);
        }

        /* Checkbox */
        .checkbox-container {
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .checkbox-container input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--accent-primary);
        }

        /* New ad name */
        .td-newname {
          min-width: 180px;
        }

        .newname-preview {
          display: block;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          font-weight: 600;
          color: #4ade80;
          letter-spacing: 0.01em;
          background: rgba(88, 166, 255, 0.1);
          padding: 0.35rem 0.5rem;
          border-radius: var(--radius-sm);
          word-break: break-all;
          line-height: 1.4;
        }

      `}</style>
    </div>
  );
}
