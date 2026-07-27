import type {
  AgentChatResponse,
  ExecutedJob,
  ParserHealth,
  PlannedJob,
  RunPlanStatus,
} from './types';

const API_BASE = (import.meta.env.VITE_AGENT_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/agent';

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
      res.ok ? 'Invalid JSON from agent API' : `Agent API ${res.status}: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) {
    throw new Error(data?.error ?? `API ${res.status}`);
  }
  return data as T;
}

export async function fetchAgentConfig() {
  return request<{ success: boolean; config: Record<string, unknown> }>('/config');
}

export async function fetchParserHealth() {
  return request<{ success: boolean; health: ParserHealth }>('/health');
}

export async function fetchParserSources() {
  return request<{ sources: Array<{ id: string; displayName: string; requiresAuth: boolean }> }>(
    '/sources',
  );
}

export async function createParserJob(body: Record<string, unknown>) {
  return request<{ success: boolean; jobId: string; status: string }>('/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getParserJob(jobId: string) {
  return request<{ success: boolean; job: { status: string; result?: unknown; error?: string } }>(
    `/jobs/${jobId}`,
  );
}

export async function waitParserJob(jobId: string) {
  return request<{ success: boolean; job: { status: string; result?: unknown; error?: string } }>(
    `/jobs/${jobId}/wait`,
    { method: 'POST', body: '{}' },
  );
}

export async function agentChat(
  messages: Array<{ role: string; content: string }>,
  autoExecute: boolean,
): Promise<AgentChatResponse> {
  return request<AgentChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, autoExecute }),
  });
}

export async function runPlannedJobs(
  jobs: PlannedJob[],
  userText = '',
  niche?: string | null,
): Promise<ExecutedJob[]> {
  const started = await startRunPlan(jobs, userText, niche);
  return waitForRunPlan(started.runId);
}

export async function startRunPlan(
  jobs: PlannedJob[],
  userText = '',
  niche?: string | null,
): Promise<{ runId: string; status: string; niche?: string }> {
  return request<{ success: boolean; runId: string; status: string; niche?: string }>(
    '/run-plan',
    {
      method: 'POST',
      body: JSON.stringify({ jobs, userText, niche, async: true }),
    },
  );
}

export async function getRunPlanStatus(runId: string): Promise<RunPlanStatus> {
  const res = await request<{ success: boolean; run: RunPlanStatus }>(`/run-plan/${runId}`);
  return res.run;
}

export async function waitForRunPlan(
  runId: string,
  onUpdate?: (run: RunPlanStatus) => void,
  pollMs = 4000,
): Promise<ExecutedJob[]> {
  while (true) {
    const run = await getRunPlanStatus(runId);
    onUpdate?.(run);
    if (run.status === 'completed') return run.executed ?? [];
    if (run.status === 'failed') {
      throw new Error(run.error ?? 'План парсинга завершился с ошибкой');
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function validateOrgs(
  orgs: unknown[],
  userQuery: string,
  existing: unknown[] = [],
): Promise<import('./types').ValidateOrgsResponse> {
  return request('/validate-orgs', {
    method: 'POST',
    body: JSON.stringify({ orgs, userQuery, existing }),
  });
}

export async function fetchAgentSessions() {
  return request<{ success: boolean; sessions: import('./types').AgentSessionSummary[]; total: number }>(
    '/sessions',
  );
}

export async function fetchAgentSession(id: string) {
  return request<{ success: boolean; session: import('./types').AgentSession }>(
    `/sessions/${encodeURIComponent(id)}`,
  );
}

export async function createAgentSession(seed?: Partial<import('./types').AgentSession>) {
  return request<{ success: boolean; session: import('./types').AgentSession }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(seed ?? {}),
  });
}

export async function updateAgentSession(
  id: string,
  partial: Partial<import('./types').AgentSession>,
) {
  return request<{ success: boolean; session: import('./types').AgentSession }>(
    `/sessions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(partial),
    },
  );
}

export async function deleteAgentSession(id: string) {
  return request<{ success: boolean; id: string }>(`/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
