import { SECOND_PRIORITY } from './verticals.mjs';

/**
 * Strategy fit_score — a SEPARATE axis from score-company.mjs's `score`.
 * score-company.mjs measures digital-gap intensity (how badly does this
 * business need a website/booking/CRM); this measures whether THIS
 * company, in THIS vertical, is worth prioritizing for outreach at all.
 * A company can have a huge digital gap and a terrible fit_score (wrong
 * vertical, one-person shop, no way to reach a decision-maker), or vice
 * versa. Both get stored on the Company record; neither replaces the
 * other.
 *
 * Every criterion here reads from data that's actually populated today —
 * `audit` (server/audit-db.mjs) is currently populated by hand via
 * POST/PUT /api/audits, not by any automated pipeline, so `audit` will be
 * null for most companies until that changes. All audit-dependent
 * criteria below degrade to 0 (not a crash, not a guess) when audit is
 * null — that's the honest state of "we haven't audited this company
 * yet," not a fit failure.
 *
 * `company.employees` is deliberately NOT used for the "micro-business"
 * red flag below: cartographer-run.mjs hardcodes it to 0 for every
 * company it creates (never real data), so using it would red-flag every
 * single company in the database. See the red-flag section for what's
 * used instead.
 */

const SCALE_SIGNAL_RE = /филиал|сеть|несколько (точек|адресов|офисов)/i;
const WAREHOUSE_RE = /склад/i;
const GROWTH_SIGNAL_RE = /ваканси|набор сотрудников|открыт(ие|ие нового|ы новые)|новый филиал|расширени/i;

/** @param {import('./companies-db.mjs').Company} company @param {import('./verticals.mjs').Vertical | null} vertical */
function haystackOf(company) {
  return [company?.industry, company?.subsegment, company?.name, ...(Array.isArray(company?.niches) ? company.niches : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * @param {import('./companies-db.mjs').Company} company
 * @param {import('./verticals.mjs').Vertical | null} vertical
 */
function scoreVerticalFit(company, vertical) {
  const haystack = haystackOf(company);
  const looksSecondPriority = SECOND_PRIORITY.some((n) => haystack.includes(n.toLowerCase()));
  if (looksSecondPriority) {
    return { points: 0, met: false, label: 'Соответствие активной вертикали', note: 'текст компании похож на нишу второго приоритета, не на выбранную вертикаль' };
  }
  if (!vertical) {
    return { points: 0, met: false, label: 'Соответствие активной вертикали', note: 'вертикаль не указана' };
  }
  const subsegmentMatch = (vertical.subsegments ?? []).some((s) => haystack.includes(String(s).toLowerCase()));
  if (subsegmentMatch) {
    return { points: 15, met: true, label: 'Соответствие активной вертикали' };
  }
  if (company?.vertical) {
    // Tagged with a vertical (e.g. by the Cartographer run that collected
    // it) but nothing in the visible text confirms it against a specific
    // subsegment — partial trust, not the full 15.
    return { points: 8, met: true, label: 'Соответствие активной вертикали', note: 'помечено вертикалью, но нет явного совпадения по подсегменту' };
  }
  return { points: 0, met: false, label: 'Соответствие активной вертикали' };
}

/** @param {import('./companies-db.mjs').Company} company @param {import('./audit-db.mjs').DigitalAudit | null} audit */
function scoreScaleAndBudget(company, audit) {
  const haystack = haystackOf(company) + ' ' + String(company?.address ?? '').toLowerCase();
  const signals = [
    SCALE_SIGNAL_RE.test(haystack),
    WAREHOUSE_RE.test(haystack),
    Boolean(audit?.dealer_section_exists),
    Boolean(audit?.catalog_exists),
    Boolean(company?.legal_name),
  ];
  const matchedCount = signals.filter(Boolean).length;
  const points = Math.min(15, matchedCount * 5);
  return { points, met: points > 0, label: 'Масштаб и платёжеспособность', note: `${matchedCount} признак(ов) из 5` };
}

/** @param {import('./audit-db.mjs').DigitalAudit | null} audit */
function scoreOperationalProcess(audit) {
  const met = Boolean(audit?.dealer_section_exists || audit?.catalog_exists || audit?.booking_exists);
  return { points: met ? 15 : 0, met, label: 'Явный операционный процесс' };
}

/** @param {import('./audit-db.mjs').DigitalAudit | null} audit */
function scoreObservedGap(audit) {
  const met = Boolean(audit?.observed_gap && String(audit.observed_gap).trim());
  return { points: met ? 15 : 0, met, label: 'Наблюдаемая цифровая проблема' };
}

/** @param {import('./companies-db.mjs').Company} company */
function scoreGrowthSignals(company) {
  const haystack = haystackOf(company);
  const met = GROWTH_SIGNAL_RE.test(haystack);
  return {
    points: met ? 10 : 0,
    met,
    label: 'Признаки роста',
    note: met ? undefined : 'нет данных о вакансиях/новых филиалах/рекламе — не хватает источника, не считается недостатком',
  };
}

/** @param {import('./companies-db.mjs').Company} company */
function scoreDecisionMaker(company) {
  const met = Boolean(company?.decision_maker && String(company.decision_maker).trim());
  return { points: met ? 10 : 0, met, label: 'Наличие понятного ЛПР' };
}

/** @param {import('./companies-db.mjs').Company} company @param {import('./audit-db.mjs').DigitalAudit | null} audit */
function scoreContactAvailability(company, audit) {
  const hasWebsite = Boolean(String(company?.website ?? '').trim());
  const hasDirectContact = Boolean(
    company?.email || company?.email_public || company?.phone || company?.telegram_url || audit?.form_exists,
  );
  const points = (hasWebsite ? 5 : 0) + (hasDirectContact ? 5 : 0);
  return { points, met: points > 0, label: 'Доступность контакта', note: `сайт: ${hasWebsite ? 'да' : 'нет'}, прямой контакт: ${hasDirectContact ? 'да' : 'нет'}` };
}

/** @param {import('./companies-db.mjs').Company} company @param {import('./verticals.mjs').Vertical | null} vertical */
function scoreNeekloCaseStudy(company, vertical) {
  const haystack = haystackOf(company);
  const looksSecondPriority = SECOND_PRIORITY.some((n) => haystack.includes(n.toLowerCase()));
  const points = vertical && !looksSecondPriority ? 10 : 5;
  return { points, met: true, label: 'Релевантный кейс NEEKLO', note: vertical && !looksSecondPriority ? 'активная вертикаль — профильный кейс есть' : 'второй приоритет — кейс менее точный' };
}

/**
 * @param {import('./companies-db.mjs').Company} company
 * @param {import('./audit-db.mjs').DigitalAudit | null} audit
 * @param {{ verticalFit: number, scaleAndBudget: number, operationalProcess: number, observedGap: number, decisionMaker: number }} scores
 */
function checkRedFlags(company, audit, scores) {
  /** @type {{ flag: string, label: string }[]} */
  const flags = [];

  // "Микробизнес без бюджета" / "один сотрудник без процесса" — merged into
  // one check, deliberately NOT using company.employees (see file header:
  // that field is a hardcoded 0 placeholder, not real data). Requires
  // several weak signals to agree at once (no legal entity found, no scale
  // signals, near-zero review activity) rather than firing off one
  // unreliable field.
  if (!company?.legal_name && scores.scaleAndBudget === 0 && (company?.reviewCount ?? 0) < 5) {
    flags.push({ flag: 'microBusiness', label: 'Похоже на микробизнес без бюджета (нет юрлица, масштаба, активности)' });
  }

  if (audit?.crm_widget_detected) {
    flags.push({ flag: 'matureProductInUse', label: 'Уже используют зрелый отраслевой продукт (CRM-виджет обнаружен)' });
  }

  if (audit?.personal_account_exists) {
    flags.push({ flag: 'taskAlreadySolved', label: 'Личный кабинет уже есть — задача уже решена' });
  }

  // "Задача разовая до 100к" — no field on Company/DigitalAudit carries a
  // deal-size estimate (that lives on an Opportunity, scored separately,
  // per-opportunity, not per-company) — this can't be evaluated here.
  // Deliberately never fires rather than guessing.

  if (scores.verticalFit === 0 && scores.operationalProcess === 0 && scores.observedGap === 0 && scores.decisionMaker === 0) {
    flags.push({ flag: 'noEvidence', label: 'Нет доказательств, почему писать именно этой компании' });
  }

  return flags;
}

/** @param {number} score */
export function salesPriorityForScore(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

/**
 * @param {import('./companies-db.mjs').Company} company
 * @param {import('./audit-db.mjs').DigitalAudit | null} audit
 * @param {import('./verticals.mjs').Vertical | null} vertical
 * @returns {{ fit_score: number, breakdown: Record<string, unknown>, sales_priority: 'A' | 'B' | 'C' | 'D' }}
 */
export function scoreFit(company, audit, vertical) {
  const verticalFit = scoreVerticalFit(company, vertical);
  const scaleAndBudget = scoreScaleAndBudget(company, audit);
  const operationalProcess = scoreOperationalProcess(audit);
  const observedGap = scoreObservedGap(audit);
  const growthSignals = scoreGrowthSignals(company);
  const decisionMaker = scoreDecisionMaker(company);
  const contactAvailability = scoreContactAvailability(company, audit);
  const neekloCaseStudy = scoreNeekloCaseStudy(company, vertical);

  const rawTotal =
    verticalFit.points +
    scaleAndBudget.points +
    operationalProcess.points +
    observedGap.points +
    growthSignals.points +
    decisionMaker.points +
    contactAvailability.points +
    neekloCaseStudy.points;

  const redFlags = checkRedFlags(company, audit, {
    verticalFit: verticalFit.points,
    scaleAndBudget: scaleAndBudget.points,
    operationalProcess: operationalProcess.points,
    observedGap: observedGap.points,
    decisionMaker: decisionMaker.points,
  });

  let fit_score = Math.min(100, rawTotal);
  if (redFlags.length > 0) {
    fit_score = Math.min(fit_score, 34);
  }

  const breakdown = {
    verticalFit,
    scaleAndBudget,
    operationalProcess,
    observedGap,
    growthSignals,
    decisionMaker,
    contactAvailability,
    neekloCaseStudy,
    redFlags,
  };

  const sales_priority = redFlags.length > 0 ? 'D' : salesPriorityForScore(fit_score);

  return { fit_score, breakdown, sales_priority };
}
