import { parseAgentJson } from './agent-prompt.mjs';

const VALIDATE_PROMPT = `Ты — валидатор данных для CRM NEEKLO OS (/companies).
Проверь список организаций из парсера перед записью в базу.

Правила:
- name обязателен, минимум 2 символа, не placeholder ("null", "?", "XXXXX")
- phone: полный номер +7..., не маска "+7 (495) 2..." и не пустой если заявлен
- card_url / source_url: реальный URL, не placeholder XXXXX, для yandex — с numeric ID (/org/slug/123/)
- source: yandex | 2gis | manual | ...
- duplicate: если совпадает name+phone или source_url с existing — valid=false, issue="duplicate"
- confidence 0–1: насколько запись готова к импорту

Ответь ТОЛЬКО JSON:
{
  "summary": "краткий итог на русском",
  "items": [
    {
      "index": 0,
      "valid": true,
      "confidence": 0.9,
      "issues": [],
      "normalized": {
        "name": "...",
        "phone": "+7 ...",
        "address": "...",
        "city": "...",
        "website": "...",
        "source": "yandex",
        "source_url": "...",
        "niche": "...",
        "rating": 4.5,
        "reviewCount": 100,
        "industry": "..."
      }
    }
  ]
}`;

/**
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {{ orgs: unknown[], userQuery?: string, existing?: unknown[] }} input
 */
export async function validateOrgsWithAgent(openrouter, input) {
  const orgs = Array.isArray(input.orgs) ? input.orgs : [];
  const existing = Array.isArray(input.existing) ? input.existing : [];
  const userQuery = String(input.userQuery ?? '');

  if (orgs.length === 0) {
    return { summary: 'Нет организаций для проверки', items: [] };
  }

  const payload = JSON.stringify({ userQuery, orgs, existingCompanies: existing.slice(0, 50) }, null, 2);
  const { content } = await openrouter.chat([
    { role: 'user', content: `${VALIDATE_PROMPT}\n\nДанные:\n${payload}` },
  ]);

  const parsed = parseAgentJson(content);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Проверка завершена',
    items,
  };
}

/** Быстрая локальная проверка без LLM */
export function basicOrgValidation(org) {
  /** @type {string[]} */
  const issues = [];
  const name = typeof org?.name === 'string' ? org.name.trim() : '';
  if (!name || name.length < 2 || /^(null|undefined|\?)$/i.test(name)) {
    issues.push('Нет названия');
  }
  const phone = org?.phones?.[0] ?? org?.phone ?? '';
  if (typeof phone === 'string' && phone.includes('...')) {
    issues.push('Телефон замаскирован');
  }
  const url = org?.cardUrl ?? org?.source_url ?? org?.card_url ?? '';
  if (typeof url === 'string' && /XXXXX/i.test(url)) {
    issues.push('Некорректный URL карточки');
  }
  return { valid: issues.length === 0, issues };
}
