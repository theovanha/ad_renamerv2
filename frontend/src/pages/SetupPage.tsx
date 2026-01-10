import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!folderPath.trim()) {
      setError('Please enter a folder path or Google Drive link');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await api.analyze({
        folder_path: folderPath.trim(),
      });
      
      navigate('/review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h2>VANHA Creative Auto-Namer</h2>
          <p>Paste a folder path to analyze and name your ad assets</p>
        </div>
        
        <form onSubmit={handleSubmit} className="setup-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="folderPath">Folder Path</label>
            <input
              id="folderPath"
              type="text"
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              placeholder="/path/to/assets or Google Drive link"
              disabled={loading}
              autoFocus
            />
            <span className="hint">Local folder path for now. Google Drive coming soon.</span>
          </div>
          
          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary btn-lg"
              disabled={loading || !folderPath.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner-sm"></span>
                  Analyzing...
                </>
              ) : (
                'Analyze Assets'
              )}
            </button>
          </div>
        </form>
      </div>
      
      <style>{`
        .setup-page {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 60vh;
          padding: var(--space-xl) 0;
        }
        
        .setup-container {
          width: 100%;
          max-width: 500px;
        }
        
        .setup-header {
          margin-bottom: var(--space-xl);
          text-align: center;
        }
        
        .setup-header h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: var(--space-sm);
        }
        
        .setup-header p {
          color: var(--text-secondary);
        }
        
        .setup-form {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
        }
        
        .error-message {
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid var(--accent-danger);
          border-radius: var(--radius-md);
          color: var(--accent-danger);
          padding: var(--space-md);
          margin-bottom: var(--space-lg);
        }
        
        .form-group input {
          font-size: 1rem;
          padding: var(--space-md);
        }
        
        .hint {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: var(--space-xs);
        }
        
        .form-actions {
          margin-top: var(--space-lg);
        }
        
        .btn-lg {
          width: 100%;
          padding: var(--space-md) var(--space-xl);
          font-size: 1rem;
        }
        
        .spinner-sm {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: var(--space-sm);
        }
      `}</style>
    </div>
  );
}
