export type CartographerStage = 'search' | 'extract' | 'enrich' | 'score' | 'done';
export type CartographerStatus = 'running' | 'completed' | 'failed';

export interface CartographerRun {
  id: string;
  status: CartographerStatus;
  stage: CartographerStage;
  found: number;
  enriched: number;
  campaignId: string;
  niche: string;
  region: string;
  error: string | null;
}

const API_BASE =
  (import.meta.env.VITE_CARTOGRAPHER_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/cartographer';

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
    throw new Error(res.ok ? 'Invalid JSON from cartographer API' : `Cartographer API ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function startCartographerRun(body: { niche: string; region: string; limit: number; enrich: boolean }) {
  return request<{ success: boolean; runId: string; campaignId: string }>('/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchCartographerRun(runId: string) {
  return request<{ success: boolean } & CartographerRun>(`/run/${encodeURIComponent(runId)}`);
}
