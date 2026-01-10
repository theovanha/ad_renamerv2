import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import GoogleSignIn from '../components/GoogleSignIn';
import { useGooglePicker } from '../hooks/useGooglePicker';
import type { AuthStatus } from '../types';

// Circular progress wheel component
function ProgressWheel({ message }: { message: string }) {
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef(Date.now());
  
  useEffect(() => {
    // Simulate progress based on time (0-95% over ~45 seconds, never quite reaches 100)
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      // Asymptotic curve: approaches 95% but never reaches it
      const newProgress = Math.min(95, 95 * (1 - Math.exp(-elapsed / 15)));
      setProgress(Math.round(newProgress));
    }, 200);
    
    return () => clearInterval(interval);
  }, []);
  
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  return (
    <div className="progress-wheel-container">
      <div className="progress-wheel">
        <svg viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--bg-tertiary, #2a2a3e)"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
        </svg>
        <div className="progress-percent">{progress}%</div>
      </div>
      <p className="progress-message">{message}</p>
    </div>
  );
}

export default function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [debugData, setDebugData] = useState<string>('');
  
  // Fetch auth status on mount
  useEffect(() => {
    api.getAuthStatus()
      .then(setAuthStatus)
      .catch(err => {
        console.error('Failed to get auth status:', err);
        setAuthStatus({ authenticated: false });
      });
  }, []);

  // Handle folder selected from picker
  const handleFolderSelected = useCallback((folderId: string, folderName: string) => {
    setFolderPath(folderId);
    setSelectedFolderName(folderName);
    setError(null);
  }, []);

  // Google Picker hook
  const { openPicker, isLoading: pickerLoading, isReady: pickerReady } = useGooglePicker({
    apiKey: authStatus?.picker_api_key || '',
    clientId: authStatus?.client_id || '',
    onFolderSelected: handleFolderSelected,
  });

  const handleAuthChange = useCallback(() => {
    api.getAuthStatus()
      .then(setAuthStatus)
      .catch(() => setAuthStatus({ authenticated: false }));
  }, []);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording - capture current state
      const debug: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        authStatus,
        folderPath,
        selectedFolderName,
        error,
        loading,
      };
      
      // Try to fetch backend config
      try {
        const configResp = await fetch('/api/config');
        debug.backendConfig = await configResp.json();
      } catch (e) {
        debug.backendConfigError = String(e);
      }
      
      // Try to fetch auth status from backend
      try {
        const authResp = await fetch('/api/auth/me', { credentials: 'include' });
        debug.backendAuthStatus = await authResp.json();
      } catch (e) {
        debug.backendAuthError = String(e);
      }

      // Try to fetch tokens info
      try {
        const tokensResp = await fetch('/api/auth/tokens', { credentials: 'include' });
        if (tokensResp.ok) {
          debug.hasTokens = true;
        } else {
          debug.hasTokens = false;
          debug.tokensError = await tokensResp.text();
        }
      } catch (e) {
        debug.tokensError = String(e);
      }
      
      setDebugData(JSON.stringify(debug, null, 2));
    } else {
      // Start recording - clear previous data
      setDebugData('');
    }
    setIsRecording(!isRecording);
  }, [isRecording, authStatus, folderPath, selectedFolderName, error, loading]);

  const copyDebugData = () => {
    navigator.clipboard.writeText(debugData);
  };

  const handleOpenPicker = async () => {
    try {
      await openPicker();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open picker');
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!folderPath.trim()) {
      setError('Please enter a folder path or select a Google Drive folder');
      return;
    }

    // Check if it's a Drive path and user isn't authenticated
    const isDrivePath = folderPath.includes('drive.google.com') || 
      (folderPath.length > 20 && !folderPath.startsWith('/') && !folderPath.includes(' '));
    
    if (isDrivePath && !authStatus?.authenticated) {
      setError('Please sign in with Google to access Drive folders');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // Progress messages for Drive sources
    const progressMessages = isDrivePath ? [
      'Connecting to Google Drive...',
      'Listing files in folder...',
      'Downloading assets for analysis...',
      'Extracting metadata...',
      'Running image analysis...',
      'Grouping similar assets...',
      'Almost done...',
    ] : [
      'Reading folder...',
      'Analyzing assets...',
      'Grouping similar assets...',
    ];
    
    let messageIndex = 0;
    setLoadingMessage(progressMessages[0]);
    
    // Cycle through messages every 3 seconds
    const messageInterval = setInterval(() => {
      messageIndex = Math.min(messageIndex + 1, progressMessages.length - 1);
      setLoadingMessage(progressMessages[messageIndex]);
    }, 3000);
    
    try {
      await api.analyze({
        folder_path: folderPath.trim(),
      });
      
      clearInterval(messageInterval);
      navigate('/review');
    } catch (err) {
      clearInterval(messageInterval);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };
  
  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h2>VANHA Creative Auto-Namer</h2>
          <p>Analyze and rename your ad assets from Google Drive or local folders</p>
        </div>

        {/* Google Sign In */}
        <GoogleSignIn authStatus={authStatus} onAuthChange={handleAuthChange} />
        
        <form onSubmit={handleSubmit} className="setup-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Drive Picker Button */}
          {authStatus?.authenticated && (
            <div className="picker-section">
              <button
                type="button"
                onClick={handleOpenPicker}
                disabled={!pickerReady || pickerLoading || loading}
                className="btn-picker"
              >
                {pickerLoading ? (
                  <>
                    <span className="spinner-sm"></span>
                    Opening...
                  </>
                ) : !pickerReady ? (
                  <>
                    <span className="spinner-sm"></span>
                    Loading Picker...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.71 3.5L1.15 15l3.43 6h13.71l3.43-6L15.16 3.5H7.71zm-.71 1h2.67l2.74 4.75H5.92l3.08-5.75zm6.62 0H16l3.08 5.75h-6.49L15.33 4.5zm4.84 6.75l-2.88 5h-2.61l2.88-5h2.61zm-9.92 0l2.88 5H8.81l-2.88-5h2.9zm-2.89 1l2.88 5H4.02l-2.29-4 1.91-1zm12.7 0l1.91 1-2.29 4h-2.51l2.89-5z"/>
                    </svg>
                    Open Google Drive
                  </>
                )}
              </button>
              {selectedFolderName && (
                <div className="selected-folder">
                  Selected: <strong>{selectedFolderName}</strong>
                </div>
              )}
              <div className="divider">
                <span>or paste a link / path</span>
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="folderPath">
              {authStatus?.authenticated ? 'Google Drive Link or Local Path' : 'Local Folder Path'}
            </label>
            <input
              id="folderPath"
              type="text"
              value={folderPath}
              onChange={e => {
                setFolderPath(e.target.value);
                setSelectedFolderName(null);
              }}
              placeholder={
                authStatus?.authenticated 
                  ? 'https://drive.google.com/drive/folders/... or /path/to/local'
                  : '/path/to/assets'
              }
              disabled={loading}
              autoFocus={!authStatus?.authenticated}
            />
            <span className="hint">
              {authStatus?.authenticated 
                ? 'Paste a Google Drive folder link, folder ID, or local path'
                : 'Sign in above to use Google Drive, or enter a local folder path'
              }
            </span>
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

          {/* Progress Indicator */}
          {loading && (
            <div className="progress-section">
              <ProgressWheel message={loadingMessage} />
            </div>
          )}

          {/* Debug Recorder */}
          <div className="debug-section">
            <button
              type="button"
              className={`btn-debug ${isRecording ? 'recording' : ''}`}
              onClick={handleToggleRecording}
            >
              {isRecording ? '⏹ Stop Recording' : '🔴 Record Debug'}
            </button>
          </div>
        </form>

        {/* Recording Indicator */}
        {isRecording && (
          <div className="debug-recording-indicator">
            <span className="recording-dot"></span>
            Recording... Try your action, then click "Stop Recording" to capture debug data.
          </div>
        )}

        {/* Debug Panel */}
        {!isRecording && debugData && (
          <div className="debug-panel">
            <div className="debug-header">
              <span>Debug Info</span>
              <div className="debug-actions">
                <button className="debug-copy-btn" onClick={copyDebugData}>
                  📋 Copy
                </button>
                <button className="debug-clear-btn" onClick={() => setDebugData('')}>
                  ✕ Clear
                </button>
              </div>
            </div>
            <pre className="debug-content">{debugData}</pre>
          </div>
        )}
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
          max-width: 520px;
        }
        
        .setup-header {
          margin-bottom: var(--space-lg);
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

        .picker-section {
          margin-bottom: var(--space-lg);
        }

        .btn-picker {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: var(--space-md);
          background: linear-gradient(135deg, #4285f4, #34a853, #fbbc05, #ea4335);
          background-size: 300% 300%;
          animation: gradient-shift 8s ease infinite;
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
        }

        .btn-picker:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .btn-picker:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .selected-folder {
          margin-top: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          background: rgba(52, 168, 83, 0.1);
          border: 1px solid rgba(52, 168, 83, 0.3);
          border-radius: var(--radius-sm);
          color: #34a853;
          font-size: 0.875rem;
        }

        .divider {
          display: flex;
          align-items: center;
          margin-top: var(--space-lg);
          color: var(--text-muted);
          font-size: 0.75rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-color);
        }

        .divider span {
          padding: 0 var(--space-md);
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

        .progress-section {
          margin-top: var(--space-xl);
          text-align: center;
        }

        .progress-wheel-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-md);
        }

        .progress-wheel {
          position: relative;
          width: 120px;
          height: 120px;
        }

        .progress-wheel svg {
          width: 100%;
          height: 100%;
          animation: rotate-wheel 8s linear infinite;
        }

        @keyframes rotate-wheel {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .progress-wheel svg circle:last-of-type {
          animation: none;
        }

        .progress-percent {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary, #fff);
          font-variant-numeric: tabular-nums;
        }

        .progress-message {
          font-size: 0.875rem;
          color: var(--text-secondary, #aaa);
          animation: fade-in-out 3s ease-in-out infinite;
          max-width: 300px;
        }

        @keyframes fade-in-out {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
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

        .debug-section {
          margin-top: var(--space-lg);
          padding-top: var(--space-md);
          border-top: 1px solid var(--border-color);
          text-align: center;
        }

        .btn-debug {
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          background: var(--bg-tertiary, #2a2a3e);
          color: var(--text-muted, #888);
          border: 1px solid var(--border-color, #333);
          border-radius: var(--radius-md, 6px);
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-debug:hover {
          background: var(--bg-secondary, #1e1e2e);
          color: var(--text-primary, #fff);
        }

        .btn-debug.recording {
          background: rgba(248, 81, 73, 0.15);
          border-color: var(--accent-danger, #f85149);
          color: var(--accent-danger, #f85149);
        }

        .debug-recording-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-sm, 0.5rem);
          padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
          margin-top: var(--space-md, 1rem);
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: var(--radius-md, 6px);
          color: var(--accent-danger, #f85149);
          font-size: 0.8rem;
        }

        .recording-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-danger, #f85149);
          border-radius: 50%;
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .debug-panel {
          margin-top: var(--space-lg);
          background: var(--bg-tertiary, #2a2a3e);
          border: 1px solid var(--border-color, #333);
          border-radius: var(--radius-md, 6px);
          overflow: hidden;
        }

        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-secondary, #1e1e2e);
          border-bottom: 1px solid var(--border-color, #333);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .debug-actions {
          display: flex;
          gap: 0.5rem;
        }

        .debug-copy-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          background: var(--accent-primary, #6366f1);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .debug-clear-btn {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
          background: transparent;
          color: var(--text-muted, #888);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          cursor: pointer;
        }

        .debug-content {
          padding: var(--space-md);
          margin: 0;
          font-family: monospace;
          font-size: 0.65rem;
          color: var(--text-secondary, #aaa);
          max-height: 300px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
