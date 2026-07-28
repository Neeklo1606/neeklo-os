import { AGENT_SYSTEM_PROMPT, parseAgentJson } from './agent-prompt.mjs';

/** @param {import('./config.mjs').AppConfig} config */
export function createOpenRouterClient(config) {
  /**
   * @param {Array<{ role: string, content: string }>} messages
   * @param {{ temperature?: number, maxTokens?: number, systemPrompt?: string | null }} [opts]
   * systemPrompt defaults to the job-planning AGENT_SYSTEM_PROMPT for backward
   * compat with existing callers (extract-entities.mjs, validate-orgs.mjs);
   * pass `null` to omit it entirely (e.g. classify-intent.mjs's one-off prompt).
   */
  async function chat(messages, opts = {}) {
    const { temperature = 0.2, maxTokens = 2048, systemPrompt = AGENT_SYSTEM_PROMPT } = opts;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://view.neeklo.ru/osnee/',
        'X-Title': 'NEEKLO OS Agent',
      },
      body: JSON.stringify({
        model: config.openrouterModel,
        messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message ?? `OpenRouter ${res.status}`;
      throw new Error(msg);
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    return { content, raw: data };
  }

  async function plan(messages) {
    const { content } = await chat(messages);
    const parsed = parseAgentJson(content);
    const action =
      parsed.action && typeof parsed.action === 'object' && typeof parsed.action.type === 'string'
        ? { type: parsed.action.type, params: parsed.action.params ?? {} }
        : null;
    return {
      message: typeof parsed.message === 'string' ? parsed.message : content,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      autoRun: Boolean(parsed.autoRun),
      niche: typeof parsed.niche === 'string' ? parsed.niche : null,
      action,
    };
  }

  return { chat, plan };
}
