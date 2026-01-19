import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { GroupedAssets, AdGroup } from '../types';
import AssetTable from '../components/AssetTable';

// Copy Doc Template type
interface CopyDocTemplate {
  id: string;
  file_id: string;
  name: string;
}

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
  const [creator, setCreator] = useState('');
  const [offer, setOffer] = useState(false);
  const [startNumber, setStartNumber] = useState(currentStartNumber);

  return (
    <div className="bulk-toolbar">
      {/* Starting Ad Number */}
      <span className="bulk-label">Starting Ad #:</span>
      <div className="bulk-field">
        <input
          type="number"
          value={startNumber}
          onChange={e => setStartNumber(parseInt(e.target.value) || 1)}
          min={1}
          className="bulk-input bulk-input-number"
          placeholder="1"
        />
        <button 
          className="bulk-btn"
          onClick={() => { onRenumber(startNumber); }}
        >
          Apply
        </button>
      </div>

      <div className="bulk-divider"></div>

      {/* Apply to all - Campaign, Product, Offer */}
      <span className="bulk-label">Apply to all:</span>
      
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
        <input
          type="text"
          value={creator}
          onChange={e => setCreator(e.target.value)}
          placeholder="Creator"
          className="bulk-input"
        />
        <button 
          className="bulk-btn"
          onClick={() => { onApply('creator', creator); }}
          disabled={!creator}
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

  const handleRegroupAsset = useCallback(async (assetId: string, targetGroupId: string | null, destinationIndex?: number) => {
    try {
      const newData = await api.regroupAsset(assetId, targetGroupId, destinationIndex);
      setData(newData);
    } catch (err) {
      console.error('Failed to regroup asset:', err);
    }
  }, []);

  const handleReorderAsset = useCallback(async (groupId: string, assetId: string, newIndex: number) => {
    try {
      await api.reorderAsset(groupId, assetId, newIndex);
      // Refresh data
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Failed to reorder asset:', err);
    }
  }, []);

  const handleUpdateAssetFilename = useCallback(async (groupId: string, assetId: string, customFilename: string) => {
    try {
      await api.updateAsset(groupId, assetId, { custom_filename: customFilename });
      // Refresh data
      const newData = await api.getGroups();
      setData(newData);
    } catch (err) {
      console.error('Failed to update filename:', err);
    }
  }, []);
  
  const [renaming, setRenaming] = useState(false);
  const [copyDocTemplates, setCopyDocTemplates] = useState<CopyDocTemplate[]>([]);
  const [copyDocOpen, setCopyDocOpen] = useState(false);
  const [copyingDoc, setCopyingDoc] = useState(false);
  const copyDocRef = useRef<HTMLDivElement>(null);

  // Load copy doc templates on mount
  useEffect(() => {
    api.getCopyDocTemplates()
      .then(res => setCopyDocTemplates(res.templates))
      .catch(err => console.error('Failed to load templates:', err));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (copyDocRef.current && !copyDocRef.current.contains(event.target as Node)) {
        setCopyDocOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copyProgress, setCopyProgress] = useState(0);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopyDoc = async (templateId: string) => {
    setCopyingDoc(true);
    setCopyProgress(0);
    setCopyDocOpen(false);
    
    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setCopyProgress(prev => Math.min(prev + 15, 90));
    }, 400);
    
    try {
      const result = await api.copyDocToFolder(templateId);
      clearInterval(progressInterval);
      setCopyProgress(100);
      setTimeout(() => {
        showSuccess(`✓ Added "${result.name}" to folder`);
        setCopyingDoc(false);
        setCopyProgress(0);
      }, 200);
    } catch (err) {
      clearInterval(progressInterval);
      const message = err instanceof Error ? err.message : 'Unknown error';
      showSuccess(`✗ Failed: ${message}`);
      setCopyingDoc(false);
      setCopyProgress(0);
    }
  };
  
  const handleRenameInDrive = async () => {
    if (!confirm('This will rename all files in Google Drive. Are you sure?')) {
      return;
    }
    
    setRenaming(true);
    try {
      const result = await api.renameFilesInDrive();
      if (result.failed > 0) {
        showSuccess(`✓ Renamed ${result.success}/${result.total} files (${result.failed} failed)`);
      } else {
        showSuccess(`✓ Renamed all ${result.total} files`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('only works with Google Drive')) {
        showSuccess('✗ Rename only works with Google Drive');
      } else {
        showSuccess(`✗ Rename failed: ${message}`);
      }
    } finally {
      setRenaming(false);
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
      {successMessage && (
        <div className="success-toast">{successMessage}</div>
      )}
      
      <div className="review-top-row">
        <div className="top-left">
          <button className="btn-home" onClick={() => navigate('/setup')} title="Back to Home">
            ← Home
          </button>
          <span className="mini-brand">VANHA AD RENAMER</span>
        </div>
        <div className="top-right">
          <button 
            className={`btn-debug ${isRecording ? 'recording' : ''}`} 
            onClick={handleToggleRecording}
          >
            {isRecording ? '⏹ Stop' : '🔴 Debug'}
          </button>
        </div>
      </div>
      
      <div className="review-actions-bar">
        <span className="asset-count">
          {totalAssets} asset{totalAssets !== 1 ? 's' : ''} in {data.groups.length} group{data.groups.length !== 1 ? 's' : ''}
        </span>
        
        <div className="review-actions">
          <button 
            className="btn-copy"
            onClick={() => {
              const adNames = sortedGroups.map(group => {
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
                return parts.join('_').replace(/__+/g, '_');
              }).join('\n');
              navigator.clipboard.writeText(adNames);
              showSuccess(`✓ Copied ${sortedGroups.length} ad names`);
            }}
            title="Copy all ad names (one per line for Google Sheets)"
          >
            📋 Copy Ad Names
          </button>
          
          <button
            className="btn-drive"
            onClick={handleRenameInDrive}
            disabled={renaming}
            title="Rename files directly in Google Drive"
          >
            {renaming ? 'Renaming...' : '📁 Rename in Drive'}
          </button>

          {/* Copy Doc dropdown */}
          <div className="copy-doc-dropdown" ref={copyDocRef}>
            <button
              className="btn-copy-doc"
              onClick={() => setCopyDocOpen(!copyDocOpen)}
              disabled={copyingDoc || copyDocTemplates.length === 0}
              title="Add a copy doc template to the folder"
            >
              {copyingDoc ? (
                <span className="copy-progress">
                  <span className="mini-spinner"></span>
                  {copyProgress}%
                </span>
              ) : '📄 Add Copy Doc ▾'}
            </button>
            {copyDocOpen && copyDocTemplates.length > 0 && (
              <div className="copy-doc-menu">
                {copyDocTemplates.map(template => (
                  <button
                    key={template.id}
                    className="copy-doc-item"
                    onClick={() => handleCopyDoc(template.id)}
                    disabled={copyingDoc}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            )}
          </div>
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
        onRegroupAsset={handleRegroupAsset}
        onReorderAsset={handleReorderAsset}
        onUpdateAssetFilename={handleUpdateAssetFilename}
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
          position: relative;
          max-width: 1600px;
          margin: 0 auto;
          padding-top: var(--space-sm);
        }

        .review-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-sm);
        }

        .top-left {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .top-right {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        
        .btn-home {
          padding: 0.3rem 0.6rem;
          font-size: 0.75rem;
          background: transparent;
          color: var(--text-muted);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-home:hover {
          color: var(--text-primary);
          border-color: var(--text-secondary);
        }

        .mini-brand {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          opacity: 0.6;
        }

        .review-actions-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-sm);
          padding: var(--space-xs) 0;
        }
        
        .asset-count {
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        
        .review-actions {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        .bulk-toolbar {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          flex-wrap: nowrap;
        }

        .bulk-divider {
          width: 1px;
          height: 24px;
          background: var(--border-color);
          margin: 0 var(--space-xs);
        }

        .bulk-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .bulk-field {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .bulk-input {
          width: 100px;
          padding: 0.35rem 0.5rem;
          font-size: 0.75rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
        }

        .bulk-input-number {
          width: 50px;
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
          padding: 0.3rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 500;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
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
          gap: 4px;
          font-size: 0.7rem;
          color: var(--text-secondary);
          cursor: pointer;
          white-space: nowrap;
        }

        .bulk-checkbox input {
          width: 14px;
          height: 14px;
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

        /* Copy Doc Dropdown */
        .copy-doc-dropdown {
          position: relative;
        }

        .copy-progress {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .mini-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .copy-doc-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          min-width: 200px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          z-index: 100;
          overflow: hidden;
        }

        .copy-doc-item {
          display: block;
          width: 100%;
          padding: 0.6rem 1rem;
          font-size: 0.8rem;
          text-align: left;
          background: transparent;
          color: var(--text-primary);
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }

        .copy-doc-item:hover:not(:disabled) {
          background: var(--bg-tertiary);
        }

        .copy-doc-item:not(:last-child) {
          border-bottom: 1px solid var(--border-color);
        }

        .copy-doc-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Success Toast */
        .success-toast {
          position: fixed;
          top: var(--space-lg);
          right: var(--space-lg);
          padding: 0.6rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--accent-success);
          border-radius: var(--radius-md);
          color: var(--accent-success);
          font-size: 0.8rem;
          font-weight: 500;
          z-index: 1000;
          animation: slideIn 0.2s ease-out;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
