import type { Campaign, CampaignStatus } from '../../data/mock';

const API_BASE =
  (import.meta.env.VITE_CAMPAIGNS_API_URL as string | undefined)?.replace(/\/$/, '') ??
  '/api/campaigns';

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
    throw new Error(
      res.ok
        ? 'Invalid JSON from campaigns API'
        : `Campaigns API ${res.status}: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchCampaigns(params?: { search?: string; status?: CampaignStatus }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return request<{ success: boolean; campaigns: Campaign[]; total: number }>(q ? `?${q}` : '');
}

export async function fetchCampaign(id: string) {
  return request<{ success: boolean; campaign: Campaign }>(`/${encodeURIComponent(id)}`);
}

export async function createCampaignApi(campaign: Campaign) {
  return request<{ success: boolean; campaign: Campaign }>('', {
    method: 'POST',
    body: JSON.stringify(campaign),
  });
}

export async function createCampaignsBulk(campaigns: Campaign[]) {
  return request<{ success: boolean; created: Campaign[]; skipped: number; total: number }>(
    '/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ campaigns }),
    },
  );
}

export async function updateCampaignApi(id: string, partial: Partial<Campaign>) {
  return request<{ success: boolean; campaign: Campaign }>(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function deleteCampaignApi(id: string) {
  return request<{ success: boolean; id: string }>(`/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
