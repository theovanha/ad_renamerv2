import type { AnalyzeRequest, ConfigResponse, GroupedAssets, AdGroup, ExportRow, ProcessedAsset } from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export const api = {
  /**
   * Get application configuration defaults
   */
  async getConfig(): Promise<ConfigResponse> {
    return fetchJson<ConfigResponse>(`${API_BASE}/config`);
  },
  
  /**
   * Analyze assets in a folder
   */
  async analyze(request: AnalyzeRequest): Promise<GroupedAssets> {
    return fetchJson<GroupedAssets>(`${API_BASE}/analyze`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },
  
  /**
   * Get current grouped assets
   */
  async getGroups(): Promise<GroupedAssets> {
    return fetchJson<GroupedAssets>(`${API_BASE}/groups`);
  },
  
  /**
   * Update a group's fields
   */
  async updateGroup(
    groupId: string,
    updates: Partial<Pick<AdGroup, 'product' | 'angle' | 'hook' | 'creator' | 'offer' | 'campaign' | 'primary_text' | 'headline' | 'description' | 'cta' | 'url' | 'comment_media_buyer' | 'comment_client'>>
  ): Promise<AdGroup> {
    return fetchJson<AdGroup>(`${API_BASE}/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Update per-asset fields (for carousel cards)
   */
  async updateAsset(
    groupId: string,
    assetId: string,
    updates: { headline?: string; description?: string }
  ): Promise<ProcessedAsset> {
    return fetchJson<ProcessedAsset>(`${API_BASE}/groups/${groupId}/assets/${assetId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  
  /**
   * Bulk find/replace a field value
   */
  async bulkReplace(field: string, find: string, replace: string): Promise<GroupedAssets> {
    return fetchJson<GroupedAssets>(`${API_BASE}/bulk/replace`, {
      method: 'POST',
      body: JSON.stringify({ field, find, replace }),
    });
  },
  
  /**
   * Apply a field value to selected groups
   */
  async bulkApply(groupIds: string[], field: string, value: string): Promise<GroupedAssets> {
    return fetchJson<GroupedAssets>(`${API_BASE}/bulk/apply`, {
      method: 'POST',
      body: JSON.stringify({ group_ids: groupIds, field, value }),
    });
  },
  
  /**
   * Export CSV and trigger download
   */
  async exportCsv(): Promise<void> {
    const response = await fetch(`${API_BASE}/export`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Export failed' }));
      throw new Error(error.detail);
    }
    
    // Trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ad_names.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
  
  /**
   * Preview export data
   */
  async previewExport(): Promise<{ rows: ExportRow[] }> {
    return fetchJson<{ rows: ExportRow[] }>(`${API_BASE}/export/preview`);
  },

  /**
   * Move an asset to a different group or create a new group
   */
  async regroupAsset(assetId: string, targetGroupId: string | null): Promise<GroupedAssets> {
    return fetchJson<GroupedAssets>(`${API_BASE}/groups/regroup`, {
      method: 'PUT',
      body: JSON.stringify({ asset_id: assetId, target_group_id: targetGroupId }),
    });
  },
};
