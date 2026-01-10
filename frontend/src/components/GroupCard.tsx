import { useState } from 'react';
import type { AdGroup } from '../types';
import { ANGLE_OPTIONS } from '../types';
import EditableField from './EditableField';

interface GroupCardProps {
  group: AdGroup;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (updates: Partial<AdGroup>) => void;
}

export default function GroupCard({ group, selected, onToggleSelect, onUpdate }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Generate filename preview
  const filename = `${String(group.ad_number).padStart(3, '0')}_${group.campaign}_${group.product}_${group.format_token}_${group.angle}_${group.offer ? 'Yes' : 'No'}_${group.date}`;
  
  // Calculate min confidence for color
  const minConfidence = Math.min(
    group.confidence.group,
    group.confidence.product,
    group.confidence.angle,
    group.confidence.offer
  );
  
  const getConfidenceClass = (value: number) => {
    if (value >= 0.7) return 'high';
    if (value >= 0.4) return 'medium';
    return 'low';
  };
  
  return (
    <div className={`group-card ${selected ? 'selected' : ''}`}>
      <div className="group-card-header">
        <div className="group-card-checkbox">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
          />
        </div>
        
        <div className="group-card-info">
          <div className="group-card-number">
            Ad #{String(group.ad_number).padStart(3, '0')}
          </div>
          <div className="group-card-badges">
            <span className={`badge ${group.group_type === 'carousel' ? 'badge-info' : 'badge-success'}`}>
              {group.group_type === 'carousel' ? 'Carousel' : 'Standard'}
            </span>
            <span className="badge badge-info">{group.format_token}</span>
            <span className={`confidence-badge ${getConfidenceClass(minConfidence)}`}>
              {Math.round(minConfidence * 100)}%
            </span>
          </div>
        </div>
        
        <button
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>
      
      <div className="group-card-preview">
        <code className="filename-preview">{filename}</code>
      </div>
      
      <div className="group-card-fields">
        <div className="field-row">
          <EditableField
            label="Product"
            value={group.product}
            confidence={group.confidence.product}
            onChange={value => onUpdate({ product: value })}
          />
          
          <EditableField
            label="Angle"
            value={group.angle}
            confidence={group.confidence.angle}
            onChange={value => onUpdate({ angle: value })}
            options={[...ANGLE_OPTIONS]}
          />
        </div>
        
        <div className="field-row">
          <div className="offer-field">
            <label>Offer</label>
            <div className="offer-toggle">
              <button
                className={`offer-btn ${!group.offer ? 'active' : ''}`}
                onClick={() => onUpdate({ offer: false })}
              >
                No
              </button>
              <button
                className={`offer-btn ${group.offer ? 'active' : ''}`}
                onClick={() => onUpdate({ offer: true })}
              >
                Yes
              </button>
            </div>
            <div className="confidence">
              <div className="confidence-bar">
                <div
                  className={`confidence-fill ${getConfidenceClass(group.confidence.offer)}`}
                  style={{ width: `${group.confidence.offer * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="group-card-assets">
          <div className="assets-header">Assets ({group.assets.length})</div>
          <div className="assets-list">
            {group.assets.map(asset => (
              <div key={asset.asset.id} className="asset-item">
                <div className="asset-thumbnail">
                  {asset.thumbnail_url ? (
                    <img src={asset.thumbnail_url} alt={asset.asset.name} />
                  ) : (
                    <div className="thumbnail-placeholder">
                      {asset.asset.asset_type === 'VID' ? '🎬' : '🖼'}
                    </div>
                  )}
                </div>
                <div className="asset-info">
                  <div className="asset-name">{asset.asset.name}</div>
                  <div className="asset-meta">
                    <span className="badge badge-info">{asset.placement}</span>
                    <span>{asset.metadata.width}×{asset.metadata.height}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style>{`
        .group-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        
        .group-card:hover {
          border-color: var(--border-hover);
        }
        
        .group-card.selected {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
        }
        
        .group-card-header {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin-bottom: var(--space-md);
        }
        
        .group-card-checkbox input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        
        .group-card-info {
          flex: 1;
        }
        
        .group-card-number {
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: var(--space-xs);
        }
        
        .group-card-badges {
          display: flex;
          gap: var(--space-sm);
          flex-wrap: wrap;
        }
        
        .confidence-badge {
          font-size: 0.75rem;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
        }
        
        .confidence-badge.high {
          background: rgba(35, 134, 54, 0.15);
          color: var(--accent-secondary);
        }
        
        .confidence-badge.medium {
          background: rgba(210, 153, 34, 0.15);
          color: var(--accent-warning);
        }
        
        .confidence-badge.low {
          background: rgba(248, 81, 73, 0.15);
          color: var(--accent-danger);
        }
        
        .expand-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 1.25rem;
          line-height: 1;
        }
        
        .expand-btn:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        
        .group-card-preview {
          margin-bottom: var(--space-lg);
        }
        
        .filename-preview {
          display: block;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--space-sm) var(--space-md);
          font-family: var(--font-mono);
          font-size: 0.8125rem;
          color: var(--accent-primary);
          word-break: break-all;
        }
        
        .group-card-fields {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
        
        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
        }
        
        .offer-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        
        .offer-field label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .offer-toggle {
          display: flex;
          gap: 2px;
        }
        
        .offer-btn {
          flex: 1;
          padding: var(--space-sm);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        
        .offer-btn:first-child {
          border-radius: var(--radius-md) 0 0 var(--radius-md);
        }
        
        .offer-btn:last-child {
          border-radius: 0 var(--radius-md) var(--radius-md) 0;
        }
        
        .offer-btn.active {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: white;
        }
        
        .group-card-assets {
          margin-top: var(--space-lg);
          padding-top: var(--space-lg);
          border-top: 1px solid var(--border-color);
        }
        
        .assets-header {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--space-md);
        }
        
        .assets-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        
        .asset-item {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
        }
        
        .asset-thumbnail {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: var(--bg-secondary);
          flex-shrink: 0;
        }
        
        .asset-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .thumbnail-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        
        .asset-info {
          flex: 1;
          min-width: 0;
        }
        
        .asset-name {
          font-size: 0.8125rem;
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .asset-meta {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-top: var(--space-xs);
          font-size: 0.75rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
