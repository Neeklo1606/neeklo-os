import { createOpportunity } from './opportunities-db.mjs';

const yesNo = (v) => (v ? 'да' : 'нет');

function buildFlagsSummary(audit) {
  if (!audit) return 'аудит ещё не проводился';
  const messengers = Array.isArray(audit.messenger_links) && audit.messenger_links.length > 0
    ? audit.messenger_links.join(', ')
    : 'нет';
  return `сайт существует: ${yesNo(audit.website_exists)}, онлайн-запись: ${yesNo(audit.booking_exists)}, каталог: ${yesNo(audit.catalog_exists)}, личный кабинет: ${yesNo(audit.personal_account_exists)}, дилерский раздел: ${yesNo(audit.dealer_section_exists)}, форма заявки: ${yesNo(audit.form_exists)}, CRM-виджет: ${yesNo(audit.crm_widget_detected)}, аналитика: ${yesNo(audit.analytics_detected)}, мессенджеры: ${messengers}`;
}

/**
 * NEEKLO's outreach rules (per the operational strategy) are spelled out
 * explicitly in the prompt rather than left implicit — a generic "write a
 * cold outreach message" prompt drifts toward selling "a website/bot/AI"
 * in the first line, which is exactly what the strategy forbids.
 * @param {{ name?: string, city?: string, website?: string }} company
 * @param {import('./audit-db.mjs').DigitalAudit | null} audit
 * @param {{ label?: string, productArchetype?: string } | null} vertical
 */
function buildPrompt(company, audit, vertical) {
  const name = company?.name ?? 'компания';
  const city = company?.city ?? '';
  const verticalLabel = vertical?.label ?? 'не указана';
  const productArchetype = vertical?.productArchetype ?? 'не определён';
  const website = company?.website || 'нет';
  const observedGap = audit?.observed_gap || 'не определён';
  const conversionPath = audit?.key_conversion_path || 'не определён';
  const flagsSummary = buildFlagsSummary(audit);

  return `Ты помощник основателя digital-студии NEEKLO, готовишь первое сообщение для холодного аутрича.

ПРАВИЛА NEEKLO (обязательны):
- НЕ продавай «сайт», «бота» или «AI» в первом сообщении
- Начни с конкретного процесса, который может быть улучшен
- Структура сообщения: наблюдаемый факт → контекст → аккуратная гипотеза → короткая ценность → один вопрос
- Без давления, без ложной срочности, без неподтверждённых обещаний роста

Компания: ${name}, ${city}
Вертикаль: ${verticalLabel}
Продуктовый архетип NEEKLO: ${productArchetype}
Сайт: ${website}
Аудит: ${observedGap}
Путь конверсии: ${conversionPath}
Признаки: ${flagsSummary}

Составь JSON:
{
  "problem_hypothesis": "какая операционная проблема предполагается, 1 предложение, как гипотеза",
  "evidence_summary": "какие конкретные наблюдаемые признаки это подтверждают",
  "personalized_angle": "один конкретный повод написать именно этой компании именно сейчас",
  "recommended_offer": "какой первый оффер, не список технологий",
  "potential_budget_range": "диапазон как гипотеза, например 300-600к",
  "next_step": "конкретное действие для основателя",
  "message_draft": "первое сообщение по структуре: наблюдаемый факт → контекст → гипотеза → ценность → один вопрос. До 700 символов. Обращение на вы. Без давления."
}

Ответь строго JSON, без пояснений вокруг.`;
}

/**
 * Generates one Opportunity row for a company — one OpenRouter call
 * (temperature 0.3: the message needs natural phrasing, but the analysis
 * fields underneath it should stay grounded, not creative). Never sends
 * anything: every row is saved with human_approval: 'required', per the
 * strategy's rule that outreach is always sent manually by a human.
 *
 * Never throws — an AI failure still produces a row (with an empty draft
 * flagged for manual writing) rather than silently skipping the company,
 * matching enrich-company.mjs's audit-always-gets-a-row philosophy.
 * @param {import('./openrouter.mjs').ReturnType<typeof import('./openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {import('./companies-db.mjs').Company} company
 * @param {import('./audit-db.mjs').DigitalAudit | null} audit
 * @param {{ label?: string, productArchetype?: string } | null} vertical
 */
export async function generateOpportunity(openrouter, company, audit, vertical) {
  const prompt = buildPrompt(company, audit, vertical);
  const base = {
    company_id: company.id,
    product_archetype: vertical?.productArchetype ?? null,
    fit_score: typeof company?.fit_score === 'number' ? company.fit_score : null,
    sales_priority: company?.sales_priority ?? null,
    human_approval: 'required',
  };

  try {
    const { content } = await openrouter.chat([{ role: 'user', content: prompt }], {
      temperature: 0.3,
      systemPrompt: null,
    });
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(jsonText);

    return createOpportunity({
      ...base,
      problem_hypothesis: typeof parsed?.problem_hypothesis === 'string' ? parsed.problem_hypothesis : '',
      evidence_summary: typeof parsed?.evidence_summary === 'string' ? parsed.evidence_summary : '',
      potential_budget_range: typeof parsed?.potential_budget_range === 'string' ? parsed.potential_budget_range : '',
      recommended_offer: typeof parsed?.recommended_offer === 'string' ? parsed.recommended_offer : '',
      next_step: typeof parsed?.next_step === 'string' ? parsed.next_step : '',
      personalized_angle: typeof parsed?.personalized_angle === 'string' ? parsed.personalized_angle : '',
      message_draft: typeof parsed?.message_draft === 'string' ? parsed.message_draft.slice(0, 700) : '',
    });
  } catch (err) {
    console.error(`[generate-opportunity] AI generation failed for ${company.name ?? company.id}:`, err instanceof Error ? err.message : err);
    return createOpportunity({
      ...base,
      problem_hypothesis: '',
      evidence_summary: '',
      potential_budget_range: '',
      recommended_offer: '',
      next_step: 'Написать вручную — черновик не сгенерирован',
      personalized_angle: '',
      message_draft: '',
    });
  }
}
