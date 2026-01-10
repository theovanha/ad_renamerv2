import { useState, useCallback } from 'react';
import type { AdGroup, ProcessedAsset } from '../types';

interface AssetRow {
  asset: ProcessedAsset;
  group: AdGroup;
  assetIndex: number;
}

interface AssetTableProps {
  groups: AdGroup[];
  onUpdateGroup: (groupId: string, updates: Partial<AdGroup>) => void;
  onRegroupAsset?: (assetId: string, targetGroupId: string | null) => void;
}

export default function AssetTable({ groups, onUpdateGroup, onRegroupAsset }: AssetTableProps) {
  // Flatten groups into rows
  const rows: AssetRow[] = groups.flatMap(group =>
    group.assets.map((asset, assetIndex) => ({ asset, group, assetIndex }))
  );

  // State for enlarged thumbnail preview
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

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
  const generateNewFileName = (group: AdGroup, asset: ProcessedAsset): string => {
    const adNum = String(group.ad_number).padStart(3, '0');
    const ext = asset.asset.name.split('.').pop() || '';
    // Backend sends asset_type as 'VID' or 'IMG' directly
    return `${adNum}_${asset.asset.asset_type}_${asset.placement}.${ext}`;
  };

  const handleFieldChange = useCallback(
    (groupId: string, field: keyof AdGroup, value: string | boolean) => {
      onUpdateGroup(groupId, { [field]: value });
    },
    [onUpdateGroup]
  );

  const handleMoveAsset = useCallback(
    (assetId: string, targetGroupId: string | null) => {
      if (onRegroupAsset) {
        onRegroupAsset(assetId, targetGroupId);
      }
    },
    [onRegroupAsset]
  );

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

  const seenGroups = new Set<string>();

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

      <table className="asset-table">
        <thead>
          <tr>
            <th className="th-move">Move</th>
            <th className="th-thumbnail">Thumbnail</th>
            <th className="th-oldfile">Old File</th>
            <th className="th-dimensions">Dimensions</th>
            <th className="th-placement">Placement</th>
            <th className="th-format">Format</th>
            <th className="th-campaign">Campaign</th>
            <th className="th-product">Product</th>
            <th className="th-angle">Angle</th>
            <th className="th-hook">Hook</th>
            <th className="th-creator">Creator</th>
            <th className="th-offer">Offer</th>
            <th className="th-newname">New Ad Name</th>
            <th className="th-newfile">New File</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isFirstInGroup = !seenGroups.has(row.group.id);
            seenGroups.add(row.group.id);
            const assetsInGroup = row.group.assets.length;

            return (
              <tr
                key={`${row.group.id}-${row.asset.asset.id}`}
                className={`asset-row ${isFirstInGroup ? 'group-start' : 'group-continue'}`}
              >
                {/* Move dropdown */}
                <td className="td-move">
                  <select
                    className="move-select"
                    value=""
                    onChange={e => {
                      const value = e.target.value;
                      if (value === 'new') {
                        handleMoveAsset(row.asset.asset.id, null);
                      } else if (value) {
                        handleMoveAsset(row.asset.asset.id, value);
                      }
                    }}
                  >
                    <option value="">⋮⋮</option>
                    {groups
                      .filter(g => g.id !== row.group.id)
                      .map(g => (
                        <option key={g.id} value={g.id}>
                          → Ad {g.ad_number}
                        </option>
                      ))
                    }
                    <option value="new">+ New group</option>
                  </select>
                </td>

                {/* Thumbnail */}
                <td className="td-thumbnail">
                  {row.asset.thumbnail_url ? (
                    <img
                      src={row.asset.thumbnail_url}
                      alt={row.asset.asset.name}
                      className="thumbnail-img"
                      onClick={() => setPreviewImage({ 
                        url: row.asset.thumbnail_url!, 
                        name: row.asset.asset.name 
                      })}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      {row.asset.asset.asset_type === 'VID' ? '🎬' : '🖼️'}
                    </div>
                  )}
                </td>

                {/* Old File Name */}
                <td className="td-oldfile">
                  <code className="filename-text">{row.asset.asset.name}</code>
                </td>

                {/* Dimensions */}
                <td className="td-dimensions">
                  <span className="dimensions-text">
                    {row.asset.metadata.width}×{row.asset.metadata.height}
                  </span>
                </td>

                {/* Placement */}
                <td className="td-placement">
                  <span className={`badge ${getPlacementBadgeClass(row.asset.placement)}`}>
                    {row.asset.placement.toUpperCase()}
                  </span>
                </td>

                {/* Format - show asset's own type (backend sends 'VID' or 'IMG' directly) */}
                <td className="td-format">
                  <span className={`badge ${getFormatBadgeClass(row.asset.asset.asset_type)}`}>
                    {row.asset.asset.asset_type}
                  </span>
                </td>

                {/* Group-level fields */}
                {isFirstInGroup ? (
                  <>
                    <td className="td-campaign" rowSpan={assetsInGroup}>
                      <input
                        type="text"
                        value={row.group.campaign}
                        onChange={e => handleFieldChange(row.group.id, 'campaign', e.target.value)}
                        className="table-input"
                      />
                    </td>
                    <td className="td-product" rowSpan={assetsInGroup}>
                      <input
                        type="text"
                        value={row.group.product}
                        onChange={e => handleFieldChange(row.group.id, 'product', e.target.value)}
                        placeholder="Product..."
                        className="table-input"
                      />
                    </td>
                    <td className="td-angle" rowSpan={assetsInGroup}>
                      <input
                        type="text"
                        value={row.group.angle}
                        onChange={e => handleFieldChange(row.group.id, 'angle', e.target.value)}
                        placeholder="Angle..."
                        className="table-input"
                      />
                    </td>
                    <td className="td-hook" rowSpan={assetsInGroup}>
                      <input
                        type="text"
                        value={row.group.hook}
                        onChange={e => handleFieldChange(row.group.id, 'hook', e.target.value)}
                        placeholder="Hook..."
                        className="table-input"
                      />
                    </td>
                    <td className="td-creator" rowSpan={assetsInGroup}>
                      <input
                        type="text"
                        value={row.group.creator}
                        onChange={e => handleFieldChange(row.group.id, 'creator', e.target.value)}
                        placeholder="Creator..."
                        className="table-input"
                      />
                    </td>
                    <td className="td-offer" rowSpan={assetsInGroup}>
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={row.group.offer}
                          onChange={e => handleFieldChange(row.group.id, 'offer', e.target.checked)}
                        />
                      </label>
                    </td>
                    <td className="td-newname" rowSpan={assetsInGroup}>
                      <code className="newname-preview">{generateAdName(row.group)}</code>
                    </td>
                  </>
                ) : null}

                {/* New File Name */}
                <td className="td-newfile">
                  <code className="filename-text">{generateNewFileName(row.group, row.asset)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style>{`
        .asset-table-container {
          overflow-x: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          position: relative;
          max-width: 100%;
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

        .asset-table {
          width: max-content;
          min-width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
          table-layout: auto;
        }

        .asset-table thead {
          background: var(--bg-tertiary);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .asset-table th {
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.7rem;
          color: var(--text-secondary);
          border-bottom: 2px solid var(--border-color);
          white-space: nowrap;
          background: var(--bg-tertiary);
        }

        .asset-table td {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid var(--border-color);
          vertical-align: top;
          white-space: nowrap;
          background: var(--bg-card);
        }

        .asset-row.group-continue td {
          background: rgba(22, 27, 34, 0.97);
        }

        /* Keep sticky columns opaque for continued rows */
        .asset-row.group-continue td.td-move,
        .asset-row.group-continue td.td-thumbnail,
        .asset-row.group-continue td.td-dimensions,
        .asset-row.group-continue td.td-placement,
        .asset-row.group-continue td.td-format {
          background: #161b22;
        }

        /* Move dropdown column */
        .th-move {
          width: 48px;
          min-width: 48px;
        }

        .td-move {
          width: 48px;
          min-width: 48px;
          text-align: center;
        }

        .move-select {
          width: 40px;
          padding: 0.25rem;
          font-size: 0.7rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          appearance: none;
          text-align: center;
          transition: all 0.15s;
        }

        .move-select:hover {
          background: var(--bg-secondary);
          border-color: var(--accent-primary);
          color: var(--text-primary);
        }

        .move-select:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
        }

        .move-select option {
          background: var(--bg-secondary);
          color: var(--text-primary);
          padding: 0.5rem;
        }

        /* Sticky first 5 columns */
        .th-move, .td-move {
          position: sticky;
          left: 0;
          z-index: 2;
          background: var(--bg-secondary);
        }

        .th-thumbnail, .td-thumbnail {
          position: sticky;
          left: 48px;
          z-index: 2;
          background: var(--bg-secondary);
        }

        .th-dimensions, .td-dimensions {
          position: sticky;
          left: 120px;
          z-index: 2;
          background: var(--bg-secondary);
        }

        .th-placement, .td-placement {
          position: sticky;
          left: 210px;
          z-index: 2;
          background: var(--bg-secondary);
        }

        .th-format, .td-format {
          position: sticky;
          left: 280px;
          z-index: 2;
          border-right: 2px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .asset-table thead th.th-move,
        .asset-table thead th.th-thumbnail,
        .asset-table thead th.th-dimensions,
        .asset-table thead th.th-placement,
        .asset-table thead th.th-format {
          z-index: 12;
          background: var(--bg-tertiary);
        }

        .asset-row.group-start {
          border-top: 2px solid var(--accent-primary);
        }

        .asset-row.group-start td {
          padding-top: 0.75rem;
        }

        .asset-row:hover td {
          background: rgba(88, 166, 255, 0.05);
        }

        /* Keep sticky columns opaque on hover */
        .asset-row:hover td.td-move,
        .asset-row:hover td.td-thumbnail,
        .asset-row:hover td.td-dimensions,
        .asset-row:hover td.td-placement,
        .asset-row:hover td.td-format {
          background: #1a2029;
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

        /* Badges */
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
          white-space: normal !important;
          min-width: 200px;
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

        /* File names */
        .filename-text {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: var(--text-secondary);
          word-break: break-all;
        }

        .td-newfile .filename-text {
          color: #4ade80;
          font-weight: 600;
          font-size: 0.7rem;
          letter-spacing: 0.01em;
        }

      `}</style>
    </div>
  );
}
