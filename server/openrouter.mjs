import { AGENT_SYSTEM_PROMPT, parseAgentJson } from './agent-prompt.mjs';

/** @param {import('./config.mjs').AppConfig} config */
export function createOpenRouterClient(config) {
  async function chat(messages) {
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
        messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, ...messages],
        temperature: 0.2,
        max_tokens: 2048,
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
    return {
      message: typeof parsed.message === 'string' ? parsed.message : content,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      autoRun: Boolean(parsed.autoRun),
      niche: typeof parsed.niche === 'string' ? parsed.niche : null,
    };
  }

  return { chat, plan };
}
