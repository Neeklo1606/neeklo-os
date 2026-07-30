export type RadarSourceType = 'telegram' | 'avito' | 'vc' | 'habr' | 'custom';

export interface RadarSource {
  id: string;
  type: RadarSourceType;
  identifier: string;
  label?: string;
  category?: string;
  active: boolean;
  lastCheckedAt: string | null;
  lastItemId: number | string | null;
  createdAt: string;
}

export interface RadarKeyword {
  id: string;
  phrase: string;
  category?: string;
  active: boolean;
  createdAt: string;
}

export type RadarSignalStatus = 'new' | 'replied' | 'irrelevant' | 'archived';
export type RadarCategory = 'A' | 'B' | 'C' | 'D';
export type RadarUrgency = 'high' | 'medium' | 'low';

export interface RadarSignalAiAnalysis {
  isRequest: boolean;
  solutionType: string | null;
  hasNiche: boolean;
  authorType: 'owner' | 'manager' | 'employee' | 'unknown';
  isVacancy: boolean;
  isCompetitorAd: boolean;
  isStudentProject: boolean;
  reason: string;
}

export interface RadarSignalBreakdownRow {
  criterion: string;
  points: number;
  matched: boolean;
}

export interface RadarSignal {
  id: string;
  channel: string;
  telegram_message_id?: number;
  source_url?: string;
  text: string;
  date: string | null;
  mediaUrl: string | null;
  views: number | null;
  matchedKeywords: string[];
  aiAnalysis?: RadarSignalAiAnalysis;
  aiReason?: string;
  signal_score?: number;
  urgency?: RadarUrgency;
  category?: RadarCategory;
  breakdown?: RadarSignalBreakdownRow[];
  evidence?: string;
  recommended_action?: string;
  author_name?: string | null;
  source_name?: string;
  status: RadarSignalStatus;
  leadId?: string;
  foundAt: string;
  createdAt: string;
}

export interface RadarStatus {
  lastRunAt: string | null;
  nextRunAt: string | null;
  running: boolean;
}

const API_BASE =
  (import.meta.env.VITE_RADAR_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/radar';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Invalid JSON from radar API' : `Radar API ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchRadarStatus() {
  return request<{ success: boolean } & RadarStatus>('/status');
}

export async function triggerRadarCheckNow() {
  return request<{ success: boolean; started: boolean; reason?: string }>('/check-now', { method: 'POST' });
}

export async function fetchRadarSignals(params?: { status?: RadarSignalStatus; channel?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.channel) qs.set('channel', params.channel);
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return request<{ success: boolean; signals: RadarSignal[]; total: number }>(q ? `/signals?${q}` : '/signals');
}

export async function updateRadarSignal(id: string, partial: Partial<RadarSignal>) {
  return request<{ success: boolean; signal: RadarSignal }>(`/signals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function convertSignalToLead(id: string) {
  return request<{ success: boolean; lead: { id: string } }>(`/signals/${encodeURIComponent(id)}/to-lead`, {
    method: 'POST',
  });
}

export async function fetchRadarSources() {
  return request<{ success: boolean; sources: RadarSource[]; total: number }>('/sources');
}

export async function createRadarSource(source: {
  type: RadarSourceType;
  identifier: string;
  label?: string;
  category?: string;
}) {
  return request<{ success: boolean; source: RadarSource }>('/sources', {
    method: 'POST',
    body: JSON.stringify(source),
  });
}

export async function createRadarSourcesBulk(usernames: string[]) {
  return request<{ success: boolean; created: RadarSource[]; skipped: number; total: number }>('/sources/bulk', {
    method: 'POST',
    body: JSON.stringify({ usernames }),
  });
}

export async function updateRadarSource(id: string, partial: Partial<RadarSource>) {
  return request<{ success: boolean; source: RadarSource }>(`/sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteRadarSource(id: string) {
  return request<{ success: boolean; id: string }>(`/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchRadarKeywords() {
  return request<{ success: boolean; keywords: RadarKeyword[]; total: number }>('/keywords');
}

export async function createRadarKeyword(keyword: { phrase: string; category?: string }) {
  return request<{ success: boolean; keyword: RadarKeyword }>('/keywords', {
    method: 'POST',
    body: JSON.stringify(keyword),
  });
}

export async function deleteRadarKeyword(id: string) {
  return request<{ success: boolean; id: string }>(`/keywords/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
