const INTENT_PROMPT = (signalText) => `Определи, ищет ли автор этого сообщения исполнителя для разработки
сайта, бота, платформы, автоматизации или AI-решения.

Ответь строго в JSON:
{"intent": "yes"|"no"|"unclear", "reason": "краткое объяснение до 10 слов"}

yes — автор прямо ищет или спрашивает про исполнителя/цену/подрядчика
no — обсуждение на тему, жалоба без запроса, реклама, оффтоп
unclear — непонятно из контекста

Сообщение: «${signalText}»`;

/**
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {string} signalText
 * @returns {Promise<{ intent: 'yes' | 'no' | 'unclear', reason: string }>}
 */
export async function classifyIntent(openrouter, signalText) {
  try {
    // temperature: 0 for consistency; systemPrompt: null — the default
    // job-planning AGENT_SYSTEM_PROMPT would only confuse this one-off
    // classification, it has nothing to do with parser jobs.
    const { content } = await openrouter.chat(
      [{ role: 'user', content: INTENT_PROMPT(signalText) }],
      { temperature: 0, systemPrompt: null },
    );

    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);
    const intent = ['yes', 'no', 'unclear'].includes(parsed?.intent) ? parsed.intent : 'unclear';
    const reason = typeof parsed?.reason === 'string' ? parsed.reason : 'ошибка классификации';
    return { intent, reason };
  } catch {
    return { intent: 'unclear', reason: 'ошибка классификации' };
  }
}
