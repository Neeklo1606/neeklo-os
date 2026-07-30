import type { DigitalAudit } from '../../data/mock';

const API_BASE =
  (import.meta.env.VITE_AUDITS_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/audits';

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 404) return null;
  const text = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Invalid JSON from audits API' : `Audits API ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchAudit(companyId: string): Promise<DigitalAudit | null> {
  const data = await request<{ success: boolean; audit: DigitalAudit }>(
    `/${encodeURIComponent(companyId)}`,
  );
  return data?.audit ?? null;
}
