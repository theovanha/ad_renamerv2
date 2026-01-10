import { useState } from 'react';
import { ANGLE_OPTIONS } from '../types';

interface BulkToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onBulkReplace: (field: string, find: string, replace: string) => void;
  onBulkApply: (field: string, value: string) => void;
}

export default function BulkToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onBulkReplace,
  onBulkApply,
}: BulkToolbarProps) {
  const [showReplace, setShowReplace] = useState(false);
  const [showApply, setShowApply] = useState(false);
  
  // Replace form state
  const [replaceField, setReplaceField] = useState('product');
  const [replaceFind, setReplaceFind] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  
  // Apply form state
  const [applyField, setApplyField] = useState('angle');
  const [applyValue, setApplyValue] = useState('ProductFocus');
  
  const handleReplace = () => {
    if (replaceFind && replaceWith) {
      onBulkReplace(replaceField, replaceFind, replaceWith);
      setReplaceFind('');
      setReplaceWith('');
      setShowReplace(false);
    }
  };
  
  const handleApply = () => {
    if (applyValue && selectedCount > 0) {
      onBulkApply(applyField, applyValue);
      setShowApply(false);
    }
  };
  
  return (
    <div className="bulk-toolbar">
      <div className="toolbar-left">
        <label className="select-all">
          <input
            type="checkbox"
            checked={selectedCount === totalCount && totalCount > 0}
            onChange={onSelectAll}
          />
          <span>
            {selectedCount === 0
              ? 'Select all'
              : `${selectedCount} of ${totalCount} selected`}
          </span>
        </label>
      </div>
      
      <div className="toolbar-right">
        <button
          className="btn-secondary btn-sm"
          onClick={() => { setShowReplace(!showReplace); setShowApply(false); }}
        >
          Find & Replace
        </button>
        
        <button
          className="btn-secondary btn-sm"
          onClick={() => { setShowApply(!showApply); setShowReplace(false); }}
          disabled={selectedCount === 0}
        >
          Apply to Selected
        </button>
      </div>
      
      {showReplace && (
        <div className="toolbar-panel">
          <h4>Find & Replace</h4>
          <div className="panel-row">
            <div className="panel-field">
              <label>Field</label>
              <select value={replaceField} onChange={e => setReplaceField(e.target.value)}>
                <option value="product">Product</option>
                <option value="angle">Angle</option>
                <option value="offer">Offer</option>
              </select>
            </div>
            <div className="panel-field">
              <label>Find</label>
              <input
                type="text"
                value={replaceFind}
                onChange={e => setReplaceFind(e.target.value)}
                placeholder={replaceField === 'offer' ? 'Yes or No' : 'Value to find'}
              />
            </div>
            <div className="panel-field">
              <label>Replace with</label>
              <input
                type="text"
                value={replaceWith}
                onChange={e => setReplaceWith(e.target.value)}
                placeholder={replaceField === 'offer' ? 'Yes or No' : 'New value'}
              />
            </div>
            <button className="btn-primary btn-sm" onClick={handleReplace}>
              Replace All
            </button>
          </div>
        </div>
      )}
      
      {showApply && (
        <div className="toolbar-panel">
          <h4>Apply to Selected ({selectedCount})</h4>
          <div className="panel-row">
            <div className="panel-field">
              <label>Field</label>
              <select value={applyField} onChange={e => setApplyField(e.target.value)}>
                <option value="product">Product</option>
                <option value="angle">Angle</option>
                <option value="offer">Offer</option>
              </select>
            </div>
            <div className="panel-field">
              <label>Value</label>
              {applyField === 'angle' ? (
                <select value={applyValue} onChange={e => setApplyValue(e.target.value)}>
                  {ANGLE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : applyField === 'offer' ? (
                <select value={applyValue} onChange={e => setApplyValue(e.target.value)}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={applyValue}
                  onChange={e => setApplyValue(e.target.value)}
                  placeholder="New value"
                />
              )}
            </div>
            <button className="btn-primary btn-sm" onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        .bulk-toolbar {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--space-md) var(--space-lg);
        }
        
        .bulk-toolbar > div:first-child {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .toolbar-left {
          display: flex;
          align-items: center;
        }
        
        .toolbar-right {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        
        .select-all {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          cursor: pointer;
          font-size: 0.875rem;
        }
        
        .select-all input {
          width: 16px;
          height: 16px;
        }
        
        .btn-sm {
          padding: var(--space-xs) var(--space-md);
          font-size: 0.8125rem;
        }
        
        .toolbar-panel {
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 1px solid var(--border-color);
        }
        
        .toolbar-panel h4 {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: var(--space-md);
        }
        
        .panel-row {
          display: flex;
          align-items: flex-end;
          gap: var(--space-md);
          flex-wrap: wrap;
        }
        
        .panel-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
          min-width: 150px;
        }
        
        .panel-field label {
          font-size: 0.75rem;
          margin: 0;
        }
        
        .panel-field input,
        .panel-field select {
          padding: var(--space-sm);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
