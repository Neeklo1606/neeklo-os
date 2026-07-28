export interface RadarChannel {
  id: string;
  username: string;
  title?: string;
  category?: string;
  active: boolean;
  lastMessageId: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface RadarKeyword {
  id: string;
  phrase: string;
  category?: string;
  active: boolean;
  createdAt: string;
}

export type RadarSignalStatus = 'new' | 'replied' | 'irrelevant';
export type RadarIntent = 'yes' | 'no' | 'unclear';

export interface RadarSignal {
  id: string;
  channel: string;
  telegram_message_id: number;
  text: string;
  date: string | null;
  mediaUrl: string | null;
  views: number | null;
  matchedKeywords: string[];
  aiIntent?: RadarIntent;
  aiReason?: string;
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

export async function fetchRadarChannels() {
  return request<{ success: boolean; channels: RadarChannel[]; total: number }>('/channels');
}

export async function createRadarChannel(channel: { username: string; title?: string; category?: string }) {
  return request<{ success: boolean; channel: RadarChannel }>('/channels', {
    method: 'POST',
    body: JSON.stringify(channel),
  });
}

export async function createRadarChannelsBulk(usernames: string[]) {
  return request<{ success: boolean; created: RadarChannel[]; skipped: number; total: number }>('/channels/bulk', {
    method: 'POST',
    body: JSON.stringify({ usernames }),
  });
}

export async function updateRadarChannel(id: string, partial: Partial<RadarChannel>) {
  return request<{ success: boolean; channel: RadarChannel }>(`/channels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteRadarChannel(id: string) {
  return request<{ success: boolean; id: string }>(`/channels/${encodeURIComponent(id)}`, {
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
