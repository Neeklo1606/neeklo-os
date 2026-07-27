/**
 * NEEKLO Platform API (v2) client.
 *
 * Talks directly from the browser to https://cursor.neeklo.ru/api/v2.
 * CORS allows *.neeklo.ru origins, so no proxy is required in production.
 */

const API_BASE = 'https://cursor.neeklo.ru/api/v2';
const API_KEY = import.meta.env.VITE_NEEKLO_API_KEY as string;
const API_USER = 'dsc-23';

export interface Project {
  id: string;
  workspace: string;
  name: string;
  description: string | null;
  ide_url: string;
  created_at: string;
  published_url?: string | null;
}

export interface AgentStep {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
}

export interface AgentRun {
  id: number;
  status: 'running' | 'completed' | 'failed';
  mode: string;
  model: string;
  summary: string | null;
  files_changed: string[];
  steps: AgentStep[];
  published: boolean;
  published_url: string | null;
  error: string | null;
  tokens: number;
  created_at: string;
  completed_at: string | null;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  source: string;
  model: string | null;
  mode: string | null;
  created_at: string;
}

export interface AgentOptions {
  model?: string;
  mode?: 'agent' | 'plan' | 'ask';
  continue_session?: string;
}

interface ApiErrorShape {
  error?: { message?: string; type?: string } | string;
  message?: string;
}

const DEFAULT_MODEL = 'neeklo-aura';
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseError(res: Response): Promise<string> {
  let body: ApiErrorShape | null = null;
  try {
    body = (await res.json()) as ApiErrorShape;
  } catch {
    /* ignore */
  }
  if (body?.error && typeof body.error === 'object' && body.error.message) {
    return body.error.message;
  }
  if (typeof body?.error === 'string') return body.error;
  if (body?.message) return body.message;
  return `NEEKLO API ${res.status}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/* ---------- normalizers (API shapes → our interfaces) ---------- */

function normalizeProject(raw: Record<string, unknown>): Project {
  return {
    id: String(raw.id ?? raw.workspace ?? ''),
    workspace: String(raw.workspace ?? raw.id ?? ''),
    name: String(raw.name ?? raw.workspace ?? ''),
    description: (raw.description as string | null) ?? null,
    ide_url: String(raw.ide_url ?? ''),
    created_at: String(raw.created_at ?? ''),
    published_url: (raw.published_url as string | null | undefined) ?? null,
  };
}

function extractPublishedUrl(raw: Record<string, unknown>): string | null {
  if (typeof raw.published_url === 'string') return raw.published_url;
  if (typeof raw.url === 'string') return raw.url;
  const published = raw.published as Record<string, unknown> | undefined;
  if (published && typeof published.url === 'string') return published.url;
  return null;
}

function normalizeRun(raw: Record<string, unknown>): AgentRun {
  const filesRaw = raw.files_changed;
  let files: string[] = [];
  if (Array.isArray(filesRaw)) {
    files = filesRaw.map((f) =>
      typeof f === 'string' ? f : String((f as Record<string, unknown>)?.path ?? ''),
    ).filter(Boolean);
  }

  const published = raw.published;
  const publishedUrl =
    published && typeof published === 'object'
      ? ((published as Record<string, unknown>).url as string | undefined) ?? null
      : null;

  return {
    id: Number(raw.run_id ?? raw.id ?? 0),
    status: (raw.status as AgentRun['status']) ?? 'completed',
    mode: String(raw.mode ?? 'agent'),
    model: String(raw.model ?? DEFAULT_MODEL),
    summary: (raw.summary as string | null) ?? null,
    files_changed: files,
    steps: Array.isArray(raw.steps)
      ? (raw.steps as Record<string, unknown>[]).map((s) => ({
          tool: String(s.tool ?? s.type ?? 'step'),
          input: s.input ?? null,
          output: s.output ?? null,
          ok: s.ok !== undefined ? Boolean(s.ok) : s.status === 'success',
        }))
      : [],
    published: Boolean(published),
    published_url: publishedUrl,
    error: (raw.error as string | null) ?? null,
    tokens: Number(raw.tokens ?? 0),
    created_at: String(raw.created_at ?? ''),
    completed_at: (raw.completed_at as string | null) ?? null,
  };
}

function normalizeMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: Number(raw.id ?? 0),
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content: String(raw.content ?? ''),
    source: String(raw.source ?? 'api'),
    model: (raw.model as string | null) ?? null,
    mode: (raw.mode as string | null) ?? null,
    created_at: String(raw.created_at ?? ''),
  };
}

class NeekloApiService {
  readonly user = API_USER;

  /* ---------- Auth ---------- */

  async getMe(): Promise<{ username: string; display_name: string; api_version: string }> {
    const data = await apiFetch<Record<string, unknown>>('/me');
    return {
      username: String(data.username ?? ''),
      display_name: String(data.display_name ?? data.username ?? ''),
      api_version: String(data.api_version ?? 'v2'),
    };
  }

  /* ---------- Projects ---------- */

  async listProjects(): Promise<Project[]> {
    const data = await apiFetch<{ data?: Record<string, unknown>[] }>('/projects');
    return (data.data ?? []).map(normalizeProject);
  }

  async createProject(workspace: string, name?: string): Promise<Project> {
    const data = await apiFetch<Record<string, unknown>>('/projects', {
      method: 'POST',
      body: JSON.stringify({ workspace, name: name ?? workspace }),
    });
    return normalizeProject(data);
  }

  async getProject(slug: string): Promise<Project & { published_url: string | null }> {
    const data = await apiFetch<Record<string, unknown>>(`/projects/${encodeURIComponent(slug)}`);
    const project = normalizeProject(data);
    return { ...project, published_url: extractPublishedUrl(data) };
  }

  /** Create project if it does not exist yet; returns it either way. */
  async ensureProject(workspace: string, name?: string): Promise<Project> {
    const projects = await this.listProjects();
    const existing = projects.find((p) => p.workspace === workspace);
    if (existing) return existing;
    return this.createProject(workspace, name);
  }

  /* ---------- Agent ---------- */

  async runAgent(slug: string, prompt: string, options: AgentOptions = {}): Promise<AgentRun> {
    const data = await apiFetch<Record<string, unknown>>(
      `/projects/${encodeURIComponent(slug)}/agent`,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          model: options.model ?? DEFAULT_MODEL,
          mode: options.mode ?? 'agent',
          ...(options.continue_session ? { continue_session: options.continue_session } : {}),
        }),
      },
    );
    return normalizeRun(data);
  }

  async pollRun(slug: string, runId: number, intervalMs = 3000): Promise<AgentRun> {
    const started = Date.now();
    for (;;) {
      const run = await this.getRun(slug, runId);
      if (run.status !== 'running') return run;
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        throw new Error('Agent run timed out after 10 minutes');
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async runAgentAndWait(slug: string, prompt: string, options: AgentOptions = {}): Promise<AgentRun> {
    const run = await this.runAgent(slug, prompt, options);
    if (run.status === 'running') {
      return this.pollRun(slug, run.id);
    }
    return run;
  }

  /* ---------- Publish ---------- */

  async publishProject(slug: string): Promise<{ url: string }> {
    const data = await apiFetch<Record<string, unknown>>(
      `/projects/${encodeURIComponent(slug)}/publish`,
      { method: 'POST', body: '{}' },
    );
    const url = extractPublishedUrl(data) ?? `https://view.neeklo.ru/${API_USER}-${slug}/`;
    return { url };
  }

  async getPublishStatus(
    slug: string,
  ): Promise<{ published_url: string | null; published_at: string | null }> {
    const data = await apiFetch<Record<string, unknown>>(
      `/projects/${encodeURIComponent(slug)}/publish`,
    );
    return {
      published_url: extractPublishedUrl(data),
      published_at: (data.published_at as string | null) ?? null,
    };
  }

  /* ---------- Chat ---------- */

  /**
   * Streams an assistant reply token-by-token via SSE.
   * `onChunk` is called with each text delta, then once with '' to signal completion.
   * Pass `options.systemPrompt` to inject a one-off system message (not persisted as a user turn).
   */
  async streamChat(
    slug: string,
    message: string,
    onChunk: (text: string) => void,
    options: { model?: string; systemPrompt?: string } = {},
  ): Promise<void> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: message });

    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(slug)}/chat/completions`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          model: options.model ?? DEFAULT_MODEL,
          stream: true,
          messages,
        }),
      },
    );

    if (!res.ok || !res.body) {
      throw new Error(await parseError(res));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const delta =
            obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content ?? '';
          if (delta) onChunk(delta);
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }

    onChunk('');
  }

  async getChatHistory(slug: string): Promise<ChatMessage[]> {
    const data = await apiFetch<{ data?: Record<string, unknown>[] }>(
      `/projects/${encodeURIComponent(slug)}/chat/history?limit=500`,
    );
    return (data.data ?? []).map(normalizeMessage);
  }

  async appendMessage(
    slug: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    await apiFetch(`/projects/${encodeURIComponent(slug)}/chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, content, source: 'api' }),
    });
  }

  /* ---------- Files ---------- */

  async listFiles(slug: string): Promise<{ path: string; size: number }[]> {
    const data = await apiFetch<{ data?: Record<string, unknown>[] }>(
      `/projects/${encodeURIComponent(slug)}/files`,
    );
    return (data.data ?? []).map((f) => ({
      path: String(f.path ?? ''),
      size: Number(f.size ?? 0),
    }));
  }

  async readFile(slug: string, path: string): Promise<string> {
    const data = await apiFetch<Record<string, unknown>>(
      `/projects/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`,
    );
    return String(data.content ?? data.data ?? '');
  }

  async writeFile(slug: string, path: string, content: string): Promise<void> {
    await apiFetch(`/projects/${encodeURIComponent(slug)}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    });
  }

  /* ---------- Runs ---------- */

  async listRuns(slug: string): Promise<AgentRun[]> {
    const data = await apiFetch<{ data?: Record<string, unknown>[] }>(
      `/projects/${encodeURIComponent(slug)}/runs`,
    );
    return (data.data ?? []).map(normalizeRun);
  }

  async getRun(slug: string, runId: number): Promise<AgentRun> {
    const data = await apiFetch<Record<string, unknown>>(
      `/projects/${encodeURIComponent(slug)}/runs/${runId}`,
    );
    return normalizeRun(data);
  }
}

export const neekloApi = new NeekloApiService();
