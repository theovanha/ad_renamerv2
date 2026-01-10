// Asset Types
export type AssetType = 'IMG' | 'VID';

export type Placement = 'story' | 'feed' | 'unknown';

export interface AssetMetadata {
  width: number;
  height: number;
  duration?: number;
  aspect_ratio: number;
}

export interface Asset {
  id: string;
  name: string;
  path: string;
  asset_type: AssetType;
  size_bytes?: number;
}

export interface ProcessedAsset {
  asset: Asset;
  metadata: AssetMetadata;
  placement: Placement;
  ocr_text: string;
  fingerprint: string;
  frame_paths: string[];
  thumbnail_url?: string;
  // Per-asset copy fields (for carousel cards)
  headline: string;
  description: string;
}

// Group Types
export type GroupType = 'standard' | 'carousel' | 'single';

export interface ConfidenceScores {
  group: number;
  product: number;
  angle: number;
  offer: number;
}

export interface AdGroup {
  id: string;
  group_type: GroupType;
  assets: ProcessedAsset[];
  ad_number: number;
  product: string;
  angle: string;
  hook: string;
  creator: string;
  offer: boolean;
  campaign: string;
  date: string;
  confidence: ConfidenceScores;
  format_token: string;
  // Copy fields
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  url: string;
  comment_media_buyer: string;
  comment_client: string;
}

export interface GroupedAssets {
  groups: AdGroup[];
  ungrouped: ProcessedAsset[];
}

// API Types
export interface AnalyzeRequest {
  folder_path: string;
  client?: string;
  campaign?: string;
  start_number?: number;
  date?: string;
}

export interface ConfigResponse {
  default_campaign: string;
  default_date: string;
  default_start_number: number;
  angle_options: string[];
  client_options: string[];
}

export interface ExportRow {
  file_id: string;
  old_name: string;
  new_name: string;
  group_id: string;
  group_type: string;
  placement_inferred: string;
  confidence_group: number;
  confidence_product: number;
  confidence_angle: number;
  confidence_offer: number;
}

// Angle options
export const ANGLE_OPTIONS = [
  'ProductFocus',
  'Offer',
  'Price',
  'SocialProof',
  'Education',
  'BehindTheScenes',
  'Founder',
  'Brand',
  'Newness',
] as const;

// Auth Types
export interface UserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: UserInfo;
  picker_api_key?: string;
  client_id?: string;
}

// Rename Types
export interface RenameResultItem {
  old_name: string;
  new_name: string;
  success: boolean;
  error?: string;
}

export interface RenameResult {
  total: number;
  success: number;
  failed: number;
  results: RenameResultItem[];
}
