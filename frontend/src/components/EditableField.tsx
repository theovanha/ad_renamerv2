import { useState } from 'react';

interface EditableFieldProps {
  label: string;
  value: string;
  confidence?: number;
  onChange: (value: string) => void;
  options?: string[];
}

export default function EditableField({
  label,
  value,
  confidence,
  onChange,
  options,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  
  const handleSave = () => {
    if (tempValue !== value) {
      onChange(tempValue);
    }
    setEditing(false);
  };
  
  const handleCancel = () => {
    setTempValue(value);
    setEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };
  
  const getConfidenceClass = (val: number) => {
    if (val >= 0.7) return 'high';
    if (val >= 0.4) return 'medium';
    return 'low';
  };
  
  return (
    <div className="editable-field">
      <label>{label}</label>
      
      {editing ? (
        <div className="edit-mode">
          {options ? (
            <select
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              onBlur={handleSave}
              autoFocus
            >
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          )}
        </div>
      ) : (
        <div className="display-mode" onClick={() => { setTempValue(value); setEditing(true); }}>
          <span className="value">{value}</span>
          <span className="edit-icon">✎</span>
        </div>
      )}
      
      {confidence !== undefined && (
        <div className="confidence">
          <div className="confidence-bar">
            <div
              className={`confidence-fill ${getConfidenceClass(confidence)}`}
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <style>{`
        .editable-field {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        
        .editable-field label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .display-mode {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--space-sm) var(--space-md);
          cursor: pointer;
          transition: border-color 0.2s;
        }
        
        .display-mode:hover {
          border-color: var(--border-hover);
        }
        
        .display-mode .value {
          font-size: 0.875rem;
        }
        
        .display-mode .edit-icon {
          font-size: 0.75rem;
          color: var(--text-muted);
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .display-mode:hover .edit-icon {
          opacity: 1;
        }
        
        .edit-mode input,
        .edit-mode select {
          padding: var(--space-sm) var(--space-md);
        }
      `}</style>
    </div>
  );
}
