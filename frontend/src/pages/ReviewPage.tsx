import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { GroupedAssets, AdGroup } from '../types';
import AssetTable from '../components/AssetTable';

// Bulk apply toolbar component
function BulkApplyToolbar({ 
  onApply, 
  onRenumber,
  currentStartNumber 
}: { 
  onApply: (field: string, value: string | boolean) => void;
  onRenumber: (startNumber: number) => void;
  currentStartNumber: number;
}) {
  const [campaign, setCampaign] = useState('');
  const [product, setProduct] = useState('');
  const [offer, setOffer] = useState(false);
  const [startNumber, setStartNumber] = useState(currentStartNumber);

  return (
    <div className="bulk-toolbar">
      <span className="bulk-label">Apply to all:</span>

      <div className="bulk-field">
        <input
          type="number"
          value={startNumber}
          onChange={e => setStartNumber(parseInt(e.target.value) || 1)}
          min={1}
          className="bulk-input bulk-input-number"
          placeholder="Start #"
        />
        <button 
          className="bulk-btn"
          onClick={() => { onRenumber(startNumber); }}
        >
          Renumber
        </button>
      </div>
      
      <div className="bulk-field">
        <input
          type="text"
          value={campaign}
          onChange={e => setCampaign(e.target.value)}
          placeholder="Campaign"
          className="bulk-input"
        />
        <button 
          className="bulk-btn"
          onClick={() => { onApply('campaign', campaign); }}
          disabled={!campaign}
        >
          Apply
        </button>
      </div>

      <div className="bulk-field">
        <input
          type="text"
          value={product}
          onChange={e => setProduct(e.target.value)}
          placeholder="Product"
          className="bulk-input"
        />
        <button 
          className="bulk-btn"
          onClick={() => { onApply('product', product); }}
          disabled={!product}
        >
          Apply
        </button>
      </div>

      <div className="bulk-field">
        <label className="bulk-checkbox">
          <input
            type="checkbox"
            checked={offer}
            onChange={e => setOffer(e.target.checked)}
          />
          <span>Offer</span>
        </label>
        <button 
          className="bulk-btn"
          onClick={() => { onApply('offer', offer); }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<GroupedAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [debugData, setDebugData] = useState<string>('');
  
  // Load groups on mount
  useEffect(() => {
    api.getGroups()
      .then(setData)
      .catch(err => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  // Debug recording toggle
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording - fetch the debug data
      try {
        const response = await fetch('/api/debug/analysis');
        const debug = await response.json();
        setDebugData(JSON.stringify(debug, null, 2));
      } catch (err) {
        setDebugData('Failed to fetch debug data: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    } else {
      // Start recording - clear previous data
      setDebugData('');
    }
    setIsRecording(!isRecording);
  };

  const copyDebugData = () => {
    navigator.clipboard.writeText(debugData);
    alert('Debug data copied to clipboard!');
  };
  
  const handleGroupUpdate = async (groupId: string, updates: Partial<AdGroup>) => {
    try {
      await api.updateGroup(groupId, updates);
      // Refresh data
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };

  const handleAssetUpdate = async (groupId: string, assetId: string, updates: { headline?: string; description?: string }) => {
    try {
      await api.updateAsset(groupId, assetId, updates);
      // Refresh data
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Failed to update asset:', err);
    }
  };

  const handleBulkApply = useCallback(async (field: string, value: string | boolean) => {
    if (!data) return;
    
    try {
      // Apply to all groups
      for (const group of data.groups) {
        await api.updateGroup(group.id, { [field]: value });
      }
      // Refresh data
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Bulk apply failed:', err);
    }
  }, [data]);

  const handleRenumber = useCallback(async (startNumber: number) => {
    try {
      const response = await fetch('/api/groups/renumber', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_number: startNumber }),
      });
      if (!response.ok) throw new Error('Renumber failed');
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Renumber failed:', err);
    }
  }, []);

  const handleRegroupAsset = useCallback(async (assetId: string, targetGroupId: string | null) => {
    try {
      const newData = await api.regroupAsset(assetId, targetGroupId);
      setData(newData);
    } catch (err) {
      console.error('Failed to regroup asset:', err);
    }
  }, []);
  
  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportCsv();
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };
  
  // Helper to extract number from filename for sorting
  const getFirstFilename = (group: AdGroup): string => {
    if (group.assets.length === 0) return '';
    return group.assets[0].asset.name;
  };

  const extractNumber = (filename: string): number => {
    const match = filename.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  };

  // Sort groups by first asset's filename (numeric then alpha)
  const sortedGroups = data?.groups.slice().sort((a, b) => {
    const aName = getFirstFilename(a);
    const bName = getFirstFilename(b);
    const aNum = extractNumber(aName);
    const bNum = extractNumber(bName);
    
    // If both have leading numbers, sort numerically
    if (aNum !== Infinity && bNum !== Infinity) {
      return aNum - bNum;
    }
    // Otherwise sort alphabetically
    return aName.localeCompare(bName);
  }) || [];

  // Count total assets
  const totalAssets = sortedGroups.reduce((sum, g) => sum + g.assets.length, 0);
  
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading assets...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error-page">
        <h2>Error</h2>
        <p>{error}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Back to Setup
        </button>
      </div>
    );
  }
  
  if (!data || data.groups.length === 0) {
    return (
      <div className="empty-page">
        <h2>No Assets Found</h2>
        <p>No assets were detected. Try with a different folder.</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Back to Setup
        </button>
      </div>
    );
  }
  
  return (
    <div className="review-page">
      <div className="review-header">
        <div className="review-title">
          <h2>Review Assets</h2>
          <p>
            {totalAssets} asset{totalAssets !== 1 ? 's' : ''} in {data.groups.length} group{data.groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <div className="review-actions">
          <button 
            className={`btn-debug ${isRecording ? 'recording' : ''}`} 
            onClick={handleToggleRecording}
          >
            {isRecording ? '⏹ Stop Recording' : '🔴 Record Debug'}
          </button>
          
          <button className="btn-secondary" onClick={() => navigate('/')}>
            New Analysis
          </button>
          
          <button
            className="btn-success"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {isRecording && (
        <div className="debug-recording-indicator">
          <span className="recording-dot"></span>
          Recording... Make changes, then click "Stop Recording" to capture debug data.
        </div>
      )}

      {!isRecording && debugData && (
        <div className="debug-panel">
          <div className="debug-header">
            <span>Debug Data (click to copy)</span>
            <button className="debug-copy-btn" onClick={copyDebugData}>
              📋 Copy to Clipboard
            </button>
            <button className="debug-clear-btn" onClick={() => setDebugData('')}>
              ✕ Clear
            </button>
          </div>
          <pre className="debug-content">{debugData}</pre>
        </div>
      )}

      <BulkApplyToolbar 
        onApply={handleBulkApply} 
        onRenumber={handleRenumber}
        currentStartNumber={sortedGroups[0]?.ad_number || 1}
      />
      
      <AssetTable
        groups={sortedGroups}
        onUpdateGroup={handleGroupUpdate}
        onUpdateAsset={handleAssetUpdate}
        onRegroupAsset={handleRegroupAsset}
      />
      
      {data.ungrouped.length > 0 && (
        <div className="ungrouped-section">
          <h3>Ungrouped Assets ({data.ungrouped.length})</h3>
          <div className="ungrouped-list">
            {data.ungrouped.map(asset => (
              <div key={asset.asset.id} className="ungrouped-item">
                <span className="ungrouped-name">{asset.asset.name}</span>
                <span className="badge badge-warning">{asset.placement}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style>{`
        .review-page {
          max-width: 1600px;
          margin: 0 auto;
        }
        
        .review-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: var(--space-lg);
          flex-wrap: wrap;
          gap: var(--space-md);
        }
        
        .review-title h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: var(--space-xs);
        }
        
        .review-title p {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        
        .review-actions {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }
        .bulk-toolbar {
          display: flex;
          align-items: center;
          gap: var(--space-lg);
          padding: var(--space-md) var(--space-lg);
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          flex-wrap: wrap;
        }

        .bulk-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .bulk-field {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }

        .bulk-input {
          width: 140px;
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
        }

        .bulk-input-number {
          width: 70px;
          text-align: center;
        }

        .bulk-input:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .bulk-input::placeholder {
          color: var(--text-muted);
        }

        .bulk-btn {
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s;
        }

        .bulk-btn:hover:not(:disabled) {
          background: var(--border-color);
          color: var(--text-primary);
        }

        .bulk-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .bulk-checkbox {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          font-size: 0.8rem;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .bulk-checkbox input {
          width: 16px;
          height: 16px;
          accent-color: var(--accent-primary);
        }

        .btn-debug {
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          background: var(--bg-tertiary);
          color: var(--text-muted);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-debug:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .btn-debug.recording {
          background: rgba(248, 81, 73, 0.15);
          border-color: var(--accent-danger);
          color: var(--accent-danger);
        }

        .debug-recording-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid var(--accent-danger);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          font-size: 0.75rem;
          color: var(--accent-danger);
        }

        .recording-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-danger);
          border-radius: 50%;
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .debug-clear-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          background: transparent;
          color: var(--text-muted);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          cursor: pointer;
          margin-left: var(--space-sm);
        }

        .debug-clear-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .debug-panel {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }

        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .debug-copy-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          background: var(--accent-primary);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        .debug-copy-btn:hover {
          opacity: 0.9;
        }

        .debug-content {
          padding: var(--space-md);
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: var(--text-secondary);
          max-height: 300px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
        
        .ungrouped-section {
          margin-top: var(--space-2xl);
          padding-top: var(--space-lg);
          border-top: 1px solid var(--border-color);
        }
        
        .ungrouped-section h3 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }
        
        .ungrouped-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
        }
        
        .ungrouped-item {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--space-sm) var(--space-md);
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        
        .ungrouped-name {
          font-size: 0.875rem;
          font-family: var(--font-mono);
        }
        
        .error-page, .empty-page {
          text-align: center;
          padding: var(--space-2xl);
        }
        
        .error-page h2, .empty-page h2 {
          font-size: 1.5rem;
          margin-bottom: var(--space-md);
        }
        
        .error-page p, .empty-page p {
          color: var(--text-secondary);
          margin-bottom: var(--space-lg);
        }
      `}</style>
    </div>
  );
}
