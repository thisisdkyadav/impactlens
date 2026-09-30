export type Page =
  'overview' | 'evidence' | 'projects' | 'compare' | 'reports' | 'activity' | 'settings';
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'reviewer';
}
export interface Analysis {
  provider?: string;
  model?: string;
  summary?: string;
  tags?: string[];
  activities?: string[];
  signals?: string[];
  uncertainty?: string[];
  confidence?: number | null;
  suggestedProject?: string;
  sampledFrames?: number;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  location: string;
  category: string;
  color: string;
  created_at: string;
  assets: number;
  approved: number;
}
export interface Asset {
  id: string;
  project_id: string;
  title: string;
  filename: string;
  kind: 'image' | 'video';
  mime: string;
  url: string;
  thumbnail: string;
  public_id?: string;
  cloud_asset_id?: string;
  version?: number;
  sha256: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  captured_at: string;
  location: string;
  phase: string;
  notes: string;
  consent: boolean;
  status: string;
  review: string;
  review_note: string;
  analysis: Analysis;
  demo: boolean;
  created_at: string;
  indexed: boolean;
  score?: number;
}
export interface AuditEvent {
  id: number;
  actor: string;
  action: string;
  entity_id: string;
  detail: string;
  created_at: string;
  previous_hash: string;
  hash: string;
}
export interface Derivative {
  id: string;
  preset: string;
  url: string;
  transformation: string;
  created_at: string;
}
export interface AssetDetail extends Asset {
  project: Project;
  history: AuditEvent[];
  derivatives: Derivative[];
}
export interface Comparison {
  id: string;
  project_id: string;
  before_id: string;
  after_id: string;
  created_at: string;
  analysis: {
    provider: string;
    summary: string;
    changes: string[];
    limitations: string[];
    comparable: boolean;
    model?: string;
  };
}
export interface Metric {
  label: string;
  value: number;
  unit: string;
  evidenceId: string;
  method: string;
}
export interface Report {
  id: string;
  title: string;
  project_id: string;
  status: string;
  created_at: string;
  body: {
    title: string;
    project: Project;
    generatedAt: string;
    narrative: string;
    evidence: (Asset & { reference: string })[];
    metrics: Metric[];
    comparisons: Comparison[];
    disclaimer: string;
    audit: { valid: boolean; head: string; count: number };
  };
}
export interface Job {
  id: string;
  title: string;
  asset_id: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}
export interface Settings {
  demo: boolean;
  cloudinary: boolean;
  vision: boolean;
  embeddingModel: string;
  visionModel: string;
  maxUploadMB: number;
  storage: string;
  workspace: string;
}
export interface Dashboard {
  totals: {
    assets: number;
    approved: number;
    pending: number;
    videos: number;
    projects: number;
    reports: number;
  };
  projects: Project[];
  timeline: { month: string; count: number }[];
  recent: Asset[];
  activity: AuditEvent[];
  processing: number;
}
export interface AssetResult {
  assets: Asset[];
  total: number;
  page: number;
  pages: number;
  searchMode: string;
}
